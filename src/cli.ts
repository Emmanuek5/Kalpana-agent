import "dotenv/config";
import readline from "node:readline";
import chalk from "chalk";
import { runAgent, cleanup as cleanupAgent } from "./agent";
import type { ModelMessage } from "ai";
import { launchSandbox, shutdownSandbox } from "./sandbox";
import { verifyDockerConnection } from "./tools/docker";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log(chalk.cyan("AI Container CLI"));
  // initialize sandbox once
  let runtime = process.env.SANDBOX_RUNTIME === "python" ? "python" : undefined;
  const hostVolumePath = process.env.SANDBOX_VOLUME_PATH || "./.sandbox";
  try {
    const ping = await verifyDockerConnection();
    console.log(
      chalk.gray(
        `Docker ok → version=${ping.version ?? "?"} api=${
          ping.apiVersion ?? "?"
        }`
      )
    );
  } catch (err) {
    const e = err as Error & { code?: string };
    console.error(
      chalk.red(
        `Docker connection failed: ${e.message}${
          e.code ? ` (code=${e.code})` : ""
        }\n` + `DOCKER_HOST=${process.env.DOCKER_HOST ?? "<unset>"}`
      )
    );
    process.exit(1);
  }
  if (!runtime) {
    const choice = await new Promise<string>((resolve) => {
      const prompt = `${chalk.yellow("Select runtime")} ${chalk.gray(
        "(1) node  (2) python"
      )} ${chalk.gray("[1]")}: `;
      rl.question(prompt, (ans) => resolve((ans || "1").trim()));
    });
    runtime = choice === "2" ? "python" : "node";
  }

  await launchSandbox(runtime as "node" | "python", hostVolumePath);
  console.log(
    chalk.gray(`Sandbox ready → runtime=${runtime} volume=${hostVolumePath}`)
  );
  console.log(chalk.cyan("Type your instruction. Ctrl+C to exit."));
  const history: ModelMessage[] = [];

  // graceful shutdown -> remove sandbox container and cleanup MCP
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    try {
      console.log(chalk.gray("Shutting down sandbox..."));
      await shutdownSandbox();
      console.log(chalk.gray("Sandbox removed."));

      console.log(chalk.gray("Cleaning up MCP connections..."));
      await cleanupAgent();
      console.log(chalk.gray("MCP cleanup complete."));
    } catch (e) {
      console.error(chalk.red(`Cleanup error: ${(e as Error).message}`));
    }
  };
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
  rl.on("close", async () => {
    await cleanup();
    process.exit(0);
  });
  for await (const line of rl) {
    const input = line.trim();
    if (!input) continue;
    try {
      process.stdout.write(chalk.gray("Thinking...\n"));
      const { text, messages } = await runAgent(input, history);
      history.splice(0, history.length, ...messages);
      process.stdout.write(chalk.green("\n" + text + "\n"));
    } catch (err) {
      const e = err as Error & { code?: string; stack?: string };

      // Log error but preserve conversation state
      process.stderr.write(
        chalk.red(
          `Critical Agent Error: ${e.message}${
            e.code ? ` (code=${e.code})` : ""
          }\n` + (process.env.DEBUG ? `${e.stack ?? ""}\n` : "")
        )
      );

      // Add error message to history to maintain conversation context
      const errorMessage = `I encountered a critical error and couldn't complete your request: ${e.message}. Please try again with a different approach.`;

      history.push(
        { role: "user", content: input },
        { role: "assistant", content: errorMessage }
      );

      process.stdout.write(chalk.yellow("\n" + errorMessage + "\n"));
    }
    process.stdout.write("\n> ");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
