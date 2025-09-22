import React, { useState, useEffect, useRef } from "react";
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
import { formatResponse } from "./markdown";

interface ToolCall extends ToolCallProgress {
  expanded: boolean;
}

interface AppState {
  input: string;
  isProcessing: boolean;
  history: ModelMessage[];
  toolCalls: ToolCall[];
  selectedToolIndex: number;
  showInput: boolean;
  initComplete: boolean;
  error?: string;
  response?: string;
}

const App: React.FC = () => {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({
    input: "",
    isProcessing: false,
    history: [],
    toolCalls: [],
    selectedToolIndex: -1,
    showInput: true,
    initComplete: false,
  });

  const initRef = useRef(false);

  // Initialize the application
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        // Set up progress tracking
        interactiveProgressTracker.setCallbacks({
          onStart: (data) => {
            setState((prev) => ({
              ...prev,
              toolCalls: [...prev.toolCalls, { ...data, expanded: false }],
            }));
          },
          onFinish: (data) => {
            setState((prev) => ({
              ...prev,
              toolCalls: prev.toolCalls.map((tc) =>
                tc.id === data.id
                  ? {
                      ...tc,
                      result: data.result,
                      endTime: data.endTime,
                      status: data.status,
                    }
                  : tc
              ),
            }));
          },
        });

        // Verify Docker
        const ping = await verifyDockerConnection();

        // Start MCP loading
        mcpManager.startLoadingFromConfig().catch(() => {
          // Ignore MCP errors for now
        });

        // Initialize sandbox
        const runtime =
          process.env.SANDBOX_RUNTIME === "python" ? "python" : "node";
        const hostVolumePath = process.env.SANDBOX_VOLUME_PATH || "./.sandbox";
        await launchSandbox(runtime as "node" | "python", hostVolumePath);

        setState((prev) => ({ ...prev, initComplete: true }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: `Initialization failed: ${(error as Error).message}`,
          initComplete: true,
        }));
      }
    };

    init();
  }, []);

  // Handle input
  useInput((input, key) => {
    if (!state.initComplete || state.isProcessing) return;

    if (key.escape) {
      exit();
      return;
    }

    // Tool call navigation
    if (key.upArrow && state.toolCalls.length > 0) {
      setState((prev) => ({
        ...prev,
        selectedToolIndex: Math.max(0, prev.selectedToolIndex - 1),
      }));
      return;
    }

    if (key.downArrow && state.toolCalls.length > 0) {
      setState((prev) => ({
        ...prev,
        selectedToolIndex: Math.min(
          prev.toolCalls.length - 1,
          prev.selectedToolIndex + 1
        ),
      }));
      return;
    }

    // Toggle expansion
    if (key.return && state.selectedToolIndex >= 0) {
      setState((prev) => ({
        ...prev,
        toolCalls: prev.toolCalls.map((tool, index) =>
          index === prev.selectedToolIndex
            ? { ...tool, expanded: !tool.expanded }
            : tool
        ),
      }));
      return;
    }

    // Slash commands
    if (input === "m" && state.showInput) {
      showMcpStatus();
      return;
    }
  });

  const showMcpStatus = () => {
    const servers = mcpManager.getLoadedServers();
    const tools = mcpManager.getTools();
    const toolNames = Object.keys(tools);

    setState((prev) => ({
      ...prev,
      response: `MCP Status:\n  Servers: ${servers.length} [${servers.join(
        ", "
      )}]\n  Tools: ${toolNames.length} [${toolNames.slice(0, 5).join(", ")}${
        toolNames.length > 5 ? "..." : ""
      }]`,
    }));
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    setState((prev) => ({
      ...prev,
      input: "",
      isProcessing: true,
      selectedToolIndex: -1,
      response: "",
      error: "",
    }));

    try {
      const { text, messages } = await runAgent(value, state.history, true);

      setState((prev) => ({
        ...prev,
        history: messages,
        response: text,
        isProcessing: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: `Error: ${(error as Error).message}`,
        isProcessing: false,
      }));
    }
  };

  const cleanup = async () => {
    try {
      await shutdownSandbox();
      await stopAllManagedContainers({ remove: true });
      await cleanupAgent();
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  // Cleanup on exit
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  if (!state.initComplete) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">AI Container Interactive CLI</Text>
        <Box marginTop={1}>
          <Spinner type="dots" />
          <Text> Initializing...</Text>
        </Box>
      </Box>
    );
  }

  if (state.error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {state.error}</Text>
        <Text color="gray">Press ESC to exit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan">AI Container Interactive CLI</Text>
        <Spacer />
        <Text color="gray">
          ESC: exit | ↑/↓: navigate | Enter: expand | m: MCP status
        </Text>
      </Box>

      {/* Tool Calls Section */}
      {state.toolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={1} flexGrow={1}>
          <Text color="yellow">Tool Calls:</Text>
          <Box flexDirection="column">
            {state.toolCalls.map((tool, index) => (
              <ToolCallItem
                key={tool.id}
                tool={tool}
                isSelected={index === state.selectedToolIndex}
                onToggle={() =>
                  setState((prev) => ({
                    ...prev,
                    toolCalls: prev.toolCalls.map((t, i) =>
                      i === index ? { ...t, expanded: !t.expanded } : t
                    ),
                  }))
                }
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Response Section */}
      {state.response && (
        <Box borderStyle="round" borderColor="green" paddingX={1} marginTop={1}>
          <Text>{formatResponse(state.response)}</Text>
        </Box>
      )}

      {/* Input Section */}
      {state.showInput && (
        <Box marginTop={1}>
          {state.isProcessing ? (
            <Box>
              <Spinner type="dots" />
              <Text> Processing...</Text>
            </Box>
          ) : (
            <Box>
              <Text color="cyan">{">"} </Text>
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
      )}
    </Box>
  );
};

interface ToolCallItemProps {
  tool: ToolCall;
  isSelected: boolean;
  onToggle: () => void;
}

const ToolCallItem: React.FC<ToolCallItemProps> = ({
  tool,
  isSelected,
  onToggle,
}) => {
  const getStatusIcon = () => {
    switch (tool.status) {
      case "running":
        return "⠋";
      case "completed":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "?";
    }
  };

  const getDuration = () => {
    if (!tool.endTime) return "";
    const duration = tool.endTime - tool.startTime;
    return duration > 1000
      ? `${(duration / 1000).toFixed(1)}s`
      : `${duration}ms`;
  };

  const getToolDescription = () => {
    // Helpers
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
      return nested || "unknown";
    };

    const extractRuntime = (args: any, result: any): string => {
      if (args && typeof args.runtime === "string") return args.runtime;
      if (result && typeof result.runtime === "string") return result.runtime;
      const nested = deepFindByKeys(args, ["runtime"]);
      return nested || "unknown";
    };

    const args = tool.args;
    const result = tool.result;

    switch (tool.toolName) {
      case "edit.subAgentWrite":
        return `Editing file ${extractFilePath(args, result)}`;
      case "fs.writeFile":
        return `Writing file ${extractFilePath(args, result)}`;
      case "fs.readFile":
        return `Reading file ${extractFilePath(args, result)}`;
      case "fs.listDir":
        return `Listing directory ${args?.relativePath || "."}`;
      case "exec.command": {
        const cmd = args?.command || result?.command || "unknown";
        return `Running command ${cmd}`;
      }
      case "sandbox.launch":
        return `Launching ${extractRuntime(args, result)} sandbox`;
      case "sandbox.switch":
        return `Switching sandbox to ${extractRuntime(args, result)}`;
      default:
        if (tool.toolName.startsWith("mcp.")) {
          const parts = tool.toolName.split(".");
          return `Using ${parts[1]} tool ${parts.slice(2).join(".")}`;
        }
        return tool.toolName;
    }
  };

  return (
    <Box flexDirection="column">
      <Box backgroundColor={isSelected ? "blue" : undefined}>
        <Text>{getStatusIcon()} </Text>
        <Text
          color={
            tool.status === "completed"
              ? "green"
              : tool.status === "failed"
              ? "red"
              : "yellow"
          }
        >
          {getToolDescription()}
        </Text>
        {tool.endTime && <Text color="gray"> ({getDuration()})</Text>}
        {tool.expanded && <Text> [expanded]</Text>}
      </Box>

      {tool.expanded && (
        <Box
          flexDirection="column"
          paddingLeft={2}
          borderLeft
          borderColor="gray"
        >
          <Text color="cyan">Arguments:</Text>
          <Text>{JSON.stringify(tool.args, null, 2)}</Text>

          {tool.result && (
            <>
              <Text color="cyan">Result:</Text>
              <Text>{JSON.stringify(tool.result, null, 2)}</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

export const startInteractiveCli = () => {
  render(<App />);
};
