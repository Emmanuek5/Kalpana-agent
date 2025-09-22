import { performance } from "perf_hooks";

// Interface for collected tool execution data
export interface ToolExecution {
  id: string;
  toolName: string;
  args: any;
  startTime: number;
  endTime?: number;
  result?: any;
  error?: any;
  status: "running" | "completed" | "failed";
}

// Tool execution collector class
export class ToolExecutionCollector {
  private executions = new Map<string, ToolExecution>();
  private listeners: Array<(execution: ToolExecution) => void> = [];

  // Start tracking a tool execution
  startExecution(id: string, toolName: string, args: any): void {
    const execution: ToolExecution = {
      id,
      toolName,
      args,
      startTime: performance.now(),
      status: "running",
    };

    this.executions.set(id, execution);
    this.notifyListeners(execution);
  }

  // Complete a tool execution with results
  completeExecution(id: string, result: any): void {
    const execution = this.executions.get(id);
    if (!execution) return;

    execution.endTime = performance.now();
    execution.result = result;
    execution.status = "completed";

    this.notifyListeners(execution);
  }

  // Mark a tool execution as failed
  failExecution(id: string, error: any): void {
    const execution = this.executions.get(id);
    if (!execution) return;

    execution.endTime = performance.now();
    execution.error = error;
    execution.status = "failed";

    this.notifyListeners(execution);
  }

  // Get execution data by ID
  getExecution(id: string): ToolExecution | undefined {
    return this.executions.get(id);
  }

  // Get all executions
  getAllExecutions(): ToolExecution[] {
    return Array.from(this.executions.values());
  }

  // Get running executions
  getRunningExecutions(): ToolExecution[] {
    return Array.from(this.executions.values()).filter(
      (exec) => exec.status === "running"
    );
  }

  // Add a listener for execution updates
  addListener(listener: (execution: ToolExecution) => void): void {
    this.listeners.push(listener);
  }

  // Remove a listener
  removeListener(listener: (execution: ToolExecution) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  // Clear old executions (keep last N)
  cleanup(keepLast: number = 100): void {
    const executions = Array.from(this.executions.entries());
    if (executions.length <= keepLast) return;

    // Sort by start time and keep the most recent
    executions.sort(([, a], [, b]) => b.startTime - a.startTime);
    const toKeep = executions.slice(0, keepLast);

    this.executions.clear();
    for (const [id, execution] of toKeep) {
      this.executions.set(id, execution);
    }
  }

  // Get execution duration
  getDuration(id: string): number | undefined {
    const execution = this.executions.get(id);
    if (!execution || !execution.endTime) return undefined;
    return execution.endTime - execution.startTime;
  }

  // Get formatted execution summary
  getExecutionSummary(id: string): string {
    const execution = this.executions.get(id);
    if (!execution) return "Unknown execution";

    const duration = execution.endTime
      ? execution.endTime - execution.startTime
      : undefined;

    const durationStr = duration
      ? duration > 1000
        ? `${(duration / 1000).toFixed(1)}s`
        : `${Math.round(duration)}ms`
      : "running";

    const status =
      execution.status === "completed"
        ? "✅"
        : execution.status === "failed"
        ? "❌"
        : "🔄";

    return `${status} ${execution.toolName} - ${durationStr}`;
  }

  // Helper to extract commonly needed parameters from tool arguments
  extractToolInfo(execution: ToolExecution): {
    filePath?: string;
    command?: string;
    workdir?: string;
    runtime?: string;
    port?: number | string;
    url?: string;
    description?: string;
  } {
    const { toolName, args } = execution;
    const info: any = {};

    // Extract file path from various possible structures
    if (args) {
      info.filePath =
        args.relativePath ||
        args.path ||
        args.file ||
        args.fileName ||
        args.filePath ||
        args.target_file ||
        args.targetFile;

      // Extract command
      info.command = args.command || args.cmd;

      // Extract working directory
      info.workdir = args.workdir || args.cwd || args.workingDirectory;

      // Extract runtime/environment info
      info.runtime = args.runtime || args.environment;

      // Extract port
      info.port = args.port || args.hostPort || args.containerPort;

      // Extract URL
      info.url = args.url || args.endpoint;

      // Build a description based on tool type and extracted info
      switch (toolName) {
        case "fs.readFile":
        case "fs.writeFile":
        case "edit.searchReplace":
        case "edit.subAgentWrite":
          info.description = info.filePath || "unknown file";
          break;
        case "exec.command":
        case "exec.startServer":
          const cmdDesc = info.command || "unknown command";
          const portDesc = info.port ? ` on port ${info.port}` : "";
          const workdirDesc = info.workdir ? ` in ${info.workdir}` : "";
          info.description = `${cmdDesc}${portDesc}${workdirDesc}`;
          break;
        case "sandbox.launch":
        case "sandbox.switch":
          info.description = `${info.runtime || "unknown"} runtime`;
          break;
        case "docker.start":
          const image = args.image || "container";
          const ports = args.ports?.length
            ? ` with ${args.ports.length} port(s)`
            : "";
          info.description = `${image}${ports}`;
          break;
        case "docker.getCurrentContainer":
        case "docker.listNetworks":
          info.description = "container info";
          break;
        case "browser.navigate":
        case "docs.fetchUrl":
          info.description = info.url || "unknown URL";
          break;
        default:
          // Try to find any meaningful string parameter
          const meaningful = Object.values(args).find(
            (val) =>
              typeof val === "string" && val.length > 0 && val.length < 100
          );
          info.description = meaningful || "tool execution";
      }
    }

    return info;
  }

  private notifyListeners(execution: ToolExecution): void {
    for (const listener of this.listeners) {
      try {
        listener(execution);
      } catch (error) {
        console.error("Error in tool execution listener:", error);
      }
    }
  }
}

// Global instance
export const toolCollector = new ToolExecutionCollector();

// Helper function to wrap tool functions with collection
export function wrapToolWithCollection<T extends (...args: any[]) => any>(
  toolName: string,
  toolFn: T
): T {
  return ((...args: any[]) => {
    const id = `${toolName}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Start collection
    toolCollector.startExecution(id, toolName, args[0] || args);

    // Execute the tool
    try {
      const result = toolFn(...args);

      // Handle both sync and async results
      if (result && typeof result.then === "function") {
        // Async result
        return result
          .then((res: any) => {
            toolCollector.completeExecution(id, res);
            return res;
          })
          .catch((error: any) => {
            toolCollector.failExecution(id, error);
            throw error;
          });
      } else {
        // Sync result
        toolCollector.completeExecution(id, result);
        return result;
      }
    } catch (error) {
      toolCollector.failExecution(id, error);
      throw error;
    }
  }) as T;
}
