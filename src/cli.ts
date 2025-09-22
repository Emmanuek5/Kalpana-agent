import "dotenv/config";
import readline from "node:readline";
import chalk from "chalk";
import { runAgent, cleanup as cleanupAgent } from "./agents";
import { mcpManager } from "./mcp";
import type { ModelMessage } from "ai";
import { launchSandbox, shutdownSandbox } from "./sandbox";
import {
  verifyDockerConnection,
  stopAllManagedContainers,
} from "./tools/docker";
import { formatResponse } from "./markdown";
import fs from "node:fs/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  console.log(chalk.cyan("AI Container CLI - Multi-Runtime"));
  // Flags
  const saveHistory =
    process.argv.includes("--save-history") ||
    process.argv.includes("--history");
  const historyFile = process.env.HISTORY_FILE || "history.json";
  // Use multi-runtime container (contains Node.js, Bun, and Python pre-installed)
  const runtime = "bun"; // Default runtime for container launch (all runtimes available)
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

  // Start MCP loading silently in background
  mcpManager.startLoadingFromConfig().catch((error) => {
    console.error(chalk.red(`MCP initialization failed: ${error.message}`));
  });

  await launchSandbox(runtime, hostVolumePath);
  console.log(
    chalk.gray(
      `Multi-runtime container ready → all runtimes available (node, bun, python) → volume=${hostVolumePath}`
    )
  );

  // No automatic MCP status output; use '/mcp' command to view

  console.log(chalk.cyan("Type your instruction. Ctrl+C to exit."));
  const history: ModelMessage[] = [];

  // Helper: persist history to disk
  const persistHistory = async () => {
    try {
      await fs.writeFile(historyFile, JSON.stringify(history, null, 2), "utf8");
      console.log(chalk.gray(`Saved history to ${historyFile}`));
    } catch (e) {
      console.error(
        chalk.red(
          `Failed to save history to ${historyFile}: ${(e as Error).message}`
        )
      );
    }
  };

  // graceful shutdown -> remove sandbox container and cleanup MCP
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    try {
      if (saveHistory && history.length > 0) {
        await persistHistory();
      }
      console.log(chalk.gray("Shutting down sandbox..."));
      await shutdownSandbox();
      console.log(chalk.gray("Sandbox removed."));

      console.log(chalk.gray("Stopping managed containers..."));
      const result = await stopAllManagedContainers({ remove: true });
      if (result.stopped.length > 0) {
        console.log(
          chalk.gray(`Stopped ${result.stopped.length} managed container(s).`)
        );
      }

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
  // Helper: print MCP status on demand
  function printMcpStatus() {
    const isLoading = mcpManager.isLoadingTools();
    const servers = mcpManager.getLoadedServers();
    const tools = mcpManager.getTools();
    const toolNames = Object.keys(tools);
    const preview = toolNames.slice(0, 10);

    console.log("MCP status:");
    console.log(`  loading: ${isLoading ? "yes" : "no"}`);
    console.log(
      `  servers: ${
        servers.length > 0
          ? `${servers.length} [${servers.join(", ")}]`
          : "none"
      }`
    );
    console.log(
      `  tools: ${toolNames.length} ${
        preview.length
          ? `[${preview.join(", ")}${
              toolNames.length > preview.length ? ", ..." : ""
            }]`
          : ""
      }`
    );
  }

  for await (const line of rl) {
    const input = line.trim();
    if (!input) continue;

    // Slash commands (not sent to agent)
    if (input === "/mcp" || input === "/mcp status") {
      printMcpStatus();
      process.stdout.write("\n> ");
      continue;
    }

    if (input === "/processes" || input === "/ps") {
      try {
        const { listAllProcesses } = await import("./tools/exec");
        const result = await listAllProcesses();

        console.log(chalk.cyan("Container Processes:"));
        if (!result.success) {
          console.error(chalk.red(`Error: ${result.error}`));
        } else if (result.processes.length === 0) {
          console.log(chalk.gray("  No processes found."));
        } else {
          console.log(chalk.gray("  PID    User     CPU%   MEM%   Command"));
          console.log(chalk.gray("  ────   ────     ────   ────   ───────"));
          for (const proc of result.processes.slice(0, 20)) {
            // Limit to first 20
            const pid = proc.pid.toString().padEnd(5);
            const user = (proc.user || "?").padEnd(7);
            const cpu = (proc.cpu || "?").padEnd(5);
            const memory = (proc.memory || "?").padEnd(5);
            const command =
              proc.command.length > 40
                ? proc.command.slice(0, 37) + "..."
                : proc.command;
            console.log(`  ${pid}  ${user}  ${cpu}  ${memory}  ${command}`);
          }
          if (result.processes.length > 20) {
            console.log(
              chalk.gray(
                `  ... and ${result.processes.length - 20} more processes`
              )
            );
          }
        }
      } catch (error) {
        console.error(
          chalk.red(`Failed to list processes: ${(error as Error).message}`)
        );
      }
      process.stdout.write("\n> ");
      continue;
    }

    if (input === "/help") {
      console.log(chalk.cyan("Available Commands:"));
      console.log(
        "  /processes   - List all processes in container (/ps for short)"
      );
      console.log("  /mcp         - Show MCP server status");
      console.log("  /help        - Show this help message");
      console.log("");
      console.log(chalk.cyan("Multi-Runtime Container:"));
      console.log("  All runtimes are pre-installed and ready:");
      console.log("  • Node.js 20 (node, npm)");
      console.log("  • Bun 1.2.22 (bun)");
      console.log("  • Python 3.11 (python, pip, uv)");
      console.log("");
      console.log(chalk.cyan("Server Management:"));
      console.log("  Start servers with: exec.command");
      console.log(
        "  Examples: 'bun run dev', 'npm start', 'python -m http.server 8000 &'"
      );
      console.log("  Use '&' for background processes");
      console.log("  🌐 All ports automatically accessible on host (no port mapping needed)");
      console.log("");
      console.log("You can ask questions or give instructions directly.");
      process.stdout.write("\n> ");
      continue;
    }
    try {
      console.log(chalk.gray("Thinking..."));
      const { text, messages } = await runAgent(input, history);

      history.splice(0, history.length, ...messages);

      if (saveHistory) {
        await persistHistory();
      }

      // Format and display the response
      const formattedResponse = formatResponse(text);
      console.log("\n" + formattedResponse + "\n");
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
