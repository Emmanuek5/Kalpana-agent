import chalk from "chalk";
import { performance } from "perf_hooks";
import { toolCollector, type ToolExecution } from "./tool-collector";

// Interface for progress tracking
interface ProgressState {
  toolName: string;
  args?: any;
  startTime: number;
  intervalId?: NodeJS.Timeout;
  description: string;
}

export class ProgressIndicator {
  private activeProgress = new Map<string, ProgressState>();
  private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;

  // Start progress for a tool call
  startProgress(toolCallId: string, toolName: string, args?: any) {
    // Register with tool collector for better argument tracking
    toolCollector.startExecution(toolCallId, toolName, args);

    // Debug log to see what args are being passed
    if (process.env.DEBUG_PROGRESS) {
      console.log(
        `\n[DEBUG] Tool: ${toolName}, Args:`,
        JSON.stringify(args, null, 2)
      );
    }

    const description = this.getToolDescription(toolName, args);
    const startTime = performance.now();

    const state: ProgressState = {
      toolName,
      args,
      startTime,
      description,
    };

    // Clear any existing line for this tool
    if (this.activeProgress.has(toolCallId)) {
      this.clearProgress(toolCallId);
    }

    // No spinner - just log the start
    // We'll only show the final result to avoid confusion

    // Optional: Show start message if debug is enabled
    if (process.env.DEBUG_PROGRESS) {
      console.log(chalk.blue(`Starting: ${description}`));
    }
    this.activeProgress.set(toolCallId, state);
  }

  // Finish progress with results
  finishProgress(toolCallId: string, result?: any) {
    const state = this.activeProgress.get(toolCallId);
    if (!state) return;

    // Update tool collector with results
    const success = this.isSuccessResult(result);
    if (success) {
      toolCollector.completeExecution(toolCallId, result);
    } else {
      toolCollector.failExecution(toolCallId, result);
    }

    this.clearProgress(toolCallId);

    const duration = performance.now() - state.startTime;
    const durationStr =
      duration > 1000
        ? `${(duration / 1000).toFixed(1)}s`
        : `${Math.round(duration)}ms`;

    const statusIcon = success ? "✅" : "❌";
    const statusColor = success ? chalk.green : chalk.red;

    // Try to get enhanced description from tool collector
    const execution = toolCollector.getExecution(toolCallId);
    const resolvedDescription = execution
      ? this.getEnhancedDescription(execution)
      : this.resolveDescription(state, result);

    let message = `${statusIcon} ${resolvedDescription}`;

    // Add specific result information
    const resultInfo = this.getResultInfo(state.toolName, result);
    if (resultInfo) {
      message += ` ${chalk.gray(`(${resultInfo})`)}`;
    }

    message += ` ${chalk.gray(`- ${durationStr}`)}`;

    console.log(statusColor(message));

    this.activeProgress.delete(toolCallId);
  }

  // Get enhanced description using tool collector data
  private getEnhancedDescription(execution: ToolExecution): string {
    const { toolName } = execution;
    const info = toolCollector.extractToolInfo(execution);

    // Create descriptive text based on tool type and extracted info
    switch (toolName) {
      case "fs.readFile":
        return `Reading file ${chalk.cyan(info.filePath || "unknown")}`;
      case "fs.writeFile":
        return `Writing file ${chalk.cyan(info.filePath || "unknown")}`;
      case "edit.searchReplace":
        return `Editing file ${chalk.cyan(info.filePath || "unknown")}`;
      case "edit.subAgentWrite":
        return `Creating/updating file ${chalk.cyan(
          info.filePath || "unknown"
        )}`;
      case "fs.listDir":
        return `Listing directory ${chalk.cyan(info.filePath || ".")}`;
      case "fs.makeDir":
        return `Creating directory ${chalk.cyan(info.filePath || "unknown")}`;
      case "fs.delete":
        return `Deleting ${chalk.cyan(info.filePath || "unknown")}`;
      case "exec.command":
        const cmdDisplay = info.command || "unknown";
        const workdirDisplay = info.workdir
          ? ` in ${chalk.yellow(info.workdir)}`
          : "";
        return `Running command ${chalk.cyan(cmdDisplay)}${workdirDisplay}`;
      case "exec.startServer":
        const serverCmd = info.command || "server";
        const serverWorkdir = info.workdir
          ? ` in ${chalk.yellow(info.workdir)}`
          : "";
        return `Starting server ${chalk.cyan(serverCmd)}${serverWorkdir}`;
      case "browser.navigate":
        return `Navigating to ${chalk.cyan(info.url || "unknown")}`;
      case "docs.fetchUrl":
        return `Fetching docs from ${chalk.cyan(info.url || "unknown")}`;
      case "sandbox.launch":
        return `Launching ${chalk.cyan(info.runtime || "unknown")} sandbox`;
      case "sandbox.switch":
        return `Switching sandbox to ${chalk.cyan(info.runtime || "unknown")}`;
      case "sandbox.info":
        return `Getting sandbox info`;
      case "docker.start":
        const image = info.description || "container";
        return `Starting container ${chalk.cyan(image)}`;
      case "docker.getCurrentContainer":
        return `Getting current container info`;
      case "docker.listNetworks":
        return `Listing Docker networks`;
      case "docker.restartWithPorts":
        return `Restarting container with port bindings`;
      default:
        // For other tools, use a generic description with any meaningful info
        if (info.description && info.description !== "tool execution") {
          return `${toolName}: ${chalk.cyan(info.description)}`;
        }
        return `${toolName}`;
    }
  }

  private resolveDescription(state: ProgressState, result?: any): string {
    // If description already has concrete details, use it
    if (!state.description.includes("unknown")) return state.description;

    // Try to enrich description from the result payload for known tools
    switch (state.toolName) {
      case "docs.fetchUrl": {
        const derivedUrl = result?.url as string | undefined;
        if (derivedUrl) {
          return this.getToolDescription(state.toolName, { url: derivedUrl });
        }
        break;
      }
      case "browser.navigate": {
        const derivedUrl = result?.url as string | undefined;
        if (derivedUrl) {
          return this.getToolDescription(state.toolName, { url: derivedUrl });
        }
        break;
      }
      case "sandbox.launch":
      case "sandbox.switch": {
        const runtime = result?.runtime as string | undefined;
        if (runtime) {
          return this.getToolDescription(state.toolName, { runtime });
        }
        break;
      }
      case "fs.readFile": {
        const p = (result?.relativePath || result?.path) as string | undefined;
        if (p) {
          return this.getToolDescription(state.toolName, { relativePath: p });
        }
        break;
      }
      case "exec.command": {
        const cmd = result?.command as string | undefined;
        if (cmd) {
          return this.getToolDescription(state.toolName, { command: cmd });
        }
        break;
      }
      default:
        break;
    }

    return state.description;
  }

  // Clear progress without showing completion
  clearProgress(toolCallId: string) {
    const state = this.activeProgress.get(toolCallId);
    if (!state) return;

    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    // No need to clear lines since we're not using spinner

    this.activeProgress.delete(toolCallId);
  }

  // Clear all active progress indicators
  clearAll() {
    for (const [id] of this.activeProgress) {
      this.clearProgress(id);
    }
  }

  private getSpinner(): string {
    const frame = this.spinnerFrames[this.frameIndex] || "⠋";
    this.frameIndex = (this.frameIndex + 1) % this.spinnerFrames.length;
    return frame;
  }

  private getToolDescription(toolName: string, args?: any): string {
    // Helper: deep key search to be resilient to nested shapes like { input: {...} }
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

          // direct hits on this object
          for (const k of keys) {
            if (typeof (v as any)[k] === "string") return (v as any)[k];
          }

          // also consider common wrappers
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

          // walk recursively
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

    // Helper to extract file path from various possible argument structures
    const extractFilePath = (args: any): string => {
      if (!args) return "unknown";

      // Debug logging to understand the structure
      if (process.env.DEBUG_PROGRESS) {
        console.log(
          `\n[DEBUG extractFilePath] Args:`,
          JSON.stringify(args, null, 2)
        );
      }

      // If args is a string, return it directly
      if (typeof args === "string") return args;

      // Try different possible path properties
      const direct =
        args.relativePath ||
        args.path ||
        args.file ||
        args.fileName ||
        args.filePath ||
        args.target_file; // Add this common parameter

      if (typeof direct === "string") return direct;

      // Try nested or wrapped structures
      const nested = deepFindByKeys(args, [
        "relativePath",
        "path",
        "file",
        "fileName",
        "filePath",
        "target_file", // Add this common parameter
      ]);

      const result = nested || "unknown";
      if (process.env.DEBUG_PROGRESS) {
        console.log(`[DEBUG extractFilePath] Result: ${result}`);
      }

      return result;
    };

    // Helper to extract runtime regardless of nesting
    const extractRuntime = (args: any): string => {
      if (!args) return "unknown";
      if (typeof args === "string") return args;
      if (typeof args.runtime === "string") return args.runtime;
      const nested = deepFindByKeys(args, ["runtime"]);
      return nested || "unknown";
    };

    // Map tool names to user-friendly descriptions
    switch (toolName) {
      case "edit.subAgentWrite":
        return `Editing file ${chalk.cyan(extractFilePath(args))}`;

      case "edit.searchReplace":
        return `Searching and replacing in ${chalk.cyan(
          extractFilePath(args)
        )}`;

      case "fs.writeFile":
        return `Writing file ${chalk.cyan(extractFilePath(args))}`;

      case "fs.readFile":
        return `Reading file ${chalk.cyan(extractFilePath(args))}`;

      case "fs.listDir":
        return `Listing directory ${chalk.cyan(args?.relativePath || ".")}`;

      case "fs.makeDir":
        return `Creating directory ${chalk.cyan(
          args?.relativePath || "unknown"
        )}`;

      case "fs.delete":
        return `Deleting ${chalk.cyan(args?.relativePath || "unknown")}`;

      case "fs.copy":
        return `Copying ${chalk.cyan(
          args?.sourcePath || "unknown"
        )} to ${chalk.cyan(args?.destinationPath || "unknown")}`;

      case "fs.move":
        return `Moving ${chalk.cyan(
          args?.sourcePath || "unknown"
        )} to ${chalk.cyan(args?.destinationPath || "unknown")}`;

      case "exec.command": {
        // Extract command from various possible argument structures
        const command =
          args?.command ||
          deepFindByKeys(args, ["command", "cmd"]) ||
          "command";
        const argsArray = args?.args || [];
        const fullCommand =
          argsArray.length > 0 ? `${command} ${argsArray.join(" ")}` : command;
        return `Running command ${chalk.cyan(fullCommand)}`;
      }

      case "exec.startServer": {
        const command =
          args?.command || deepFindByKeys(args, ["command", "cmd"]) || "server";
        const port = args?.port || deepFindByKeys(args, ["port"]) || "unknown";
        return `Starting server ${chalk.cyan(command)} on port ${chalk.cyan(
          port
        )}`;
      }

      case "exec.stopServer":
        return `Stopping server ${chalk.cyan(
          args?.name || args?.port || "unknown"
        )}`;

      case "exec.grep":
        return `Searching for ${chalk.cyan(args?.pattern || "pattern")}`;

      case "sandbox.launch":
        return `Launching ${chalk.cyan(extractRuntime(args))} sandbox`;

      case "sandbox.switch":
        return `Switching sandbox to ${chalk.cyan(extractRuntime(args))}`;

      case "sandbox.info":
        return "Getting sandbox info";

      case "sandbox.shutdown":
        return "Shutting down sandbox";

      case "browser.create":
        return "Creating browser instance";

      case "browser.navigate":
        return `Navigating to ${chalk.cyan(args?.url || "unknown")}`;

      case "browser.screenshot":
        return "Taking screenshot";

      case "context7.search":
        return `Searching libraries for ${chalk.cyan(
          args?.query || "unknown"
        )}`;

      case "context7.getDocs":
        return `Getting docs for ${chalk.cyan(args?.id || "unknown")}`;

      case "docs.fetchUrl":
        return `Fetching docs from ${chalk.cyan(args?.url || "unknown")}`;

      case "hyperagent.run":
        return `Running HyperAgent task: ${chalk.cyan(
          args?.task?.substring(0, 50) + "..." || "unknown"
        )}`;

      default:
        // Handle MCP tools
        if (toolName.startsWith("mcp.")) {
          const parts = toolName.split(".");
          const serverName = parts[1];
          const toolFunction = parts.slice(2).join(".");
          return `Using ${chalk.cyan(serverName)} tool ${chalk.cyan(
            toolFunction
          )}`;
        }
        return `Running ${chalk.cyan(toolName)}`;
    }
  }

  private getResultInfo(toolName: string, result?: any): string | null {
    if (!result) return null;

    switch (toolName) {
      case "edit.subAgentWrite":
        if (result.success) {
          const action = result.message?.includes("created")
            ? "created"
            : "modified";
          if (result.diffSummary) {
            return `${action}, ${result.diffSummary}`;
          } else if (result.linesWritten) {
            return `${action}, ${result.linesWritten} lines`;
          }
          return action;
        }
        return `failed: ${result.message || "unknown error"}`;

      case "edit.searchReplace":
        if (result.success && result.occurrences !== undefined) {
          return `${result.occurrences} replacement(s)`;
        }
        return result.success ? "completed" : "failed";

      case "fs.writeFile":
      case "fs.readFile":
      case "fs.makeDir":
      case "fs.delete":
      case "fs.copy":
      case "fs.move":
        return result.success !== false
          ? "completed"
          : `failed: ${result.error}`;

      case "fs.listDir":
        if (Array.isArray(result)) {
          return `${result.length} items`;
        }
        return "completed";

      case "exec.command":
        if (result.success) {
          const duration = result.duration ? `${result.duration}ms` : "";
          const outputLines = result.output
            ? result.output.split("\n").filter((l: string) => l.trim()).length
            : 0;
          if (duration && outputLines > 1) {
            return `${duration}, ${outputLines} lines output`;
          } else if (duration) {
            return duration;
          } else if (outputLines > 1) {
            return `${outputLines} lines output`;
          }
          return "completed";
        }
        return `failed: ${result.error || "execution failed"}`;

      case "exec.startServer":
        if (result.success) {
          const port = result.port ? ` on port ${result.port}` : "";
          const pid = result.pid ? ` (PID ${result.pid})` : "";
          return `started${port}${pid}`;
        }
        return `failed: ${
          result.message || result.error || "server start failed"
        }`;

      case "exec.findPidsByPort":
        if (result.success && result.pids?.length > 0) {
          const method = result.method ? ` via ${result.method}` : "";
          return `found ${result.pids.length} process(es)${method}`;
        } else if (result.success) {
          const method = result.method ? ` (${result.method})` : "";
          return `port free${method}`;
        }
        return `failed: ${result.error || "port check failed"}`;

      case "exec.freePort":
        if (result.success) {
          const killed = result.killedPids?.length || 0;
          return killed > 0
            ? `freed port, killed ${killed} process(es)`
            : "port was free";
        }
        return `failed: ${result.error || "could not free port"}`;

      case "exec.grep":
        if (result.success && result.count !== undefined) {
          return `${result.count} matches found`;
        }
        return result.success ? "completed" : "failed";

      case "docs.fetchUrl": {
        const url: string | undefined = result?.url;
        const text: string | undefined = result?.text;
        if (url && typeof text === "string") {
          try {
            const host = new URL(url).host;
            return `fetched ${text.length} chars from ${host}`;
          } catch {
            return `fetched ${text.length} chars`;
          }
        }
        return result?.success === false
          ? `failed: ${result.error}`
          : "completed";
      }

      case "sandbox.launch":
      case "sandbox.switch":
        if (result.containerId) {
          return `container ${result.containerId.substring(0, 12)}`;
        }
        return "completed";

      case "browser.navigate":
        if (result.success && result.title) {
          return `loaded: ${result.title.substring(0, 30)}...`;
        }
        return result.success ? "loaded" : "failed";

      case "context7.search":
        // This would depend on the actual result structure
        return "completed";

      default:
        // Generic success/failure handling
        if (result.success === false) {
          return `failed: ${result.error || result.message || "unknown error"}`;
        }
        return "completed";
    }
  }

  private isSuccessResult(result?: any): boolean {
    if (!result) return true; // Assume success if no result

    // Handle different success indicators
    if (result.success === false) return false;
    if (result.ok === false) return false;
    if (result.error) return false;

    return true;
  }
}

// Global progress indicator instance
export const progressIndicator = new ProgressIndicator();

// Enhanced progress tracker for interactive CLI
export interface ToolCallProgress {
  id: string;
  toolName: string;
  args: any;
  result?: any;
  startTime: number;
  endTime?: number;
  status: "running" | "completed" | "failed";
}

class InteractiveProgressTracker {
  private callbacks: {
    onStart?: (data: ToolCallProgress) => void;
    onFinish?: (data: ToolCallProgress) => void;
  } = {};

  setCallbacks(callbacks: {
    onStart?: (data: ToolCallProgress) => void;
    onFinish?: (data: ToolCallProgress) => void;
  }) {
    this.callbacks = callbacks;
  }

  startProgress(id: string, toolName: string, args: any) {
    const data: ToolCallProgress = {
      id,
      toolName,
      args,
      startTime: performance.now(),
      status: "running",
    };

    this.callbacks.onStart?.(data);
  }

  finishProgress(id: string, result?: any) {
    const data: ToolCallProgress = {
      id,
      toolName: "", // Will be updated by the callback handler
      args: {},
      startTime: performance.now(),
      endTime: performance.now(),
      result,
      status: this.determineStatus(result),
    };

    this.callbacks.onFinish?.(data);
  }

  private determineStatus(result?: any): "completed" | "failed" {
    if (!result) return "completed";

    // Check various failure indicators
    if (result.success === false) return "failed";
    if (result.ok === false) return "failed";
    if (result.error) return "failed";

    return "completed";
  }
}

export const interactiveProgressTracker = new InteractiveProgressTracker();
