import "dotenv/config";
import { z } from "zod";
import {
  generateText,
  tool,
  stepCountIs,
  zodSchema,
  type ModelMessage,
} from "ai";
// Legacy agent preserved for backward compatibility during refactor.
// New implementations live under ./agents and are used by CLIs.
import { openrouter, buildSystemPrompt } from "./agents/system.ts";
import {
  createSafeToolWrapper,
  getToolStartMessage,
  getToolCompletionMessage,
} from "./agents/safeToolWrapper.ts";
import {
  startContainer,
  execInContainer,
  stopContainer,
  getCurrentContainer,
  connectToNetwork,
  disconnectFromNetwork,
  listNetworks,
  createNetwork,
  restartContainerWithPorts,
} from "./tools/docker";
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
  summarizeFile,
  fsReadFileChunk,
} from "./tools/fs";
import { searchReplace, subAgentWrite } from "./tools/edit";
import {
  execCommand,
  findPidsByPort,
  killPid,
  freePort,
  grepWorkspace,
  listAllProcesses,
  getProcessInfo,
} from "./tools/exec";
import {
  isAccountLinked,
  linkAccount,
  listFiles as gdriveListFiles,
  readFile as gdriveReadFile,
  writeFile as gdriveWriteFile,
  searchFiles as gdriveSearchFiles,
} from "./tools/gdrive";
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
import { progressIndicator, interactiveProgressTracker } from "./progress";
import { toolCollector } from "./tool-collector";
import chalk from "chalk";

export async function runAgent(
  userInstruction: string,
  history: ModelMessage[] = [],
  useInteractiveProgress = false
) {
  const model = openrouter(process.env.MODEL_ID || "openai/gpt-4o-mini");

  let system = undefined;
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

  system += `
  Today's date is ${new Date().toLocaleDateString()}. 
  `;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000);
  const to = setTimeout(
    () => controller.abort("AI request timeout"),
    timeoutMs
  );

  let result;
  try {
    // Get current MCP tools (no logging - done at startup)
    const mcpTools = mcpManager.getTools();

    // Wrap MCP tools with safe execution
    const wrappedMcpTools = Object.fromEntries(
      Object.entries(mcpTools).map(([toolName, toolDef]) => {
        if (typeof toolDef === "object" && toolDef && "execute" in toolDef) {
          return [
            toolName,
            {
              ...toolDef,
              execute: createSafeToolWrapper(toolName, toolDef.execute as any),
            },
          ];
        }
        return [toolName, toolDef];
      })
    );

    result = await generateText({
      model,
      messages: [...history, { role: "user", content: userInstruction }],
      system,
      stopWhen: stepCountIs(30),
      providerOptions: {
        openrouter: {
          include_reasoning: false,
        },
      },
      tools: {
        // Merge static tools with dynamic MCP tools
        ...wrappedMcpTools,
        // Sandbox lifecycle
        "sandbox.launch": tool<
          {
            runtime: "bun" | "node" | "python";
            hostVolumePath: string;
            reuseContainerId?: string;
          },
          { containerId: string; runtime: string }
        >({
          description:
            "Launch the multi-runtime sandbox container with ALL runtimes pre-installed (Node.js 20, Bun 1.2.22, Python 3.11, UV). Ultra-fast startup with no installation time. All runtimes are available simultaneously in the same container.",
          inputSchema: zodSchema(
            z.object({
              runtime: z.enum(["bun", "node", "python"] as const),
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
            "Get information about the currently active multi-runtime sandbox container. The container has all runtimes available: Node.js, Bun, and Python.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper("sandbox.info", async () => {
            const info = getSandboxInfo();
            if (!info) {
              return { error: "No active sandbox container" };
            }
            return { runtime: info.runtime, containerId: info.containerId };
          }),
        }),

        "sandbox.switch": tool<
          { runtime: "bun" | "node" | "python" },
          { containerId: string; runtime: string; switched: boolean }
        >({
          description:
            "Legacy runtime switching tool - NOT NEEDED with multi-runtime container. All runtimes (Node.js, Bun, Python) are available simultaneously. Use sandbox.launch instead for new containers.",
          inputSchema: zodSchema(
            z.object({
              runtime: z.enum(["bun", "node", "python"] as const),
            })
          ),
          execute: createSafeToolWrapper(
            "sandbox.switch",
            async ({ runtime }) => {
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
            }
          ),
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
          execute: createSafeToolWrapper(
            "hyperagent.run",
            startHyperAgentTask as any
          ),
        }),
        "sandbox.shutdown": tool<{}, { ok: true }>({
          description: "Stop and remove the active sandbox container.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper("sandbox.shutdown", async () => ({
            ok: (await shutdownSandbox()).ok as true,
          })),
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
          execute: createSafeToolWrapper("fs.writeFile", fsWriteFile as any),
        }),
        "fs.readFile": tool<
          { relativePath: string; startLine?: number; endLine?: number },
          any
        >({
          description: "Read a file from the sandbox persistent volume. Returns max 400 lines at a time. For large files (>1000 lines), shows summary unless specific line range requested. Use fs.summarize first for large files, then read specific chunks with startLine/endLine if needed.",
          inputSchema: zodSchema(z.object({ 
            relativePath: z.string(),
            startLine: z.number().optional(),
            endLine: z.number().optional()
          })),
          execute: createSafeToolWrapper("fs.readFile", async (args: any) => {
            const result = await fsReadFile({
              relativePath: args.relativePath,
              maxLines: 400,
              startLine: args.startLine,
              endLine: args.endLine
            });
            return result;
          }),
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
          execute: createSafeToolWrapper("fs.listDir", async (args) => {
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
              for (const e of entries.slice(0, 10)) {
                console.log(chalk.gray(`  - ${e.type} ${e.path}`));
              }
              if (entries.length > 10) {
                console.log(chalk.gray(`  ... (${entries.length - 10} more)`));
              }
            } catch {}
            return res;
          }),
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
          execute: createSafeToolWrapper("fs.makeDir", fsMakeDir as any),
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
          execute: createSafeToolWrapper("fs.delete", fsDelete as any),
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
          execute: createSafeToolWrapper("fs.copy", fsCopy as any),
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
          execute: createSafeToolWrapper("fs.move", fsMove as any),
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
          execute: createSafeToolWrapper("fs.stats", fsStats as any),
        }),

        "fs.summarize": tool<
          { relativePath: string },
          any
        >({
          description: "Get an AI-generated summary of a file's contents, structure, and purpose. Use this FIRST before reading large files to understand what they contain.",
          inputSchema: zodSchema(z.object({ relativePath: z.string() })),
          execute: createSafeToolWrapper("fs.summarize", summarizeFile as any),
        }),

        "fs.readChunk": tool<
          { relativePath: string; startLine: number; endLine: number },
          any
        >({
          description: "Read a specific chunk of lines from a file. Use after fs.summarize to read specific sections of interest.",
          inputSchema: zodSchema(z.object({ 
            relativePath: z.string(),
            startLine: z.number(),
            endLine: z.number()
          })),
          execute: createSafeToolWrapper("fs.readChunk", fsReadFileChunk as any),
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
          execute: createSafeToolWrapper(
            "edit.searchReplace",
            searchReplace as any
          ),
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
          execute: createSafeToolWrapper(
            "edit.subAgentWrite",
            subAgentWrite as any
          ),
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
            } catch {}
            return res as any;
          }),
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

        // Google Drive tools
        "pDrive.isAccountLinked": tool<{}, any>({
          description: "Check if Google Drive account is linked and get authentication status. Use this before any other Google Drive operations.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper("pDrive.isAccountLinked", async () => {
            const status = await isAccountLinked();
            
            if (status.isLinked) {
              console.log(
                chalk.green(
                  `✅ Google Drive account linked (${status.email || 'unknown email'})`
                )
              );
            } else {
              console.log(
                chalk.yellow(
                  "⚠️ Google Drive account not linked. Use pDrive.linkAccount to connect."
                )
              );
            }
            
            return status;
          }),
        }),

        "pDrive.linkAccount": tool<{}, any>({
          description: "Start Google Drive OAuth flow to link user's account. Returns authorization URL that user must visit to complete linking.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper("pDrive.linkAccount", async () => {
            const result = await linkAccount();
            
            if (result.success && result.authUrl) {
              console.log(
                chalk.cyan(
                  `🔗 Google Drive OAuth Flow Started\n` +
                  `📋 Please visit this URL to authorize access:\n` +
                  `${result.authUrl}\n\n` +
                  `🌐 Callback server running on port ${result.callbackPort}\n` +
                  `⏱️ Authorization will timeout in 5 minutes`
                )
              );
            } else {
              console.log(
                chalk.red(
                  `❌ Failed to start OAuth flow: ${result.message}`
                )
              );
            }
            
            return result;
          }),
        }),

        "pDrive.listFiles": tool<
          {
            folderId?: string;
            query?: string;
            maxResults?: number;
            orderBy?: string;
          },
          any
        >({
          description: "List files and folders in Google Drive. Can filter by folder, search query, and limit results. Use this to explore the user's Google Drive structure.",
          inputSchema: zodSchema(
            z.object({
              folderId: z.string().optional(),
              query: z.string().optional(),
              maxResults: z.number().optional(),
              orderBy: z.string().optional()
            })
          ),
          execute: createSafeToolWrapper("pDrive.listFiles", async (args: any) => {
            const result = await gdriveListFiles(args);
            
            if (result.success) {
              console.log(
                chalk.cyan(
                  `📁 Found ${result.count} files in Google Drive` +
                  (args.query ? ` (query: "${args.query}")` : '') +
                  (args.folderId ? ` (folder: ${args.folderId})` : '')
                )
              );
            } else if (result.needsAuth) {
              console.log(
                chalk.yellow(
                  "🔐 Google Drive account not linked. Use pDrive.linkAccount first."
                )
              );
            }
            
            return result;
          }),
        }),

        "pDrive.readFile": tool<
          {
            fileId: string;
            mimeType?: string;
          },
          any
        >({
          description: "Read content from a Google Drive file by its ID. Supports Google Docs, Sheets, regular text files, and more. Use pDrive.listFiles or pDrive.searchFiles to find file IDs first.",
          inputSchema: zodSchema(
            z.object({
              fileId: z.string(),
              mimeType: z.string().optional()
            })
          ),
          execute: createSafeToolWrapper("pDrive.readFile", async (args: any) => {
            const result = await gdriveReadFile(args);
            
            if (result.success) {
              console.log(
                chalk.green(
                  `📖 Read file "${result.name}" (${result.contentLength} characters)`
                )
              );
            } else if (result.needsAuth) {
              console.log(
                chalk.yellow(
                  "🔐 Google Drive account not linked. Use pDrive.linkAccount first."
                )
              );
            }
            
            return result;
          }),
        }),

        "pDrive.writeFile": tool<
          {
            name: string;
            content: string;
            folderId?: string;
            mimeType?: string;
          },
          any
        >({
          description: "Create a new file in Google Drive with the specified content. Can optionally specify a folder and MIME type.",
          inputSchema: zodSchema(
            z.object({
              name: z.string(),
              content: z.string(),
              folderId: z.string().optional(),
              mimeType: z.string().optional()
            })
          ),
          execute: createSafeToolWrapper("pDrive.writeFile", async (args: any) => {
            const result = await gdriveWriteFile(args);
            
            if (result.success) {
              console.log(
                chalk.green(
                  `✅ Created file "${result.name}" in Google Drive`
                )
              );
            } else if (result.needsAuth) {
              console.log(
                chalk.yellow(
                  "🔐 Google Drive account not linked. Use pDrive.linkAccount first."
                )
              );
            }
            
            return result;
          }),
        }),

        "pDrive.searchFiles": tool<
          {
            query: string;
            maxResults?: number;
          },
          any
        >({
          description: "Search for files in Google Drive by name or content. Returns files that match the search query.",
          inputSchema: zodSchema(
            z.object({
              query: z.string(),
              maxResults: z.number().optional()
            })
          ),
          execute: createSafeToolWrapper("pDrive.searchFiles", async (args: any) => {
            const result = await gdriveSearchFiles(args);
            
            if (result.success) {
              console.log(
                chalk.cyan(
                  `🔍 Found ${result.count} files matching "${result.query}"`
                )
              );
            } else if (result.needsAuth) {
              console.log(
                chalk.yellow(
                  "🔐 Google Drive account not linked. Use pDrive.linkAccount first."
                )
              );
            }
            
            return result;
          }),
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
          execute: createSafeToolWrapper(
            "browser.screenshot",
            screenshot as any
          ),
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
          execute: createSafeToolWrapper("browser.click", click as any),
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
          execute: createSafeToolWrapper("browser.type", browserType as any),
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
          execute: createSafeToolWrapper("browser.waitFor", waitFor as any),
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
          execute: createSafeToolWrapper("browser.evaluate", evaluate as any),
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
          execute: createSafeToolWrapper("browser.close", closeBrowser as any),
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
          execute: createSafeToolWrapper(
            "browser.status",
            getBrowserStatus as any
          ),
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
          execute: createSafeToolWrapper("docker.start", startContainer as any),
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
          execute: createSafeToolWrapper("docker.exec", execInContainer as any),
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
          execute: createSafeToolWrapper("docker.stop", stopContainer as any),
        }),

        "docker.getCurrentContainer": tool<{}, unknown>({
          description:
            "Get information about the current container the agent is running in, including network settings and port bindings.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper(
            "docker.getCurrentContainer",
            getCurrentContainer as any
          ),
        }),

        "docker.connectToNetwork": tool<
          import("./tools/docker").ConnectToNetworkInput,
          { ok: boolean; message: string }
        >({
          description:
            "Connect a container to a Docker network with optional aliases.",
          inputSchema: zodSchema(
            z.object({
              containerId: z.string(),
              networkName: z.string(),
              aliases: z.array(z.string()).optional(),
            })
          ),
          execute: createSafeToolWrapper(
            "docker.connectToNetwork",
            connectToNetwork as any
          ),
        }),

        "docker.disconnectFromNetwork": tool<
          { containerId: string; networkName: string },
          { ok: boolean; message: string }
        >({
          description: "Disconnect a container from a Docker network.",
          inputSchema: zodSchema(
            z.object({
              containerId: z.string(),
              networkName: z.string(),
            })
          ),
          execute: createSafeToolWrapper(
            "docker.disconnectFromNetwork",
            async (args) =>
              disconnectFromNetwork(args.containerId, args.networkName)
          ),
        }),

        "docker.listNetworks": tool<{}, unknown>({
          description: "List all Docker networks available on the system.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper(
            "docker.listNetworks",
            listNetworks as any
          ),
        }),

        "docker.createNetwork": tool<
          { name: string; driver?: string },
          { ok: boolean; id: string; message: string }
        >({
          description:
            "Create a new Docker network with specified name and driver (default: bridge).",
          inputSchema: zodSchema(
            z.object({
              name: z.string(),
              driver: z.string().optional(),
            })
          ),
          execute: createSafeToolWrapper("docker.createNetwork", async (args) =>
            createNetwork(args.name, args.driver)
          ),
        }),

        "docker.restartWithPorts": tool<
          {
            containerId: string;
            ports: Array<{
              hostPort: number;
              containerPort: number;
              protocol?: "tcp" | "udp";
            }>;
          },
          { ok: boolean; id: string; name: string; message: string }
        >({
          description:
            "Restart a container with new port bindings. This stops the current container and creates a new one with the specified port mappings.",
          inputSchema: zodSchema(
            z.object({
              containerId: z.string(),
              ports: z.array(
                z.object({
                  hostPort: z.number(),
                  containerPort: z.number(),
                  protocol: z.enum(["tcp", "udp"]).optional(),
                })
              ),
            })
          ),
          execute: createSafeToolWrapper(
            "docker.restartWithPorts",
            restartContainerWithPorts as any
          ),
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
          execute: createSafeToolWrapper(
            "hbrowser.session.create",
            createSession as any
          ),
        }),
        "hbrowser.session.stop": tool<{ sessionId: string }, { ok: true }>({
          description: "Stop a Hyperbrowser session",
          inputSchema: zodSchema(z.object({ sessionId: z.string() })),
          execute: createSafeToolWrapper(
            "hbrowser.session.stop",
            async (args) => ({
              ok: (await stopSession(args.sessionId)).ok as true,
            })
          ),
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
          execute: createSafeToolWrapper("hbrowser.navigate", navigate as any),
        }),
        "context7.search": tool<{ query: string }, unknown>({
          description: "Search libraries on Context7",
          inputSchema: zodSchema(z.object({ query: z.string() })),
          execute: createSafeToolWrapper(
            "context7.search",
            context7Search as any
          ),
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
          execute: createSafeToolWrapper(
            "context7.getDocs",
            context7GetDocs as any
          ),
        }),
        "docs.fetchUrl": tool<{ url: string }, { url: string; text: string }>({
          description: "Fetch raw text from a URL if Context7 not available",
          inputSchema: zodSchema(z.object({ url: z.string().url() })),
          execute: createSafeToolWrapper(
            "docs.fetchUrl",
            fetchDocsByUrl as any
          ),
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

        // Gemini AI Analysis Tools
        "gemini.analyzeImage": tool<
          {
            relativePath: string;
            prompt?: string;
            model?: string;
            structuredOutput?: boolean;
          },
          any
        >({
          description: "Analyze images using Google Gemini AI. Supports various image formats (JPEG, PNG, GIF, WebP, etc.) and provides detailed visual analysis including object detection, text recognition, color analysis, and composition assessment.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string().describe("Path to the image file relative to sandbox workspace"),
              prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
              model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
              structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
            })
          ),
          execute: createSafeToolWrapper("gemini.analyzeImage", async (args: any) => {
            const { analyzeImage } = await import("./tools/gemini");
            return await analyzeImage(args);
          }),
        }),

        "gemini.analyzePdf": tool<
          {
            relativePath: string;
            prompt?: string;
            model?: string;
            structuredOutput?: boolean;
          },
          any
        >({
          description: "Analyze PDF documents using Google Gemini AI. Extracts and analyzes text content, structure, key information, and provides comprehensive document summaries with entity extraction.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string().describe("Path to the PDF file relative to sandbox workspace"),
              prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
              model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
              structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
            })
          ),
          execute: createSafeToolWrapper("gemini.analyzePdf", async (args: any) => {
            const { analyzePdf } = await import("./tools/gemini");
            return await analyzePdf(args);
          }),
        }),

        "gemini.analyzeVideo": tool<
          {
            relativePath: string;
            prompt?: string;
            model?: string;
            structuredOutput?: boolean;
          },
          any
        >({
          description: "Analyze video files using Google Gemini AI. Uploads video to Gemini for processing and provides comprehensive analysis including scene detection, audio analysis, visual assessment, and content summarization. Supports MP4, AVI, MOV, and other video formats.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string().describe("Path to the video file relative to sandbox workspace"),
              prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
              model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
              structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
            })
          ),
          execute: createSafeToolWrapper("gemini.analyzeVideo", async (args: any) => {
            const { analyzeVideo } = await import("./tools/gemini");
            return await analyzeVideo(args);
          }),
        }),

        "gemini.analyzeAudio": tool<
          {
            relativePath: string;
            prompt?: string;
            model?: string;
            structuredOutput?: boolean;
          },
          any
        >({
          description: "Analyze audio files using Google Gemini AI. Uploads audio to Gemini for processing and provides comprehensive analysis including speech transcription, music analysis, speaker detection, and audio quality assessment. Supports MP3, WAV, M4A, and other audio formats.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string().describe("Path to the audio file relative to sandbox workspace"),
              prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
              model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
              structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
            })
          ),
          execute: createSafeToolWrapper("gemini.analyzeAudio", async (args: any) => {
            const { analyzeAudio } = await import("./tools/gemini");
            return await analyzeAudio(args);
          }),
        }),

        "gemini.analyzeFile": tool<
          {
            relativePath: string;
            prompt?: string;
            model?: string;
            structuredOutput?: boolean;
          },
          any
        >({
          description: "Universal file analyzer using Google Gemini AI. Automatically detects file type and uses the appropriate analysis method. Supports images, PDFs, videos, audio files, and text documents. Provides intelligent analysis based on file content and type.",
          inputSchema: zodSchema(
            z.object({
              relativePath: z.string().describe("Path to the file relative to sandbox workspace"),
              prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
              model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
              structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
            })
          ),
          execute: createSafeToolWrapper("gemini.analyzeFile", async (args: any) => {
            const { analyzeFile } = await import("./tools/gemini");
            return await analyzeFile(args);
          }),
        }),

        "gemini.getSupportedTypes": tool<{}, any>({
          description: "Get list of file types supported by Gemini analysis tools. Returns categorized lists of supported extensions for images, documents, audio, and video files.",
          inputSchema: zodSchema(z.object({})),
          execute: createSafeToolWrapper("gemini.getSupportedTypes", async () => {
            const { getSupportedFileTypes } = await import("./tools/gemini");
            return {
              success: true,
              supportedTypes: getSupportedFileTypes()
            };
          }),
        }),
      },

      onStepFinish({ toolCalls, toolResults }) {
        // Enhanced messages are now handled directly in createSafeToolWrapper
        // No need for additional progress indicator messages to avoid duplication

        // Still collect tool execution data for the tool collector
        const callMap = new Map();
        for (const call of toolCalls) {
          callMap.set(call.toolCallId, call);
          // Tool collector registration is already handled in createSafeToolWrapper
        }

        // Tool completion is already handled in createSafeToolWrapper
        // This callback is kept for potential future use but no longer shows duplicate messages
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
  progressIndicator.clearAll();
  // Clean up tool collector to prevent memory leaks
  toolCollector.cleanup(50); // Keep last 50 executions
}
