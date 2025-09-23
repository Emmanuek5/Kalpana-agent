import "dotenv/config";
import readline from "node:readline";
import chalk from "chalk";
import { runAgent, cleanup as cleanupAgent } from "./agents/index.js";
import { mcpManager } from "./mcp.js";
import type { ModelMessage } from "ai";
import { launchSandbox, shutdownSandbox } from "./sandbox.js";
import {
  verifyDockerConnection,
  stopAllManagedContainers,
} from "./tools/docker.js";
import { formatResponse } from "./markdown.js";
import fs from "node:fs/promises";
import { loadEnvironment, validateConfig, configExists } from "./config.js";
import { contextManager } from "./context-manager.js";
import { calculateRemainingContext, wouldExceedContext } from "./token-counter.js";

// Global error handlers to prevent application crashes
process.on('uncaughtException', (error) => {
  console.error(chalk.red('🚨 Uncaught Exception:'), error.message);
  console.error(chalk.gray('Stack:'), error.stack);
  console.log(chalk.yellow('⚠️  Application continuing despite error...'));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('🚨 Unhandled Promise Rejection:'), reason);
  console.error(chalk.gray('Promise:'), promise);
  console.log(chalk.yellow('⚠️  Application continuing despite error...'));
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🛑 Received SIGINT, shutting down gracefully...'));
  await gracefulShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n🛑 Received SIGTERM, shutting down gracefully...'));
  await gracefulShutdown();
  process.exit(0);
});

async function gracefulShutdown() {
  try {
    console.log(chalk.blue('🧹 Cleaning up resources...'));
    await cleanupAgent();
    await shutdownSandbox();
    console.log(chalk.green('✅ Cleanup completed'));
  } catch (error) {
    console.error(chalk.red('❌ Error during cleanup:'), error);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function parseSandboxPath(): string {
  const sandboxIndex = process.argv.indexOf("--sandbox");
  if (sandboxIndex !== -1 && sandboxIndex + 1 < process.argv.length) {
    const sandboxPath = process.argv[sandboxIndex + 1];
    
    // Ensure sandboxPath is defined and not empty
    if (!sandboxPath || sandboxPath.trim() === "") {
      console.error(chalk.red("❌ --sandbox flag requires a valid path argument"));
      process.exit(1);
    }
    
    const trimmedPath = sandboxPath.trim();
    
    // Handle relative paths
    if (trimmedPath === ".") {
      return process.cwd();
    } else if (trimmedPath.startsWith("./")) {
      return require("path").resolve(process.cwd(), trimmedPath);
    } else if (trimmedPath.startsWith("../")) {
      return require("path").resolve(process.cwd(), trimmedPath);
    } else if (require("path").isAbsolute(trimmedPath)) {
      return trimmedPath;
    } else {
      // Relative path without ./ prefix
      return require("path").resolve(process.cwd(), trimmedPath);
    }
  }
  
  // Fallback to environment variable or default
  return process.env.SANDBOX_VOLUME_PATH || "./.sandbox";
}

async function main() {
  // Load global configuration
  await loadEnvironment();
  
  // Check if configuration exists and is valid
  const hasConfig = await configExists();
  if (!hasConfig) {
    console.log(chalk.yellow('⚠️  No configuration found.'));
    console.log('Run ' + chalk.cyan('kalpana-config setup') + ' to configure Kalpana with your API keys.');
    console.log('Or run ' + chalk.cyan('kalpana-config --help') + ' for more options.');
    process.exit(1);
  }
  
  const validation = await validateConfig();
  if (!validation.valid) {
    console.log(chalk.red('❌ Configuration is incomplete.'));
    console.log(chalk.yellow('Missing required settings:'));
    validation.missing.forEach(key => {
      console.log(`  - ${key}`);
    });
    console.log('');
    console.log('Run ' + chalk.cyan('kalpana-config setup') + ' to complete configuration.');
    process.exit(1);
  }

  console.log(chalk.cyan("Kalpana (कल्पना) - AI Development Assistant"));
  let history: ModelMessage[] = [];
  let saveHistory = false;
  let sessionId = `session_${Date.now()}`;

  // Check for --save-history or --history flag
  if (process.argv.includes("--save-history") || process.argv.includes("--history")) {
    saveHistory = true;
    console.log(chalk.blue("📝 History saving enabled"));
  }

  // Initialize context management
  await contextManager.loadContext(sessionId);

  // Flags
  const runtime = "bun"; // Default runtime for container launch (all runtimes available)
  const hostVolumePath = parseSandboxPath();
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
  
  // Show sandbox path info
  const isCustomPath = process.argv.includes("--sandbox");
  // No automatic MCP status output; use '/mcp' command to view

  console.log(chalk.cyan("Type your instruction. Ctrl+C to exit."));

  // Helper: persist history to disk
  const historyFile = `history_${sessionId}.json`;
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
      if (saveHistory && history.length > 0) {
        await persistHistory().catch((historyError) => {
          console.warn(chalk.yellow('⚠️ Failed to save history during cleanup:'), historyError.message);
        });
      }

      // Save context state
      await contextManager.saveContext(sessionId);

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

    // Context management commands
    if (input.startsWith("/context")) {
      const parts = input.split(" ");
      const command = parts[1];

      if (!command || command === "status") {
        // Show context status
        const stats = contextManager.getContextStats();
        const { buildSystemPrompt } = await import("./agents/system");
        const systemPrompt = await buildSystemPrompt();
        const contextInfo = calculateRemainingContext(
          history,
          systemPrompt,
          230000,
          process.env.MODEL_ID || "openai/gpt-4o-mini"
        );

        console.log(chalk.cyan("Context Management Status:"));
        console.log(`  📊 Current usage: ${contextInfo.used.toLocaleString()}/${230000} tokens (${contextInfo.percentage.toFixed(1)}%)`);
        console.log(`  💾 Summarized segments: ${stats.segmentCount}`);
        console.log(`  📝 Total summarized messages: ${stats.totalSummarizedMessages}`);
        console.log(`  🔥 High importance: ${stats.importanceBreakdown.high}`);
        console.log(`  📋 Medium importance: ${stats.importanceBreakdown.medium}`);
        console.log(`  📄 Low importance: ${stats.importanceBreakdown.low}`);
        console.log(`  🕒 Current messages: ${history.length}`);
        
      } else if (command === "search") {
        // Search context
        const query = parts.slice(2).join(" ");
        if (!query) {
          console.log(chalk.yellow("Usage: /context search <query>"));
        } else {
          const results = contextManager.searchContext(query);
          console.log(chalk.cyan(`Context Search Results for "${query}":`));
          if (results.length === 0) {
            console.log(chalk.gray("  No matching segments found."));
          } else {
            for (const segment of results.slice(0, 5)) {
              console.log(chalk.blue(`\n  Segment ${segment.id} (${segment.importance} importance):`));
              console.log(`    ${segment.summary}`);
              if (segment.keyPoints && segment.keyPoints.length > 0) {
                console.log(chalk.gray("    Key points:"));
                segment.keyPoints.slice(0, 3).forEach(point => {
                  console.log(chalk.gray(`      • ${point}`));
                });
              }
            }
            if (results.length > 5) {
              console.log(chalk.gray(`\n  ... and ${results.length - 5} more results`));
            }
          }
        }
        
      } else if (command === "stats") {
        // Detailed statistics
        const stats = contextManager.getContextStats();
        const { buildSystemPrompt } = await import("./agents/system");
        const systemPrompt = await buildSystemPrompt();
        const contextInfo = calculateRemainingContext(
          history,
          systemPrompt,
          230000,
          process.env.MODEL_ID || "openai/gpt-4o-mini"
        );

        console.log(chalk.cyan("Detailed Context Statistics:"));
        console.log(`  📊 Token Usage:`);
        console.log(`    Current: ${contextInfo.used.toLocaleString()} tokens`);
        console.log(`    System prompt: ${contextInfo.systemTokens.toLocaleString()} tokens`);
        console.log(`    Messages: ${contextInfo.messageTokens.toLocaleString()} tokens`);
        console.log(`    Remaining: ${contextInfo.remaining.toLocaleString()} tokens`);
        console.log(`    Usage: ${contextInfo.percentage.toFixed(2)}%`);
        console.log(`  📝 Conversation:`);
        console.log(`    Current messages: ${history.length}`);
        console.log(`    Summarized segments: ${stats.segmentCount}`);
        console.log(`    Total summarized messages: ${stats.totalSummarizedMessages}`);
        console.log(`  🎯 Importance Breakdown:`);
        console.log(`    High: ${stats.importanceBreakdown.high} segments`);
        console.log(`    Medium: ${stats.importanceBreakdown.medium} segments`);
        console.log(`    Low: ${stats.importanceBreakdown.low} segments`);
        
      } else if (command === "summarize") {
        // Force-create summaries from all current messages
        try {
          console.log(chalk.gray("Creating conversation summaries..."));
          await contextManager.forceSummarizeAll(history);
          const stats = contextManager.getContextStats();
          console.log(chalk.green(`✅ Created ${stats.segmentCount} summary segment(s).`));
          console.log(chalk.gray("Use '/context' to view status or '/context search <query>' to search summaries."));
        } catch (e) {
          console.error(chalk.red(`Failed to summarize context: ${(e as Error).message}`));
        }
        
      } else if (command === "save") {
        // Save raw message history to ~/.kalpana/context/
        try {
          const savedPath = await contextManager.saveMessages(sessionId, history);
          console.log(chalk.green("💾 Conversation saved."));
          console.log(chalk.gray(`Path: ${savedPath}`));
        } catch (e) {
          console.error(chalk.red(`Failed to save conversation: ${(e as Error).message}`));
        }
        
      } else {
        console.log(chalk.yellow("Unknown context command. Available: status, search <query>, stats, summarize, save"));
      }
      
      process.stdout.write("\n> ");
      continue;
    }

    if (input.trim() === "/help") {
      console.log(chalk.cyan("Available Commands:"));
      console.log(
        "  /processes   - List all processes in container (/ps for short)"
      );
      console.log("  /mcp         - Show MCP server status");
      console.log("  /context     - Show context management status");
      console.log("  /context search <query> - Search summarized context");
      console.log("  /context stats - Show detailed context statistics");
      console.log("  /context summarize - Create summaries for the current conversation");
      console.log("  /context save - Save full conversation to ~/.kalpana/context/");
      console.log("  /help        - Show this help message");
      console.log("");
      console.log(chalk.cyan("CLI Options:"));
      console.log("  --sandbox <path>    - Set custom sandbox directory");
      console.log("    Examples:");
      console.log("      --sandbox .                    (current directory)");
      console.log("      --sandbox ./my-project         (relative path)");
      console.log("      --sandbox /absolute/path       (absolute path)");
      console.log("      --sandbox ../parent-folder     (parent directory)");
      console.log("  --save-history      - Save conversation history");
      console.log("");
      console.log(chalk.cyan("Configuration Management:"));
      console.log("  kalpana-config setup            - Interactive setup wizard");
      console.log("  kalpana-config show             - Display current config");
      console.log("  kalpana-config set <key> <val>  - Set configuration value");
      console.log("  kalpana-config get <key>        - Get configuration value");
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

    if (input.trim() === "/config") {
      console.log(chalk.cyan("Configuration Management:"));
      console.log("");
      console.log("Exit Kalpana and run these commands:");
      console.log(chalk.yellow("  kalpana config setup") + "            - Interactive configuration wizard");
      console.log(chalk.yellow("  kalpana config show") + "             - Display current configuration");
      console.log(chalk.yellow("  kalpana config set <key> <value>") + " - Set a configuration value");
      console.log(chalk.yellow("  kalpana config get <key>") + "        - Get a configuration value");
      console.log(chalk.yellow("  kalpana config unset <key>") + "      - Remove a configuration value");
      console.log(chalk.yellow("  kalpana config validate") + "         - Validate current configuration");
      console.log(chalk.yellow("  kalpana config path") + "             - Show config file location");
      console.log("");
      console.log("Example API keys to configure:");
      console.log("  OPENROUTER_API_KEY     - Required for AI functionality");
      console.log("  HYPERBROWSER_API_KEY   - For web automation features");
      console.log("  GEMINI_API_KEY         - For multi-modal analysis");
      console.log("  CONTEXT7_API_KEY       - For documentation search");
      process.stdout.write("\n> ");
      continue;
    }
    try {
      console.log(chalk.gray("Thinking..."));

      const { text, messages } = await runAgent(input, history).catch((agentError) => {
        console.error(chalk.red('🚨 Agent execution error:'), agentError.message);
        console.error(chalk.gray('Stack:'), agentError.stack);
        
        // Return a fallback response instead of crashing
        return {
          text: `❌ **Agent Error**: ${agentError.message}\n\n⚠️ The agent encountered an error but the application is still running. You can try your request again or ask for help.`,
          messages: history // Keep existing history
        };
      });

      history.splice(0, history.length, ...messages);

      if (saveHistory) {
        try {
          await persistHistory();
        } catch (historyError: any) {
          console.warn(chalk.yellow('⚠️ Failed to save history:'), historyError.message);
        }
      }

      // Save context state periodically (every 5 messages)
      if (history.length % 5 === 0) {
        await contextManager.saveContext(sessionId);
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
