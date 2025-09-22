import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  execCommand,
  findPidsByPort,
  killPid,
  freePort,
  grepWorkspace,
  listAllProcesses,
  getProcessInfo,
  getProcessLogs,
} from "../../tools/exec";
import { createSafeToolWrapper } from "../safeToolWrapper";
import chalk from "chalk";

export function buildExecTools() {
  return {
    "exec.command": tool<
      {
        command: string;
        args?: string[];
        workdir?: string;
        env?: Record<string, string>;
        timeout?: number;
      },
      {
        success: boolean;
        output: string;
        duration?: number;
        error?: string;
        command: string;
      }
    >({
      description:
        "Execute a command inside the multi-runtime sandbox container. Available runtimes: node, npm, bun, python, pip, uv. Use for running scripts, installing packages, or general command execution.",
      inputSchema: zodSchema(
        z.object({
          command: z.string(),
          args: z.array(z.string()).optional(),
          workdir: z.string().optional(),
          env: z.record(z.string(), z.string()).optional(),
          timeout: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper("exec.command", async (args: any) => {
        const res = await execCommand(args as any);
        try {
          console.log(
            chalk.gray(
              `[exec.command] ${res.command}\n` +
                (res.success ? "(ok)" : "(fail)") +
                (res.output ? `\n${res.output}` : "")
            )
          );

          // Handle long-running/background processes
          if (res.success && (res.timedOut || res.isLongRunning)) {
            console.log(
              chalk.cyan(
                `🚀 Long-running process detected ${
                  res.pid ? `(PID: ${res.pid})` : ""
                }\n` +
                  `📊 Process timed out after 2 minutes but continues running in background\n` +
                  `💡 Use exec.getProcessLogs with PID ${
                    res.pid || "?"
                  } to check status and logs\n` +
                  `🌐 If it's a server, check localhost:PORT to see if it's accessible`
              )
            );
          }

          // Handle background processes
          if (res.success && res.isBackground && res.pid) {
            console.log(
              chalk.green(
                `🔄 Background process started (PID: ${res.pid})\n` +
                  `💡 Use exec.killPid to stop or check process status`
              )
            );
          }

          // Provide helpful guidance for common path errors
          if (
            !res.success &&
            res.output &&
            res.output.includes("no such file or directory")
          ) {
            console.log(
              chalk.yellow(
                "💡 Path error detected. Try:\n" +
                  "1. Use `ls` to check current directory structure\n" +
                  "2. Create missing directories with `mkdir -p path/to/directory`\n" +
                  "3. Verify you're in `/root/workspace` (the default working directory)"
              )
            );
          }

          // Handle stale container references
          if (
            !res.success &&
            res.error &&
            res.error.includes("no such container")
          ) {
            console.log(
              chalk.red(
                "💥 Container reference is stale! The sandbox container was removed or stopped.\n" +
                  "🔄 You need to check for running containers or start a new sandbox with `sandbox.launch` if needed."
              )
            );
          }
        } catch {}
        return res as any;
      }),
    }),

    "exec.findPidsByPort": tool<
      { port: number },
      { success: boolean; pids: number[]; method?: string; error?: string }
    >({
      description:
        "Find process IDs listening on a given TCP port inside the sandbox.",
      inputSchema: zodSchema(z.object({ port: z.number() })),
      execute: createSafeToolWrapper(
        "exec.findPidsByPort",
        async ({ port }: { port: number }) => findPidsByPort(port)
      ),
    }),

    "exec.killPid": tool<
      { pid: number; signal?: string },
      {
        success: boolean;
        pid: number;
        signal: string;
        message?: string;
        error?: string;
      }
    >({
      description: "Send a signal (default TERM) to a PID inside the sandbox.",
      inputSchema: zodSchema(
        z.object({ pid: z.number(), signal: z.string().optional() })
      ),
      execute: createSafeToolWrapper(
        "exec.killPid",
        async ({ pid, signal }: { pid: number; signal?: string }) =>
          killPid({ pid, signal })
      ),
    }),

    "exec.freePort": tool<
      { port: number; timeoutMs?: number },
      {
        success: boolean;
        port: number;
        killedPids: number[];
        remainingPids: number[];
        error?: string;
      }
    >({
      description:
        "Attempt to free a TCP port by terminating processes that occupy it.",
      inputSchema: zodSchema(
        z.object({ port: z.number(), timeoutMs: z.number().optional() })
      ),
      execute: createSafeToolWrapper(
        "exec.freePort",
        async ({ port, timeoutMs }: { port: number; timeoutMs?: number }) =>
          freePort({ port, timeoutMs })
      ),
    }),

    "exec.grep": tool<
      {
        pattern: string;
        path?: string;
        ignoreCase?: boolean;
        maxResults?: number;
      },
      {
        success: boolean;
        count: number;
        matches?: Array<{ file: string; line: number; text: string }>;
        raw?: string;
        command: string;
        error?: string;
      }
    >({
      description:
        "Search the sandbox workspace using grep (recursive, line numbers, skip binaries).",
      inputSchema: zodSchema(
        z.object({
          pattern: z.string(),
          path: z.string().optional(),
          ignoreCase: z.boolean().optional(),
          maxResults: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "exec.grep",
        async ({
          pattern,
          path,
          ignoreCase,
          maxResults,
        }: {
          pattern: string;
          path?: string;
          ignoreCase?: boolean;
          maxResults?: number;
        }) => grepWorkspace({ pattern, path, ignoreCase, maxResults })
      ),
    }),

    "exec.listProcesses": tool<{}, any>({
      description: "List all running processes in the container",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("exec.listProcesses", async () => {
        return await listAllProcesses();
      }),
    }),

    "exec.getProcessInfo": tool<{ pid: number }, any>({
      description: "Get detailed information about a specific process",
      inputSchema: zodSchema(
        z.object({
          pid: z.number().describe("Process ID to get information for"),
        })
      ),
      execute: createSafeToolWrapper(
        "exec.getProcessInfo",
        async (args: any) => {
          return await getProcessInfo(args.pid);
        }
      ),
    }),

    "exec.getProcessLogs": tool<{ pid: number; lines?: number }, any>({
      description:
        "Get logs and detailed information for a specific process by PID. Useful for checking the status and output of long-running processes that were started in the background.",
      inputSchema: zodSchema(
        z.object({
          pid: z.number().describe("Process ID to get logs for"),
          lines: z
            .number()
            .optional()
            .describe("Number of log lines to retrieve (default: 50)"),
        })
      ),
      execute: createSafeToolWrapper(
        "exec.getProcessLogs",
        async (args: any) => {
          return await getProcessLogs(args.pid, args.lines);
        }
      ),
    }),
  } as const;
}
