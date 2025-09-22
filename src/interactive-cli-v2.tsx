import React, { useState, useEffect, useRef, useCallback } from "react";
import { render, Text, Box, useInput, useApp, Spacer } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { runAgent, cleanup as cleanupAgent } from "./agents";
import { mcpManager } from "./mcp";
import { interactiveProgressTracker, type ToolCallProgress } from "./progress";
import type { ModelMessage } from "ai";
import { launchSandbox, shutdownSandbox } from "./sandbox";
import {
  verifyDockerConnection,
  stopAllManagedContainers,
} from "./tools/docker";
import { formatResponse, isMarkdown } from "./markdown";
import { toolCollector } from "./tool-collector";

interface ToolCall extends ToolCallProgress {
  expanded: boolean;
  description: string;
}

interface AppState {
  phase: "initializing" | "ready" | "processing" | "error" | "exiting";
  input: string;
  history: ModelMessage[];
  toolCalls: ToolCall[];
  selectedIndex: number;
  lastResponse: string;
  errorMessage: string;
  mcpStatus: string;
  showMcpStatus: boolean;
}

const getToolDescription = (
  toolName: string,
  args: any,
  result?: any
): string => {
  // First, try to get enhanced description from tool collector if available
  const runningExecutions = toolCollector.getRunningExecutions();
  const matchingExecution = runningExecutions.find(
    (exec) => exec.toolName === toolName
  );

  if (matchingExecution) {
    const info = toolCollector.extractToolInfo(matchingExecution);
    // Use the enhanced description logic
    switch (toolName) {
      case "fs.readFile":
        return `Reading file ${info.filePath || "unknown"}`;
      case "fs.writeFile":
        return `Writing file ${info.filePath || "unknown"}`;
      case "edit.subAgentWrite":
        return `Editing file ${info.filePath || "unknown"}`;
      case "edit.searchReplace":
        return `Search/replace in ${info.filePath || "unknown"}`;
      case "exec.command":
        return `Running ${info.command || "command"}`;
      case "browser.navigate":
        return `Navigate to ${info.url || "URL"}`;
      default:
        if (info.description && info.description !== "tool execution") {
          return `${toolName}: ${info.description}`;
        }
        break;
    }
  }

  // Fallback to original logic - helpers
  const deepFindByKeys = (
    val: any,
    keys: string[],
    maxDepth = 4
  ): string | undefined => {
    try {
      const seen = new Set<any>();
      const visit = (v: any, depth: number): string | undefined => {
        if (v == null || depth > maxDepth) return undefined;
        if (typeof v === "string") return undefined;
        if (typeof v !== "object") return undefined;
        if (seen.has(v)) return undefined;
        seen.add(v);

        for (const k of keys) {
          if (typeof (v as any)[k] === "string") return (v as any)[k];
        }

        const wrappers = [
          "input",
          "params",
          "parameters",
          "payload",
          "data",
          "argument",
          "arguments",
        ];
        for (const w of wrappers) {
          if (w in (v as any)) {
            const found = visit((v as any)[w], depth + 1);
            if (found) return found;
          }
        }

        for (const val of Object.values(v as any)) {
          if (typeof val === "object") {
            const found = visit(val, depth + 1);
            if (found) return found;
          }
        }
        return undefined;
      };
      return visit(val, 0);
    } catch {
      return undefined;
    }
  };

  const extractFilePath = (args: any, result: any): string => {
    const direct =
      (args &&
        (args.relativePath ||
          args.path ||
          args.file ||
          args.fileName ||
          args.filePath)) ||
      undefined;
    if (typeof direct === "string") return direct;
    const fromResult =
      (result && (result.relativePath || result.path)) || undefined;
    if (typeof fromResult === "string") return fromResult;
    const nested = deepFindByKeys(args, [
      "relativePath",
      "path",
      "file",
      "fileName",
      "filePath",
    ]);
    return nested || "file";
  };

  const extractRuntime = (args: any, result: any): string => {
    if (args && typeof args.runtime === "string") return args.runtime;
    if (result && typeof result.runtime === "string") return result.runtime;
    const nested = deepFindByKeys(args, ["runtime"]);
    return nested || "runtime";
  };

  switch (toolName) {
    case "edit.subAgentWrite":
      return `Edit ${extractFilePath(args, result)}`;
    case "fs.readFile":
      return `Read ${extractFilePath(args, result)}`;
    case "fs.writeFile":
      return `Write ${extractFilePath(args, result)}`;
    case "fs.listDir":
      return `List ${args?.relativePath || "directory"}`;
    case "exec.command":
      return `Run: ${args?.command || result?.command || "command"}`;
    case "sandbox.launch":
      return `Launch ${extractRuntime(args, result)} sandbox`;
    case "sandbox.switch":
      return `Switch sandbox to ${extractRuntime(args, result)}`;
    case "context7.search":
      return `Search docs: ${args?.query || "query"}`;
    case "context7.getDocs":
      return `Get docs: ${args?.id || "library"}`;
    case "docs.fetchUrl":
      return `Fetch: ${args?.url || result?.url || "URL"}`;
    default:
      if (toolName.startsWith("mcp.")) {
        const parts = toolName.split(".");
        return `${parts[1]}: ${parts.slice(2).join(".")}`;
      }
      return toolName;
  }
};

const getStatusIcon = (status: string): string => {
  switch (status) {
    case "running":
      return "⏳";
    case "completed":
      return "✅";
    case "failed":
      return "❌";
    default:
      return "❓";
  }
};

const getDuration = (startTime: number, endTime?: number): string => {
  if (!endTime) return "";
  const duration = endTime - startTime;
  return duration > 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
};

// Component to render markdown-formatted text in Ink
const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  // For Ink, we'll format the markdown and display it as plain text
  // but with the ANSI color codes from our markdown formatter
  const formattedText = formatResponse(text);

  return <Text>{formattedText}</Text>;
};

const App: React.FC = () => {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({
    phase: "initializing",
    input: "",
    history: [],
    toolCalls: [],
    selectedIndex: -1,
    lastResponse: "",
    errorMessage: "",
    mcpStatus: "",
    showMcpStatus: false,
  });

  const initRef = useRef(false);
  const toolCallsRef = useRef<Map<string, ToolCall>>(new Map());

  // Suppress console output during UI operations
  const suppressConsole = useCallback(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  // Initialize application
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const restore = suppressConsole();

      try {
        // Set up progress tracking
        interactiveProgressTracker.setCallbacks({
          onStart: (data) => {
            const toolCall: ToolCall = {
              ...data,
              expanded: false,
              description: getToolDescription(
                data.toolName,
                data.args,
                undefined
              ),
            };

            toolCallsRef.current.set(data.id, toolCall);

            setState((prev) => ({
              ...prev,
              toolCalls: Array.from(toolCallsRef.current.values()),
            }));
          },
          onFinish: (data) => {
            const existing = toolCallsRef.current.get(data.id);
            if (existing) {
              const updated = {
                ...existing,
                result: data.result,
                endTime: data.endTime,
                status: data.status,
                // Recompute description with result fallback where needed
                description: getToolDescription(
                  existing.toolName,
                  existing.args,
                  data.result
                ),
              };
              toolCallsRef.current.set(data.id, updated);

              setState((prev) => ({
                ...prev,
                toolCalls: Array.from(toolCallsRef.current.values()),
              }));
            }
          },
        });

        // Initialize Docker and sandbox
        await verifyDockerConnection();

        // Start MCP loading
        mcpManager.startLoadingFromConfig().catch(() => {
          // Silently handle MCP errors
        });

        // Initialize multi-runtime sandbox (contains Node.js, Bun, and Python pre-installed)
        const runtime = "bun"; // Default runtime for container launch (all runtimes available)
        const hostVolumePath = process.env.SANDBOX_VOLUME_PATH || "./.sandbox";
        await launchSandbox(runtime, hostVolumePath);

        setState((prev) => ({ ...prev, phase: "ready" }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          phase: "error",
          errorMessage: `Initialization failed: ${(error as Error).message}`,
        }));
      } finally {
        restore();
      }
    };

    init();
  }, [suppressConsole]);

  // Handle keyboard input
  useInput((input, key) => {
    if (state.phase === "initializing" || state.phase === "processing") return;

    if (key.escape) {
      setState((prev) => ({ ...prev, phase: "exiting" }));
      const cleanup = async () => {
        const restore = suppressConsole();
        try {
          await shutdownSandbox();
          await stopAllManagedContainers({ remove: true });
          await cleanupAgent();
        } catch (e) {
          // Ignore cleanup errors
        } finally {
          restore();
        }
        exit();
      };
      cleanup();
      return;
    }

    if (state.showMcpStatus) {
      if (key.escape) {
        setState((prev) => ({ ...prev, showMcpStatus: false }));
      }
      return;
    }

    if (key.upArrow && state.toolCalls.length > 0) {
      setState((prev) => ({
        ...prev,
        selectedIndex: Math.max(0, prev.selectedIndex - 1),
      }));
      return;
    }

    if (key.downArrow && state.toolCalls.length > 0) {
      setState((prev) => ({
        ...prev,
        selectedIndex: Math.min(
          prev.toolCalls.length - 1,
          prev.selectedIndex + 1
        ),
      }));
      return;
    }

    if (
      key.return &&
      state.selectedIndex >= 0 &&
      state.selectedIndex < state.toolCalls.length
    ) {
      const selectedTool = state.toolCalls[state.selectedIndex];
      if (selectedTool) {
        const updated: ToolCall = {
          ...selectedTool,
          expanded: !selectedTool.expanded,
        };
        toolCallsRef.current.set(selectedTool.id, updated);

        setState((prev) => ({
          ...prev,
          toolCalls: Array.from(toolCallsRef.current.values()),
        }));
      }
      return;
    }

    // Remove the 'm' key trigger for MCP status - it will be handled via slash commands
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || state.phase !== "ready") return;

      // Handle slash commands
      if (value.startsWith("/")) {
        if (value === "/mcp" || value === "/mcp status") {
          const servers = mcpManager.getLoadedServers();
          const tools = mcpManager.getTools();
          const isLoading = mcpManager.isLoadingTools();

          const status = `MCP Status:
  Loading: ${isLoading ? "yes" : "no"}
  Servers: ${servers.length} [${servers.join(", ")}]
  Tools: ${Object.keys(tools).length}`;

          setState((prev) => ({
            ...prev,
            input: "",
            mcpStatus: status,
            showMcpStatus: true,
          }));
          return;
        }

        if (value === "/servers") {
          setState((prev) => ({
            ...prev,
            phase: "processing",
            input: "",
            selectedIndex: -1,
            lastResponse: "",
            errorMessage: "",
          }));

          try {
            const { listServers } = await import("./tools/exec");
            const result = await listServers();

            let response = "## Running Servers\n\n";
            if (result.servers.length === 0) {
              response += "No servers are currently running.\n";
            } else {
              response +=
                "| Name | Port | PID | Container |\n|------|------|-----|----------|\n";
              for (const server of result.servers) {
                response += `| ${server.name} | ${server.port} | ${
                  server.pid || "?"
                } | ${server.containerId.slice(0, 12)}... |\n`;
              }
            }

            setState((prev) => ({
              ...prev,
              phase: "ready",
              lastResponse: response,
            }));
          } catch (error) {
            setState((prev) => ({
              ...prev,
              phase: "ready",
              errorMessage: `Failed to list servers: ${
                (error as Error).message
              }`,
            }));
          }
          return;
        }

        if (value === "/processes" || value === "/ps") {
          setState((prev) => ({
            ...prev,
            phase: "processing",
            input: "",
            selectedIndex: -1,
            lastResponse: "",
            errorMessage: "",
          }));

          try {
            const { listAllProcesses } = await import("./tools/exec");
            const result = await listAllProcesses();

            let response = "## Container Processes\n\n";
            if (!result.success) {
              response += `Error: ${result.error}\n`;
            } else if (result.processes.length === 0) {
              response += "No processes found.\n";
            } else {
              response +=
                "| PID | User | CPU% | MEM% | Command |\n|-----|------|------|------|--------|\n";
              for (const proc of result.processes) {
                const pid = proc.pid.toString();
                const user = proc.user || "?";
                const cpu = proc.cpu || "?";
                const memory = proc.memory || "?";
                const command =
                  proc.command.length > 50
                    ? proc.command.slice(0, 47) + "..."
                    : proc.command;
                response += `| ${pid} | ${user} | ${cpu} | ${memory} | ${command} |\n`;
              }
            }

            setState((prev) => ({
              ...prev,
              phase: "ready",
              lastResponse: response,
            }));
          } catch (error) {
            setState((prev) => ({
              ...prev,
              phase: "ready",
              errorMessage: `Failed to list processes: ${
                (error as Error).message
              }`,
            }));
          }
          return;
        }

        // Add help command
        if (value === "/help") {
          const helpText = `## Available Commands

| Command | Description |
|---------|-------------|
| \`/servers\` | List all running servers |
| \`/processes\` or \`/ps\` | List all processes in container |
| \`/mcp\` | Show MCP server status |
| \`/help\` | Show this help message |
| \`/exit\` | Exit the application |

You can also ask questions or give instructions directly.`;

          setState((prev) => ({
            ...prev,
            input: "",
            lastResponse: helpText,
          }));
          return;
        }

        if (value === "/exit") {
          setState((prev) => ({ ...prev, phase: "exiting" }));
          // Exit will be handled by the phase change
          return;
        }

        setState((prev) => ({
          ...prev,
          input: "",
          errorMessage: `Unknown command: ${value}. Type /help for available commands.`,
        }));
        return;
      }

      const restore = suppressConsole();

      setState((prev) => ({
        ...prev,
        phase: "processing",
        input: "",
        selectedIndex: -1,
        lastResponse: "",
        errorMessage: "",
      }));

      // Clear previous tool calls
      toolCallsRef.current.clear();
      setState((prev) => ({ ...prev, toolCalls: [] }));

      try {
        const { text, messages } = await runAgent(value, state.history, true);

        setState((prev) => ({
          ...prev,
          phase: "ready",
          history: messages,
          lastResponse: text,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          phase: "ready",
          errorMessage: `Error: ${(error as Error).message}`,
        }));
      } finally {
        restore();
      }
    },
    [state.history, state.phase, suppressConsole]
  );

  // Render loading screen
  if (state.phase === "initializing") {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>
          AI Container Interactive CLI
        </Text>
        <Box marginTop={1}>
          <Spinner type="dots" />
          <Text> Initializing sandbox and MCP tools...</Text>
        </Box>
      </Box>
    );
  }

  // Render error screen
  if (state.phase === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          Initialization Error
        </Text>
        <Text>{state.errorMessage}</Text>
        <Text color="gray">Press ESC to exit</Text>
      </Box>
    );
  }

  // Render MCP status overlay
  if (state.showMcpStatus) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="blue" padding={1}>
          <Text color="blue">{state.mcpStatus}</Text>
        </Box>
        <Text color="gray">Press ESC to close</Text>
      </Box>
    );
  }

  // Main UI
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>
          AI Container Interactive CLI
        </Text>
        <Spacer />
        <Text color="gray">
          ESC: exit | ↑/↓: navigate | Enter: expand | /mcp: status
        </Text>
      </Box>

      {/* Tool calls section */}
      {state.toolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={1} flexShrink={0} height={10}>
          <Text color="yellow" bold>
            Tool Activity:
          </Text>
          <Box flexDirection="column" paddingX={1}>
            {state.toolCalls.slice(-8).map((tool, index) => {
              const actualIndex = state.toolCalls.length - 8 + index;
              const isSelected = actualIndex === state.selectedIndex;

              return (
                <Box key={tool.id} flexDirection="column">
                  <Box backgroundColor={isSelected ? "blue" : undefined}>
                    <Text>{getStatusIcon(tool.status)} </Text>
                    <Text
                      color={
                        tool.status === "completed"
                          ? "green"
                          : tool.status === "failed"
                          ? "red"
                          : "yellow"
                      }
                    >
                      {tool.description}
                    </Text>
                    {tool.endTime && (
                      <Text color="gray">
                        {" "}
                        ({getDuration(tool.startTime, tool.endTime)})
                      </Text>
                    )}
                    {tool.expanded && <Text color="blue"> [expanded]</Text>}
                  </Box>

                  {tool.expanded && (
                    <Box
                      flexDirection="column"
                      marginLeft={2}
                      borderLeft
                      borderColor="gray"
                      paddingLeft={1}
                    >
                      <Text color="cyan">Args:</Text>
                      <Text>
                        {JSON.stringify(tool.args, null, 2).substring(0, 200)}
                        ...
                      </Text>

                      {tool.result && (
                        <>
                          <Text color="cyan">Result:</Text>
                          <Text>
                            {JSON.stringify(tool.result, null, 2).substring(
                              0,
                              200
                            )}
                            ...
                          </Text>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Response section */}
      {state.lastResponse && (
        <Box
          borderStyle="round"
          borderColor="green"
          padding={1}
          marginTop={1}
          flexShrink={0}
        >
          <MarkdownText text={state.lastResponse} />
        </Box>
      )}

      {/* Error section */}
      {state.errorMessage && (
        <Box
          borderStyle="round"
          borderColor="red"
          padding={1}
          marginTop={1}
          flexShrink={0}
        >
          <Text color="red">{state.errorMessage}</Text>
        </Box>
      )}

      <Spacer />

      {/* Input section */}
      <Box marginTop={1}>
        {state.phase === "processing" ? (
          <Box>
            <Spinner type="dots" />
            <Text> Processing your request...</Text>
          </Box>
        ) : (
          <Box>
            <Text color="cyan" bold>
              {">"}{" "}
            </Text>
            <TextInput
              value={state.input}
              onChange={(value) =>
                setState((prev) => ({ ...prev, input: value }))
              }
              onSubmit={handleSubmit}
              placeholder="Type your instruction..."
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export const startInteractiveCliV2 = () => {
  render(<App />);
};
