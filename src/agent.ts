import "dotenv/config";
import { z } from "zod";
import {
  generateText,
  tool,
  stepCountIs,
  zodSchema,
  type ModelMessage,
} from "ai";
import {
  createOpenRouter,
  openrouter as defaultOpenRouter,
} from "@openrouter/ai-sdk-provider";
import { startContainer, execInContainer, stopContainer } from "./tools/docker";
import { createSession, navigate, stopSession } from "./tools/hyperbrowser";
import { context7Search, context7GetDocs, fetchDocsByUrl } from "./tools/docs";
import {
  fsWriteFile,
  fsReadFile,
  fsListDir,
  fsMakeDir,
  fsDelete,
  fsCopy,
  fsMove,
  fsStats,
} from "./tools/fs";
import { searchReplace, subAgentWrite } from "./tools/edit";
import {
  execCommand,
  startServer,
  stopServer,
  listServers,
  getServerLogs,
  findPidsByPort,
  killPid,
  freePort,
  grepWorkspace,
} from "./tools/exec";
import {
  createInternalBrowser,
  navigate as browserNavigate,
  screenshot,
  click,
  type as browserType,
  waitFor,
  evaluate,
  getPageContent,
  closeBrowser,
  getBrowserStatus,
} from "./tools/browser";
import {
  launchSandbox,
  shutdownSandbox,
  switchSandboxRuntime,
  getSandboxInfo,
} from "./sandbox";
import { startHyperAgentTask } from "./tools/hyperagent";
import { mcpManager } from "./mcp";
import chalk from "chalk";

const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : defaultOpenRouter;

// Wrapper to safely execute tool functions with error handling
function createSafeToolWrapper<T extends (...args: any[]) => any>(
  toolName: string,
  toolFn: T
): T {
  return ((...args: any[]) => {
    try {
      const result = toolFn(...args);

      // Handle both sync and async functions
      if (result && typeof result.then === "function") {
        return result.catch((error: Error) => {
          console.error(
            chalk.red(`Tool error [${toolName}]: ${error.message}`)
          );
          return {
            success: false,
            error: error.message,
            toolName,
            recoverable: true,
          };
        });
      }

      return result;
    } catch (error) {
      console.error(
        chalk.red(`Tool error [${toolName}]: ${(error as Error).message}`)
      );
      return {
        success: false,
        error: (error as Error).message,
        toolName,
        recoverable: true,
      };
    }
  }) as T;
}

export async function runAgent(
  userInstruction: string,
  history: ModelMessage[] = []
) {
  const model = openrouter(process.env.MODEL_ID || "openai/gpt-4o-mini");

  // Start loading MCP tools in background (non-blocking)
  if (
    !mcpManager.isLoadingTools() &&
    mcpManager.getLoadedServers().length === 0
  ) {
    mcpManager.startLoadingFromConfig().catch((error) => {
      console.error(chalk.red(`MCP loading failed: ${error.message}`));
    });
  }

  let system = process.env.AI_SYSTEM || "";
  if (!system) {
    try {
      const fs = await import("node:fs/promises");
      system = await fs.readFile("system.txt", "utf8");
    } catch {}
  }
  if (!system) {
    system =
      "You are a helpful, concise AI agent with expert developer skills. Prefer step-by-step tool use and precise answers. If a tool fails, continue with alternative approaches and report the issue.";
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000);
  const to = setTimeout(
    () => controller.abort("AI request timeout"),
    timeoutMs
  );

  let result;
  try {
    // Get current MCP tools (may be empty if still loading)
    const mcpTools = mcpManager.getTools();

    // Log MCP status if tools are loading
    if (mcpManager.isLoadingTools()) {
      console.log(
        chalk.blue("🔄 MCP tools are still loading in background...")
      );
    } else if (Object.keys(mcpTools).length > 0) {
      console.log(
        chalk.green(
          `🛠️ Using ${Object.keys(mcpTools).length} MCP tools from: ${mcpManager
            .getLoadedServers()
            .join(", ")}`
        )
      );
    }

    result = await generateText({
      model,
      messages: [...history, { role: "user", content: userInstruction }],
      system,
      stopWhen: stepCountIs(18),
      providerOptions: {
        openrouter: {
          include_reasoning: false,
        },
      },
      tools: {
        // Merge static tools with dynamic MCP tools
        ...mcpTools,
        // Sandbox lifecycle
        "sandbox.launch": tool<
          {
            runtime: "node" | "python";
            hostVolumePath: string;
            reuseContainerId?: string;
          },
          { containerId: string; runtime: string }
        >({
          description:
            "Launch or reuse a single sandbox container with a persistent host volume.",
          inputSchema: zodSchema(
            z.object({
              runtime: z.enum(["node", "python"] as const),
              hostVolumePath: z.string(),
              reuseContainerId: z.string().optional(),
            })
          ),
          execute: createSafeToolWrapper(
            "sandbox.launch",
            async ({ runtime, hostVolumePath, reuseContainerId }) => {
              const s = await launchSandbox(
                runtime,
                hostVolumePath,
                reuseContainerId
              );
              return { containerId: s.containerId, runtime: s.runtime };
            }
          ),
        }),

        "sandbox.info": tool<
          {},
          { runtime: string; containerId: string } | { error: string }
        >({
          description:
            "Get information about the currently active sandbox container (runtime type and container ID).",
          inputSchema: zodSchema(z.object({})),
          execute: async () => {
            const info = getSandboxInfo();
            if (!info) {
              return { error: "No active sandbox container" };
            }
            return { runtime: info.runtime, containerId: info.containerId };
          },
        }),

        "sandbox.switch": tool<
          { runtime: "node" | "python" },
          { containerId: string; runtime: string; switched: boolean }
        >({
          description:
            "Switch sandbox runtime (node/python). Will reuse existing container if already correct runtime, or create new one with same volume if different runtime needed.",
          inputSchema: zodSchema(
            z.object({
              runtime: z.enum(["node", "python"] as const),
            })
          ),
          execute: async ({ runtime }) => {
            const currentInfo = getSandboxInfo();
            if (currentInfo && currentInfo.runtime === runtime) {
              return {
                containerId: currentInfo.containerId,
                runtime: currentInfo.runtime,
                switched: false,
              };
            }
            const s = await switchSandboxRuntime(runtime);
            return {
              containerId: s.containerId,
              runtime: s.runtime,
              switched: true,
            };
          },
        }),

        // Hyperbrowser: HyperAgent subagent runner
        "hyperagent.run": tool<
          {
            task: string;
            llm?: string;
            sessionId?: string;
            maxSteps?: number;
            keepBrowserOpen?: boolean;
          },
          unknown
        >({
          description:
            "Run a HyperAgent task (subagent) to browse and act on the web.",
          inputSchema: zodSchema(
            z.object({
              task: z.string(),
              llm: z.string().optional(),
              sessionId: z.string().optional(),
              maxSteps: z.number().optional(),
              keepBrowserOpen: z.boolean().optional(),
            })
          ),
          execute: startHyperAgentTask as any,
        }),
        "sandbox.shutdown": tool<{}, { ok: true }>({
          description: "Stop and remove the active sandbox container.",
          inputSchema: zodSchema(z.object({})),
          execute: async () => ({ ok: (await shutdownSandbox()).ok as true }),
        }),

        // File system tools (restricted to sandbox volume)
        "fs.writeFile": tool<
          { relativePath: string; content: string },
          { ok: true }
        >({
          description: "Write a file inside the sandbox persistent volume.",
          inputSchema: zodSchema(
            z.object({ relativePath: z.string(), content: z.string() })
          ),
          execute: fsWriteFile as any,
        }),
        "fs.readFile": tool<{ relativePath: string }, { text: string }>({
          description: "Read a file from the sandbox persistent volume.",
          inputSchema: zodSchema(z.object({ relativePath: z.string() })),
          execute: fsReadFile as any,
        }),
        "fs.listDir": tool<
          { relativePath?: string; recursive?: boolean },
          { name: string; type: string; path: string }[]
        >({
          description:
            "List files in a directory within the sandbox volume. Use recursive=true for deep directory scanning.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string().optional(),
              recursive: z.boolean().optional(),
            })
          ),
          execute: async (args) => {
            const res = (await fsListDir(args as any)) as any;
            try {
              const entries = Array.isArray(res) ? res : [];
              console.log(
                chalk.gray(
                  `[fs.listDir] ${args?.relativePath ?? "."} -> ${
                    entries.length
                  } entries`
                )
              );
              for (const e of entries.slice(0, 50)) {
                console.log(chalk.gray(`  - ${e.type} ${e.path}`));
              }
              if (entries.length > 50) {
                console.log(chalk.gray(`  ... (${entries.length - 50} more)`));
              }
            } catch {}
            return res;
          },
        }),

        "fs.makeDir": tool<
          { relativePath: string; recursive?: boolean },
          { ok: boolean; path: string }
        >({
          description: "Create a directory within the sandbox volume.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string(),
              recursive: z.boolean().optional(),
            })
          ),
          execute: fsMakeDir as any,
        }),

        "fs.delete": tool<
          { relativePath: string; recursive?: boolean },
          { ok: boolean; deleted?: string; error?: string }
        >({
          description: "Delete a file or directory within the sandbox volume.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string(),
              recursive: z.boolean().optional(),
            })
          ),
          execute: fsDelete as any,
        }),

        "fs.copy": tool<
          { sourcePath: string; destinationPath: string },
          { ok: boolean; copied?: string; error?: string }
        >({
          description: "Copy a file or directory within the sandbox volume.",
          inputSchema: zodSchema(
            z.object({
              sourcePath: z.string(),
              destinationPath: z.string(),
            })
          ),
          execute: fsCopy as any,
        }),

        "fs.move": tool<
          { sourcePath: string; destinationPath: string },
          { ok: boolean; moved?: string; error?: string }
        >({
          description:
            "Move/rename a file or directory within the sandbox volume.",
          inputSchema: zodSchema(
            z.object({
              sourcePath: z.string(),
              destinationPath: z.string(),
            })
          ),
          execute: fsMove as any,
        }),

        "fs.stats": tool<
          { relativePath: string },
          { ok: boolean; stats?: any; error?: string }
        >({
          description:
            "Get file or directory statistics (size, dates, permissions).",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string(),
            })
          ),
          execute: fsStats as any,
        }),

        // Advanced file editing tools
        "edit.searchReplace": tool<
          {
            relativePath: string;
            searchText: string;
            replaceText: string;
            replaceAll?: boolean;
          },
          { success: boolean; occurrences: number; message: string }
        >({
          description:
            "Search and replace text in a file. Can replace first occurrence or all occurrences.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string(),
              searchText: z.string(),
              replaceText: z.string(),
              replaceAll: z.boolean().optional(),
            })
          ),
          execute: searchReplace as any,
        }),

        "edit.subAgentWrite": tool<
          {
            relativePath: string;
            instruction: string;
            createIfNotExists?: boolean;
          },
          {
            success: boolean;
            message: string;
            summary: string;
            warnings?: string[];
            linesWritten?: number;
          }
        >({
          description:
            "Use a specialized sub-agent to write or modify files based on natural language instructions. The sub-agent has full file context and follows best practices. Returns structured output with content summary.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string(),
              instruction: z.string(),
              createIfNotExists: z.boolean().optional(),
            })
          ),
          execute: subAgentWrite as any,
        }),

        // Command execution tools
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
            "Execute a command inside the sandbox container. Use for running scripts, installing packages, or general command execution.",
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
            } catch {}
            return res as any;
          }),
        }),

        "exec.startServer": tool<
          {
            command: string;
            args?: string[];
            port: number;
            env?: Record<string, string>;
            workdir?: string;
            name?: string;
          },
          {
            success: boolean;
            message: string;
            name?: string;
            port?: number;
            pid?: number;
            logFile?: string;
            error?: string;
          }
        >({
          description:
            "Start a server/application in the background within the sandbox. Tracks running servers and provides process management.",
          inputSchema: zodSchema(
            z.object({
              command: z.string(),
              args: z.array(z.string()).optional(),
              port: z.number(),
              env: z.record(z.string(), z.string()).optional(),
              workdir: z.string().optional(),
              name: z.string().optional(),
            })
          ),
          execute: startServer as any,
        }),

        "exec.stopServer": tool<
          { name?: string; port?: number },
          {
            success: boolean;
            message: string;
            name?: string;
            warning?: string;
          }
        >({
          description: "Stop a running server by name or port.",
          inputSchema: zodSchema(
            z.object({
              name: z.string().optional(),
              port: z.number().optional(),
            })
          ),
          execute: stopServer as any,
        }),

        "exec.listServers": tool<
          {},
          {
            success: boolean;
            servers: Array<{
              name: string;
              port: number;
              pid?: number;
              containerId: string;
            }>;
            count: number;
          }
        >({
          description: "List all running servers in the sandbox.",
          inputSchema: zodSchema(z.object({})),
          execute: async () => {
            const r = await listServers();
            try {
              console.log(chalk.gray(`[exec.listServers] count=${r.count}`));
              for (const s of r.servers) {
                console.log(
                  chalk.gray(
                    `  - ${s.name} port=${s.port} pid=${
                      s.pid ?? "?"
                    } container=${s.containerId}`
                  )
                );
              }
            } catch {}
            return r as any;
          },
        }),

        // Process management
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
          description:
            "Send a signal (default TERM) to a PID inside the sandbox.",
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

        "exec.getServerLogs": tool<
          { serverName: string; lines?: number },
          {
            success: boolean;
            logs?: string;
            serverName?: string;
            message?: string;
          }
        >({
          description: "Get logs from a running server.",
          inputSchema: zodSchema(
            z.object({
              serverName: z.string(),
              lines: z.number().optional(),
            })
          ),
          execute: async ({ serverName, lines }) =>
            (await getServerLogs(serverName, lines)) as any,
        }),

        // Internal browser tools
        "browser.create": tool<
          {
            headless?: boolean;
            viewport?: { width: number; height: number };
          },
          {
            success: boolean;
            message?: string;
            sessionId?: string;
            error?: string;
          }
        >({
          description:
            "Create an internal Puppeteer browser instance within the sandbox container. This browser can access localhost applications.",
          inputSchema: zodSchema(
            z.object({
              headless: z.boolean().optional(),
              viewport: z
                .object({
                  width: z.number(),
                  height: z.number(),
                })
                .optional(),
            })
          ),
          execute: createSafeToolWrapper(
            "browser.create",
            createInternalBrowser as any
          ),
        }),

        "browser.navigate": tool<
          {
            url: string;
            waitFor?:
              | "load"
              | "domcontentloaded"
              | "networkidle0"
              | "networkidle2";
            timeout?: number;
          },
          {
            success: boolean;
            title?: string;
            url?: string;
            message?: string;
            error?: string;
          }
        >({
          description: "Navigate the internal browser to a URL.",
          inputSchema: zodSchema(
            z.object({
              url: z.string(),
              waitFor: z
                .enum([
                  "load",
                  "domcontentloaded",
                  "networkidle0",
                  "networkidle2",
                ])
                .optional(),
              timeout: z.number().optional(),
            })
          ),
          execute: createSafeToolWrapper(
            "browser.navigate",
            browserNavigate as any
          ),
        }),

        "browser.screenshot": tool<
          {
            path?: string;
            fullPage?: boolean;
            quality?: number;
            type?: "png" | "jpeg";
          },
          {
            success: boolean;
            path?: string;
            relativePath?: string;
            message?: string;
            error?: string;
          }
        >({
          description:
            "Take a screenshot of the current page in the internal browser.",
          inputSchema: zodSchema(
            z.object({
              path: z.string().optional(),
              fullPage: z.boolean().optional(),
              quality: z.number().optional(),
              type: z.enum(["png", "jpeg"]).optional(),
            })
          ),
          execute: screenshot as any,
        }),

        "browser.click": tool<
          { selector: string; timeout?: number },
          {
            success: boolean;
            message?: string;
            error?: string;
          }
        >({
          description:
            "Click an element in the internal browser by CSS selector.",
          inputSchema: zodSchema(
            z.object({
              selector: z.string(),
              timeout: z.number().optional(),
            })
          ),
          execute: click as any,
        }),

        "browser.type": tool<
          { selector: string; text: string; delay?: number },
          {
            success: boolean;
            message?: string;
            error?: string;
          }
        >({
          description: "Type text into an element in the internal browser.",
          inputSchema: zodSchema(
            z.object({
              selector: z.string(),
              text: z.string(),
              delay: z.number().optional(),
            })
          ),
          execute: browserType as any,
        }),

        "browser.waitFor": tool<
          { selector?: string; timeout?: number; visible?: boolean },
          {
            success: boolean;
            message?: string;
            error?: string;
          }
        >({
          description:
            "Wait for an element to appear or for a timeout in the internal browser.",
          inputSchema: zodSchema(
            z.object({
              selector: z.string().optional(),
              timeout: z.number().optional(),
              visible: z.boolean().optional(),
            })
          ),
          execute: waitFor as any,
        }),

        "browser.evaluate": tool<
          { script: string },
          {
            success: boolean;
            result?: any;
            message?: string;
            error?: string;
          }
        >({
          description:
            "Execute JavaScript code in the internal browser page context.",
          inputSchema: zodSchema(
            z.object({
              script: z.string(),
            })
          ),
          execute: evaluate as any,
        }),

        "browser.getContent": tool<
          {},
          {
            success: boolean;
            content?: string;
            title?: string;
            url?: string;
            length?: number;
            error?: string;
          }
        >({
          description:
            "Get the HTML content of the current page in the internal browser.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper(
            "browser.getContent",
            getPageContent as any
          ),
        }),

        "browser.close": tool<
          {},
          {
            success: boolean;
            message?: string;
            error?: string;
          }
        >({
          description: "Close the internal browser instance.",
          inputSchema: zodSchema(z.object({})),
          execute: closeBrowser as any,
        }),

        "browser.status": tool<
          {},
          {
            active: boolean;
            sessionId?: string;
          }
        >({
          description: "Get the status of the internal browser.",
          inputSchema: zodSchema(z.object({})),
          execute: getBrowserStatus as any,
        }),

        "docker.start": tool<
          import("./tools/docker").StartContainerInput,
          unknown
        >({
          description:
            "Start a Docker container with optional volumes, ports, env, and network settings.",
          inputSchema: zodSchema(
            z.object({
              image: z.string(),
              cmd: z.array(z.string()).optional(),
              name: z.string().optional(),
              workdir: z.string().optional(),
              env: z.record(z.string(), z.string()).optional(),
              volumes: z
                .array(
                  z.object({
                    hostPath: z.string(),
                    containerPath: z.string(),
                    mode: z.enum(["ro", "rw"] as const).optional(),
                  })
                )
                .optional(),
              ports: z
                .array(
                  z.object({
                    hostPort: z.number(),
                    containerPort: z.number(),
                    protocol: z.enum(["tcp", "udp"] as const).optional(),
                  })
                )
                .optional(),
              network: z.string().optional(),
            })
          ),
          execute: startContainer as any,
        }),
        "docker.exec": tool<
          import("./tools/docker").ExecInContainerInput,
          { output: string }
        >({
          description: "Execute a command inside a running container",
          inputSchema: zodSchema(
            z.object({
              containerId: z.string(),
              cmd: z.array(z.string()),
              workdir: z.string().optional(),
            })
          ),
          execute: execInContainer as any,
        }),
        "docker.stop": tool<
          import("./tools/docker").StopContainerInput,
          { ok: boolean }
        >({
          description: "Stop (and optionally remove) a container by id",
          inputSchema: zodSchema(
            z.object({
              containerId: z.string(),
              remove: z.boolean().optional(),
            })
          ),
          execute: stopContainer as any,
        }),
        "hbrowser.session.create": tool<
          import("./tools/hyperbrowser").CreateSessionInput,
          { id: string; wsEndpoint: string }
        >({
          description: "Create a Hyperbrowser session",
          inputSchema: zodSchema(
            z.object({
              profile: z
                .object({
                  id: z.string().optional(),
                  persistChanges: z.boolean().optional(),
                })
                .optional(),
            })
          ),
          execute: createSession as any,
        }),
        "hbrowser.session.stop": tool<{ sessionId: string }, { ok: true }>({
          description: "Stop a Hyperbrowser session",
          inputSchema: zodSchema(z.object({ sessionId: z.string() })),
          execute: async (args) => ({
            ok: (await stopSession(args.sessionId)).ok as true,
          }),
        }),
        "hbrowser.navigate": tool<
          import("./tools/hyperbrowser").NavigateInput,
          { title: string; html: string }
        >({
          description:
            "Navigate a page within a Hyperbrowser session and return HTML",
          inputSchema: zodSchema(
            z.object({ sessionId: z.string(), url: z.string().url() })
          ),
          execute: navigate as any,
        }),
        "context7.search": tool<{ query: string }, unknown>({
          description: "Search libraries on Context7",
          inputSchema: zodSchema(z.object({ query: z.string() })),
          execute: context7Search as any,
        }),
        "context7.getDocs": tool<
          {
            id: string;
            topic?: string;
            type?: "json" | "txt";
            tokens?: number;
          },
          unknown
        >({
          description: "Fetch docs for a library from Context7",
          inputSchema: zodSchema(
            z.object({
              id: z.string(),
              topic: z.string().optional(),
              type: z.enum(["json", "txt"]).optional(),
              tokens: z.number().optional(),
            })
          ),
          execute: context7GetDocs as any,
        }),
        "docs.fetchUrl": tool<{ url: string }, { url: string; text: string }>({
          description: "Fetch raw text from a URL if Context7 not available",
          inputSchema: zodSchema(z.object({ url: z.string().url() })),
          execute: fetchDocsByUrl as any,
        }),

        // Workspace grep search
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
      },

      onStepFinish({ toolCalls, toolResults }) {
        for (const call of toolCalls) {
          console.log(chalk.yellow(`Tool called: ${call.toolName}`));
        }
        for (const res of toolResults) {
          console.log(chalk.gray(`Tool finished: ${res.toolName}`));
        }
      },
      abortSignal: controller.signal,
    });
    clearTimeout(to);

    const responseMessages = (result as any).response?.messages as
      | ModelMessage[]
      | undefined;
    if (responseMessages && Array.isArray(responseMessages)) {
      return { text: result.text, messages: responseMessages };
    }
    // Fallback: append simple assistant message
    return {
      text: result.text,
      messages: [
        ...history,
        { role: "user", content: userInstruction },
        { role: "assistant", content: result.text },
      ] as ModelMessage[],
    };
  } catch (error) {
    clearTimeout(to);

    // Log the error for debugging
    console.error(
      chalk.red(`Agent execution error: ${(error as Error).message}`)
    );

    // Create fallback conversation state preserving history
    const errorMessage = `I encountered an error while processing your request: ${
      (error as Error).message
    }. However, I'm still here and ready to help with your next request.`;

    const fallbackMessages: ModelMessage[] = [
      ...history,
      { role: "user", content: userInstruction },
      { role: "assistant", content: errorMessage },
    ];

    return {
      text: errorMessage,
      messages: fallbackMessages,
    };
  }
}

// Cleanup function for MCP clients
export async function cleanup() {
  await mcpManager.cleanup();
}
