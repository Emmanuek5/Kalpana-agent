import {
  experimental_createMCPClient as createMCPClient,
  zodSchema,
  type ToolSet,
  tool,
} from "ai";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";

// Simple SSE transport config; replace URL and auth to match your MCP server.
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

export async function createStdioMcpTools(options: {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  schemas?: Record<string, { inputSchema: ReturnType<typeof zodSchema> }>;
}): Promise<ToolSet> {
  const client = await createMCPClient({
    transport: new StdioClientTransport({
      command: options.command,
      args: options.args ?? [],
      env: options.env,
    }) as any,
  });
  const tools = await client.tools({ schemas: options.schemas as any });
  return tools;
}

// Load multiple MCP servers from a JSON config (e.g. ~/.cursor/mcp.json)
// Format:
// {
//   "mcpServers": {
//     "context7": { "url": "https://...", "headers": {"Authorization": "Bearer ..."} },
//     "local": { "stdio": { "command": "node", "args": ["./server.js"] } }
//   }
// }
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
        const serverTools = await createSseMcpTools({
          url: s.url,
          headers: s.headers,
        });
        Object.assign(merged, serverTools as any);
        continue;
      }
      if (s?.stdio?.command) {
        const serverTools = await createStdioMcpTools({
          command: s.stdio.command,
          args: s.stdio.args,
          env: s.stdio.env,
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
    path.join(process.cwd(), ".cursor", "mcp.json"),
    path.join(process.cwd(), "mcp.json"),
    path.join(os.homedir(), ".cursor", "mcp.json"),
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
  async startLoadingFromConfig(configPath?: string): Promise<void> {
    if (this.isLoading) {
      console.log(chalk.yellow("MCP tools are already being loaded..."));
      return;
    }

    this.isLoading = true;
    console.log(chalk.blue("🔄 Starting to load MCP tools in background..."));

    // Don't await this - let it run in background
    this.loadMcpToolsInBackground(configPath).finally(() => {
      this.isLoading = false;
    });
  }

  // Private method to load MCP tools in background
  private async loadMcpToolsInBackground(configPath?: string): Promise<void> {
    try {
      const resolved = await resolveProjectMcpPath(configPath);

      let json: any = {};
      try {
        const raw = await fs.readFile(resolved, "utf8");
        json = JSON.parse(raw);
        console.log(chalk.gray(`📄 Loaded MCP config from: ${resolved}`));
      } catch (error) {
        console.log(
          chalk.yellow(
            `⚠️ No MCP config found at ${resolved}, skipping MCP tools`
          )
        );
        return;
      }

      const servers = json?.mcpServers ?? {};
      const serverNames = Object.keys(servers);

      if (serverNames.length === 0) {
        console.log(chalk.yellow("No MCP servers configured"));
        return;
      }

      console.log(
        chalk.blue(
          `🔌 Found ${serverNames.length} MCP server(s): ${serverNames.join(
            ", "
          )}`
        )
      );

      // Load servers in parallel
      const loadPromises = serverNames.map((serverName) =>
        this.loadSingleServer(serverName, servers[serverName])
      );

      await Promise.allSettled(loadPromises);

      const loadedCount = this.loadedServers.size;
      if (loadedCount > 0) {
        console.log(
          chalk.green(
            `✅ Successfully loaded ${loadedCount} MCP server(s): ${this.getLoadedServers().join(
              ", "
            )}`
          )
        );
        console.log(
          chalk.blue(
            `🛠️ Available MCP tools: ${Object.keys(this.tools).join(", ")}`
          )
        );
      } else {
        console.log(chalk.red("❌ Failed to load any MCP servers"));
      }
    } catch (error) {
      console.error(
        chalk.red(`❌ Error loading MCP tools: ${(error as Error).message}`)
      );
    }
  }

  // Load a single MCP server
  private async loadSingleServer(
    serverName: string,
    serverConfig: any
  ): Promise<void> {
    try {
      let serverTools: ToolSet = {};

      if (serverConfig?.url) {
        console.log(
          chalk.gray(
            `🌐 Connecting to SSE server: ${serverName} (${serverConfig.url})`
          )
        );
        serverTools = await createSseMcpTools({
          url: serverConfig.url,
          headers: serverConfig.headers,
        });
      } else if (serverConfig?.stdio?.command) {
        console.log(
          chalk.gray(
            `💻 Connecting to stdio server: ${serverName} (${serverConfig.stdio.command})`
          )
        );
        const client = await createMCPClient({
          transport: new StdioClientTransport({
            command: serverConfig.stdio.command,
            args: serverConfig.stdio.args || [],
            env: serverConfig.stdio.env,
          }) as any,
        });

        // Store client for cleanup later
        this.clients.push({ client, name: serverName });

        serverTools = await client.tools({ schemas: undefined as any });
      } else {
        console.log(
          chalk.yellow(
            `⚠️ Skipping server ${serverName}: no valid transport configuration`
          )
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

      const toolCount = Object.keys(serverTools).length;
      console.log(
        chalk.green(`✅ Loaded ${toolCount} tool(s) from ${serverName}`)
      );
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Failed to load MCP server ${serverName}: ${
            (error as Error).message
          }`
        )
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
