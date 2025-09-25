import {
  experimental_createMCPClient as createMCPClient,
  zodSchema,
  type ToolSet,
  tool,
} from "ai";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { pathToFileURL } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import chalk from "chalk";

// SSE transport (AI SDK native support - recommended for remote servers)
export async function createSseMcpTools(options: {
  url: string;
  headers?: Record<string, string>;
  schemas?: Record<string, { inputSchema: ReturnType<typeof zodSchema> }>; // optional type-safe selection
}): Promise<ToolSet> {
  const client = await createMCPClient({
    transport: {
      type: "sse",
      url: options.url,
      headers: options.headers,
    },
  });

  const tools = await client.tools({ schemas: options.schemas as any });
  return tools;
}

// HTTP transport using StreamableHTTPClientTransport (for servers requiring streamable HTTP)
export async function createHttpMcpTools(options: {
  url: string;
  sessionId?: string;
  headers?: Record<string, string>; // Optional HTTP headers (forwarded via requestInit to transport)
  schemas?: Record<string, { inputSchema: ReturnType<typeof zodSchema> }>; // optional type-safe selection
}): Promise<{ tools: ToolSet; client: any }> {
  const url = new URL(options.url);

  // Include headers via requestInit so they're sent on both SSE (GET) and POST requests
  const transport = new StreamableHTTPClientTransport(url, {
    //  sessionId: options.sessionId || `session_${Date.now()}`,
    requestInit: options.headers ? { headers: options.headers } : undefined,
  });

  const client = await createMCPClient({
    transport: transport as any, // Type assertion due to interface
  });

  const tools = await client.tools({ schemas: options.schemas as any });
  return { tools, client };
}

export async function createStdioMcpTools(options: {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  schemas?: Record<string, { inputSchema: ReturnType<typeof zodSchema> }>;
}): Promise<{ tools: ToolSet; client: any }> {
  const client = await createMCPClient({
    transport: new StdioClientTransport({
      command: options.command,
      args: options.args ?? [],
      env: options.env,
    }) as any,
  });
  const tools = await client.tools({ schemas: options.schemas as any });
  return { tools, client };
}

// Load multiple MCP servers from a JSON config (e.g. ~/.cursor/mcp.json)
// Supported formats:
// {
//   "mcpServers": {
//     "context7-sse": {
//       "url": "https://mcp.context7.com/mcp",
//       "headers": {"CONTEXT7_API_KEY": "ctx7sk-..."}
//     },
//     "context7-stdio": {
//       "command": "npx",
//       "args": ["-y", "@upstash/context7-mcp", "--api-key", "your-key"]
//     },
//     "local-nested": {
//       "stdio": { "command": "node", "args": ["./server.js"], "env": {} }
//     },
//     "local-direct": {
//       "command": "bun",
//       "args": ["run", "server.ts"]
//     },
//     "httpServer": {
//       "url": "https://...",
//       "transport": "http",
//       "sessionId": "optional"
//     },
//     "sseServer": {
//       "url": "https://...",
//       "transport": "sse"
//     },
//     "autoDetectServer": {
//       "url": "https://..."
//       // Defaults to SSE transport if no transport specified
//     }
//   }
// }
//
// Transport Options for URL-based servers:
// - "sse" (default): Server-Sent Events transport
// - "http": HTTP POST transport (useful for servers that don't support SSE)
export async function loadMcpToolsFromConfig(
  configPath?: string
): Promise<ToolSet> {
  const resolved = await resolveProjectMcpPath(configPath);

  let json: any = {};
  try {
    const raw = await fs.readFile(resolved, "utf8");
    json = JSON.parse(raw);
  } catch {
    return {} as ToolSet;
  }

  const servers = json?.mcpServers ?? {};
  const merged: Record<string, any> = {};

  for (const _name of Object.keys(servers)) {
    const s = servers[_name];
    try {
      if (s?.url) {
        const useHttp = s.transport === "http";
        if (useHttp) {
          const { tools } = await createHttpMcpTools({
            url: s.url,
            sessionId: s.sessionId,
            headers: s.headers,
          });
          Object.assign(merged, tools as any);
        } else {
          const serverTools = await createSseMcpTools({
            url: s.url,
            headers: s.headers,
          });
          Object.assign(merged, serverTools as any);
        }
        continue;
      }
      if (s?.stdio?.command || s?.command) {
        const command = s?.stdio?.command || s?.command;
        const args = s?.stdio?.args || s?.args || [];
        const env = s?.stdio?.env || s?.env || {};

        const { tools: serverTools } = await createStdioMcpTools({
          command,
          args,
          env,
        });
        Object.assign(merged, serverTools as any);
        continue;
      }
    } catch {
      // ignore this server if it fails
    }
  }

  return merged as ToolSet;
}

async function resolveProjectMcpPath(explicit?: string): Promise<string> {
  if (explicit) return path.resolve(explicit);

  const candidates = [
    path.join(os.homedir(), "mcp.json"), // Primary: ~/mcp.json
    path.join(os.homedir(), ".cursor", "mcp.json"), // Cursor's location
    path.join(process.cwd(), "mcp.json"), // Project local
    path.join(process.cwd(), ".cursor", "mcp.json"), // Project .cursor
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }

  // default to first candidate even if missing; caller will handle read error
  return candidates[0] as string;
}

// Non-blocking MCP tools manager
export class MCPToolsManager {
  private tools: ToolSet = {};
  private isLoading = false;
  private loadedServers = new Set<string>();
  private clients: Array<{ client: any; name: string }> = [];

  constructor() {}

  // Get currently available tools (non-blocking)
  getTools(): ToolSet {
    return { ...this.tools };
  }

  // Check if MCP tools are currently being loaded
  isLoadingTools(): boolean {
    return this.isLoading;
  }

  // Get list of successfully loaded server names
  getLoadedServers(): string[] {
    return Array.from(this.loadedServers);
  }

  // Start loading MCP tools from config (non-blocking)
  async startLoadingFromConfig(
    configPath?: string,
    quiet = true
  ): Promise<void> {
    if (this.isLoading) {
      if (!quiet) console.log("MCP tools are already being loaded...");
      return;
    }

    this.isLoading = true;
    if (!quiet) console.log("Starting to load MCP tools in background...");

    // Don't await this - let it run in background
    this.loadMcpToolsInBackground(configPath, quiet).finally(() => {
      this.isLoading = false;
    });
  }

  // Private method to load MCP tools in background
  private async loadMcpToolsInBackground(
    configPath?: string,
    quiet = true
  ): Promise<void> {
    try {
      const resolved = await resolveProjectMcpPath(configPath);

      let json: any = {};
      try {
        const raw = await fs.readFile(resolved, "utf8");
        json = JSON.parse(raw);
        if (!quiet) console.log(`Loaded MCP config from: ${resolved}`);
      } catch (error) {
        if (!quiet)
          console.log(`No MCP config found at ${resolved}, skipping MCP tools`);
        return;
      }

      const servers = json?.mcpServers ?? {};
      const serverNames = Object.keys(servers);

      if (serverNames.length === 0) {
        if (!quiet) console.log("No MCP servers configured");
        return;
      }

      if (!quiet)
        console.log(
          `Found ${serverNames.length} MCP server(s): ${serverNames.join(", ")}`
        );

      // Load servers in parallel
      const loadPromises = serverNames.map((serverName) =>
        this.loadSingleServer(serverName, servers[serverName], quiet)
      );

      await Promise.allSettled(loadPromises);

      const loadedCount = this.loadedServers.size;
      if (!quiet) {
        if (loadedCount > 0) {
          console.log(
            `Loaded ${loadedCount} MCP server(s): ${this.getLoadedServers().join(
              ", "
            )}`
          );
          console.log(
            `Available MCP tools: ${Object.keys(this.tools).join(", ")}`
          );
        } else {
          console.log("Failed to load any MCP servers");
        }
      }
    } catch (error) {
      console.error(`Error loading MCP tools: ${(error as Error).message}`);
    }
  }

  // Load a single MCP server
  private async loadSingleServer(
    serverName: string,
    serverConfig: any,
    quiet = true
  ): Promise<void> {
    try {
      let serverTools: ToolSet = {};
      let client: any = null;

      if (serverConfig?.url) {
        // Use HTTP transport if explicitly requested, otherwise use SSE (default)
        const useHttpTransport = serverConfig.transport === "http";

        if (useHttpTransport) {
          if (!quiet)
            console.log(
              `Connecting to HTTP server: ${serverName} (${serverConfig.url})`
            );
          const result = await createHttpMcpTools({
            url: serverConfig.url,
            sessionId: serverConfig.sessionId,
            headers: serverConfig.headers,
          });
          serverTools = result.tools;
          client = result.client;
        } else {
          if (!quiet)
            console.log(
              `Connecting to SSE server: ${serverName} (${serverConfig.url})`
            );
          serverTools = await createSseMcpTools({
            url: serverConfig.url,
            headers: serverConfig.headers,
          });
          // Note: SSE client is lightweight and auto-closes; no explicit client storage needed unless custom
        }
      } else if (serverConfig?.stdio?.command || serverConfig?.command) {
        // Support both nested stdio config and direct command config
        const command = serverConfig?.stdio?.command || serverConfig?.command;
        const args = serverConfig?.stdio?.args || serverConfig?.args || [];
        const env = serverConfig?.stdio?.env || serverConfig?.env || {};

        if (!quiet) {
          console.log(
            `Connecting to stdio server: ${serverName} (${command} ${args.join(
              " "
            )})`
          );
          console.log(`Starting stdio process...`);
        }

        const result = await createStdioMcpTools({
          command,
          args,
          env,
        });
        serverTools = result.tools;
        client = result.client;

        if (!quiet)
          console.log(`Stdio connection established for ${serverName}`);
      } else {
        if (!quiet)
          console.log(
            `Skipping server ${serverName}: no valid transport configuration`
          );
        return;
      }

      // Merge tools with prefix to avoid conflicts
      const prefixedTools: ToolSet = {};
      for (const [toolName, toolDef] of Object.entries(serverTools)) {
        const prefixedName = `mcp.${serverName}.${toolName}`;
        prefixedTools[prefixedName] = toolDef;
      }

      Object.assign(this.tools, prefixedTools);
      this.loadedServers.add(serverName);

      if (client) {
        // Store client for cleanup (for transports that support it)
        this.clients.push({ client, name: serverName });
      }

      const toolCount = Object.keys(serverTools).length;
      if (!quiet) console.log(`Loaded ${toolCount} tool(s) from ${serverName}`);
    } catch (error) {
      if (!quiet)
        console.error(
          `Failed to load MCP server ${serverName}: ${(error as Error).message}`
        );
    }
  }

  // Add a single tool dynamically (useful for hot-reloading)
  addTool(name: string, toolDefinition: any): void {
    this.tools[name] = toolDefinition;
    console.log(chalk.blue(`🔧 Added MCP tool: ${name}`));
  }

  // Remove a tool
  removeTool(name: string): void {
    delete this.tools[name];
    console.log(chalk.gray(`🗑️ Removed MCP tool: ${name}`));
  }

  // Cleanup all MCP clients (call this on shutdown)
  async cleanup(): Promise<void> {
    console.log(chalk.gray("🧹 Cleaning up MCP clients..."));

    for (const { client, name } of this.clients) {
      try {
        await client.close?.();
        console.log(chalk.gray(`✅ Closed MCP client: ${name}`));
      } catch (error) {
        console.error(
          chalk.yellow(
            `⚠️ Error closing MCP client ${name}: ${(error as Error).message}`
          )
        );
      }
    }

    this.clients = [];
    this.tools = {};
    this.loadedServers.clear();
  }
}

// Global MCP tools manager instance
export const mcpManager = new MCPToolsManager();

// If this module is run directly, show a summary of configured MCP servers.
const __runAsMain = (() => {
  try {
    if ((import.meta as any).main) return true; // Bun
    const entry = (globalThis as any)?.process?.argv?.[1];
    if (!entry) return false;
    return pathToFileURL(entry).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (__runAsMain) {
  runMcpInfoCli().catch((err) => {
    console.error(
      chalk.red(`❌ MCP info CLI error: ${(err as Error).message}`)
    );
    process.exitCode = 1;
  });
}

function sanitizeArgs(args: string[] = []): string[] {
  const sensitiveFlag =
    /(key|secret|token|password|auth(entication|orization)?)/i;
  const masked: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a.startsWith("--") && sensitiveFlag.test(a)) {
      masked.push(a);
      if (i + 1 < args.length && !String(args[i + 1]).startsWith("--")) {
        masked.push("****");
        i++;
      }
      continue;
    }
    // Mask obvious key-like literals
    masked.push(a.replace(/\b([a-z]{0,5}sk-[a-z0-9-]{6,})\b/gi, "****"));
  }
  return masked;
}

async function closeClientSafely(client: any, name: string): Promise<void> {
  if (!client) return;
  try {
    await client.close?.();
  } catch (err) {
    console.error(
      chalk.yellow(
        `⚠️ Error closing MCP client ${name}: ${(err as Error).message}`
      )
    );
  }
}

async function connectToServer(
  name: string,
  s: any
): Promise<{
  name: string;
  ok: boolean;
  transport: string;
  toolNames: string[];
  error?: string;
  client?: any;
}> {
  let transport = "unknown";
  try {
    if (s?.url || s?.serverUrl) {
      const url = s?.url ?? s?.serverUrl;
      const isHttp = s.transport === "http";
      transport = isHttp ? "http" : "sse";
      if (isHttp) {
        const { tools, client } = await createHttpMcpTools({
          url,
          sessionId: s.sessionId,
          headers: s.headers,
        });
        return {
          name,
          ok: true,
          transport,
          toolNames: Object.keys(tools ?? {}),
          client,
        };
      } else {
        const tools = await createSseMcpTools({ url, headers: s.headers });
        return {
          name,
          ok: true,
          transport,
          toolNames: Object.keys(tools ?? {}),
        };
      }
    } else if (s?.stdio?.command || s?.command) {
      transport = "stdio";
      const command = s?.stdio?.command || s?.command;
      const args = s?.stdio?.args || s?.args || [];
      const env = s?.stdio?.env || s?.env || {};
      const { tools, client } = await createStdioMcpTools({
        command,
        args,
        env,
      });
      return {
        name,
        ok: true,
        transport,
        toolNames: Object.keys(tools ?? {}),
        client,
      };
    }
    return {
      name,
      ok: false,
      transport,
      toolNames: [],
      error:
        "Unrecognized configuration. Expected either 'url' or 'command'/'stdio.command'",
    };
  } catch (err) {
    return {
      name,
      ok: false,
      transport,
      toolNames: [],
      error: (err as Error)?.message ?? String(err),
    };
  }
}

async function runMcpInfoCli(): Promise<void> {
  // Parse simple flags: -c/--config <path>
  const argv = (globalThis as any).process?.argv ?? [];
  let configPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const v = String(argv[i]);
    if (v === "-c" || v === "--config") {
      configPath = String(argv[i + 1]);
      i++;
    }
  }

  const resolved = await resolveProjectMcpPath(configPath);
  console.log(chalk.blue(`📄 MCP config path: ${resolved}`));

  let json: any;
  try {
    const raw = await fs.readFile(resolved, "utf8");
    json = JSON.parse(raw);
  } catch {
    console.log(
      chalk.yellow(
        "⚠️ No MCP config found or unreadable. Searched the default locations."
      )
    );
    return;
  }

  const servers = json?.mcpServers ?? {};
  const names = Object.keys(servers);
  if (names.length === 0) {
    console.log(chalk.yellow("⚠️ No MCP servers configured in mcpServers."));
    return;
  }

  console.log(chalk.green(`🔌 Found ${names.length} MCP server(s):`));
  for (const name of names) {
    const s = servers[name] ?? {};
    const notes: string[] = [];

    let transport = "unknown";
    if (s?.url || s?.serverUrl) {
      transport = s.transport === "http" ? "http" : "sse";
      if (s?.serverUrl && !s?.url) {
        notes.push("Config uses 'serverUrl'. Did you mean 'url'?");
      }
    } else if (s?.stdio?.command || s?.command) {
      transport = "stdio";
    }

    console.log(chalk.bold(`\n• ${name}`));
    console.log(`  transport: ${chalk.cyan(transport)}`);

    if (transport === "sse" || transport === "http") {
      const url = s?.url ?? s?.serverUrl;
      const headerKeys = s?.headers ? Object.keys(s.headers) : [];
      console.log(`  url: ${url ?? "N/A"}`);
      console.log(
        `  headers: ${headerKeys.length} key(s) ${
          headerKeys.length ? `[${headerKeys.join(", ")}]` : ""
        }`
      );
      if (transport === "http" && s?.sessionId) {
        console.log(`  sessionId: ${String(s.sessionId).slice(0, 8)}…`);
      }
    } else if (transport === "stdio") {
      const cmd = s?.stdio?.command || s?.command;
      const args = s?.stdio?.args || s?.args || [];
      const env = s?.stdio?.env || s?.env || {};
      const envKeys = Object.keys(env ?? {});
      console.log(`  command: ${cmd ?? "N/A"}`);
      const safeArgs = sanitizeArgs(args);
      console.log(`  args: ${safeArgs.length ? safeArgs.join(" ") : "(none)"}`);
      console.log(
        `  env: ${envKeys.length} key(s) ${
          envKeys.length ? `[${envKeys.join(", ")}]` : ""
        }`
      );
    } else {
      console.log(
        chalk.yellow(
          "  ⚠️ Unrecognized server configuration. Expected either 'url' or 'command'/'stdio.command'."
        )
      );
    }

    for (const n of notes) {
      console.log(chalk.yellow(`  note: ${n}`));
    }
  }

  console.log(chalk.blue(`\n🔗 Attempting to connect to MCP servers...`));
  const connectResults = await Promise.all(
    names.map((n) => connectToServer(n, servers[n]))
  );

  let okCount = 0;
  let failCount = 0;
  for (const r of connectResults) {
    if (r.ok) {
      okCount++;
      const count = r.toolNames.length;
      const preview = r.toolNames.slice(0, 10);
      console.log(
        chalk.green(
          `\n✅ ${r.name}: connected via ${r.transport}, ${count} tool(s)`
        )
      );
      if (preview.length) {
        console.log(
          `  tools: ${preview.join(", ")}${
            count > preview.length
              ? `, ... (+${count - preview.length} more)`
              : ""
          }`
        );
      }
    } else {
      failCount++;
      console.log(
        chalk.red(
          `\n❌ ${r.name}: failed to connect (${r.transport || "unknown"})`
        )
      );
      if (r.error) console.log(chalk.gray(`  error: ${r.error}`));
    }
  }

  // Clean up any clients that were created
  await Promise.all(
    connectResults.map((r) => closeClientSafely((r as any).client, r.name))
  );

  console.log(
    chalk.green(
      `\nSummary: ${okCount} succeeded, ${failCount} failed (total ${names.length})`
    )
  );
  console.log(
    chalk.gray("\nTip: pass -c/--config <path> to point to a specific mcp.json")
  );
}
