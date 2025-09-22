import chalk from "chalk";
import { toolCollector } from "../tool-collector";

// Get descriptive start message for tool execution
export function getToolStartMessage(
  toolName: string,
  args: any
): string | null {
  const arg = args || {};

  switch (toolName) {
    case "edit.subAgentWrite":
      return `✏️  Editing ${chalk.cyan(
        arg.relativePath || "file"
      )} with sub-agent`;
    case "edit.searchReplace":
      return `🔍 Searching and replacing in ${chalk.cyan(
        arg.relativePath || "file"
      )}`;
    case "exec.listProcesses":
      return `📋 Getting processes`;
    case "exec.getProcessInfo":
      return `🔍 Getting process info for PID ${chalk.cyan(
        arg.pid || "unknown"
      )}`;
    case "exec.getProcessLogs":
      return `📜 Getting logs for PID ${chalk.cyan(arg.pid || "unknown")}`;
    // File system tools
    case "fs.writeFile":
      return `📝 Writing file ${chalk.cyan(arg.relativePath || "file")}`;
    case "fs.readFile":
      return `📖 Reading file ${chalk.cyan(arg.relativePath || "file")}`;
    case "fs.listDir":
      return `📂 Listing directory ${chalk.cyan(arg.relativePath || ".")}`;
    case "fs.makeDir":
      return `📁 Creating directory ${chalk.cyan(
        arg.relativePath || "directory"
      )}`;
    case "fs.delete":
      return `🗑️  Deleting ${chalk.cyan(arg.relativePath || "item")}`;
    case "fs.copy":
      return `📋 Copying ${chalk.cyan(
        arg.sourcePath || "source"
      )} to ${chalk.cyan(arg.destinationPath || "destination")}`;
    case "fs.move":
      return `🚚 Moving ${chalk.cyan(
        arg.sourcePath || "source"
      )} to ${chalk.cyan(arg.destinationPath || "destination")}`;
    case "fs.stats":
      return `📊 Getting stats for ${chalk.cyan(arg.relativePath || "item")}`;
    case "fs.summarize":
      return `🔍 Summarizing file ${chalk.cyan(arg.relativePath || "file")}`;
    case "fs.readChunk":
      return `📖 Reading chunk from ${chalk.cyan(
        arg.relativePath || "file"
      )} (lines ${chalk.cyan(arg.startLine || "?")} - ${chalk.cyan(
        arg.endLine || "?"
      )})`;
    case "fs.lineCount":
      return `📏 Counting lines in ${chalk.cyan(arg.relativePath || "file")}`;
    // Execution tools
    case "exec.command":
      return `⚡ Running command ${chalk.cyan(arg.command || "command")}`;
    case "exec.startServer":
      return `🚀 Starting server ${chalk.cyan(
        arg.command || "server"
      )} on port ${chalk.cyan(arg.port || "unknown")}`;
    case "exec.stopServer":
      return `🛑 Stopping server ${chalk.cyan(
        arg.name || arg.port || "server"
      )}`;
    case "exec.findPidsByPort":
      return `🔍 Finding processes on port ${chalk.cyan(
        arg.port || "unknown"
      )}`;
    case "exec.killPid":
      return `💀 Killing process PID ${chalk.cyan(arg.pid || "unknown")}`;
    case "exec.freePort":
      return `🔓 Freeing port ${chalk.cyan(arg.port || "unknown")}`;
    case "exec.grep":
      return `🔍 Searching workspace for "${chalk.cyan(
        arg.pattern || "pattern"
      )}"`;
    case "exec.listServers":
      return `📋 Getting running servers`;
    case "exec.getServerLogs":
      return `📜 Getting logs for server ${chalk.cyan(
        arg.serverName || "server"
      )}`;
    // Sandbox management
    case "sandbox.launch":
      return `🐳 Launching ${chalk.cyan(arg.runtime || "unknown")} sandbox`;
    case "sandbox.switch":
      return `🔄 Switching sandbox to ${chalk.cyan(arg.runtime || "unknown")}`;
    case "sandbox.info":
      return `ℹ️  Getting sandbox information`;
    case "sandbox.shutdown":
      return `🛑 Shutting down sandbox`;
    // Docker tools
    case "docker.start":
      return `🐳 Starting Docker container ${chalk.cyan(
        arg.image || "container"
      )}`;
    case "docker.exec":
      return `⚡ Executing command in container ${chalk.cyan(
        (arg.containerId || "container").substring(0, 12)
      )}`;
    case "docker.stop":
      return `🛑 Stopping container ${chalk.cyan(
        (arg.containerId || "container").substring(0, 12)
      )}`;
    case "docker.getCurrentContainer":
      return `🔍 Getting current container information`;
    case "docker.listNetworks":
      return `📋 Listing Docker networks`;
    case "docker.createNetwork":
      return `🌐 Creating Docker network ${chalk.cyan(arg.name || "network")}`;
    case "docker.connectToNetwork":
      return `🔗 Connecting container ${chalk.cyan(
        (arg.containerId || "container").substring(0, 12)
      )} to network ${chalk.cyan(arg.networkName || "network")}`;
    case "docker.disconnectFromNetwork":
      return `🔌 Disconnecting container ${chalk.cyan(
        (arg.containerId || "container").substring(0, 12)
      )} from network ${chalk.cyan(arg.networkName || "network")}`;
    case "docker.restartWithPorts":
      return `🔄 Restarting container ${chalk.cyan(
        (arg.containerId || "container").substring(0, 12)
      )} with new ports`;
    // Puppeteer Browser
    case "browser.runPuppeteerScript":
      return `🌐 Running Puppeteer script in sandbox`;
    // Notion
    case "notion.isLinked":
      return `🔗 Checking Notion account status`;
    case "notion.linkAccount":
      return `🔗 Linking Notion account`;
    case "notion.unlinkAccount":
      return `🔗 Unlinking Notion account`;
    case "notion.createPage":
      return `📄 Creating Notion page: ${chalk.cyan(arg.title || "page")}`;
    case "notion.createDatabase":
      return `🗃️ Creating Notion database: ${chalk.cyan(arg.title || "database")}`;
    case "notion.queryDatabase":
      return `🔍 Querying Notion database`;
    case "notion.updatePage":
      return `✏️ Updating Notion page`;
    case "notion.getPage":
      return `📄 Getting Notion page`;
    case "notion.getDatabase":
      return `🗃️ Getting Notion database`;
    case "notion.search":
      return `🔍 Searching Notion for: ${chalk.cyan(arg.query || "content")}`;
    case "notion.addBlocks":
      return `📝 Adding blocks to Notion page`;
    // Context7 / Docs
    case "context7.search":
      return `🔍 Searching the web for libraries: ${chalk.cyan(
        arg.query || "query"
      )}`;
    case "context7.getDocs":
      return `📚 Fetching documentation for ${chalk.cyan(arg.id || "library")}`;
    case "docs.fetchUrl":
      return `🔍 Searching the web - fetching content from ${chalk.cyan(
        arg.url || "URL"
      )}`;
    // Hyperbrowser session
    case "hyperagent.run":
      return `🤖 Using Hyperbrowser Agent for web task: ${chalk.cyan(
        (arg.task || "task").substring(0, 50)
      )}`;
    case "hbrowser.session.create":
      return `🌍 Creating Hyperbrowser session for web browsing`;
    case "hbrowser.session.stop":
      return `🌍 Stopping Hyperbrowser session`;
    case "hbrowser.navigate":
      return `🌍 Using Hyperbrowser to navigate to ${chalk.cyan(
        arg.url || "page"
      )}`;
    // Google Drive tools
    case "pDrive.isAccountLinked":
      return `🔗 Checking Google Drive account status`;
    case "pDrive.searchFiles":
      return "🔍 Searching Google Drive files...";
    case "pDrive.downloadFile":
      return "📥 Downloading file from Google Drive to sandbox...";
    case "pDrive.unlinkAccount":
      return "🔓 Unlinking Google Drive account...";
    case "pDrive.listFiles":
      return `📁 Listing Google Drive files${
        arg.folderId ? ` in folder ${chalk.cyan(arg.folderId)}` : ""
      }`;
    case "pDrive.readFile":
      return `📖 Reading Google Drive file ${chalk.cyan(arg.fileId || "file")}`;
    case "pDrive.writeFile":
      return `📝 Writing to Google Drive file ${chalk.cyan(
        arg.fileName || "file"
      )}`;
    case "pDrive.searchFiles":
      return `🔍 Searching Google Drive for "${chalk.cyan(
        arg.query || "files"
      )}"`;
    // Gemini AI analysis tools
    case "gemini.analyzeImage":
      return `🖼️ Analyzing image ${chalk.cyan(arg.relativePath || "file")} with Gemini AI`;
    case "gemini.analyzePdf":
      return `📄 Analyzing PDF ${chalk.cyan(arg.relativePath || "file")} with Gemini AI`;
    case "gemini.analyzeVideo":
      return `🎥 Analyzing video ${chalk.cyan(arg.relativePath || "file")} with Gemini AI`;
    case "gemini.analyzeAudio":
      return `🎵 Analyzing audio ${chalk.cyan(arg.relativePath || "file")} with Gemini AI`;
    case "gemini.analyzeFile":
      return `🔍 Auto-analyzing file ${chalk.cyan(arg.relativePath || "file")} with Gemini AI`;
    case "gemini.getSupportedTypes":
      return `📋 Getting supported file types for Gemini analysis`;
    default:
      if (toolName.startsWith("mcp.")) {
        const parts = toolName.split(".");
        const serverName = parts[1];
        const toolFunction = parts.slice(2).join(".");
        return `🔧 Using ${chalk.cyan(
          toolFunction
        )} from MCP server ${chalk.yellow(serverName)}`;
      }
      return null;
  }
}

// Get descriptive completion message for tool execution
export function getToolCompletionMessage(
  toolName: string,
  args: any,
  result: any
): string | null {
  const arg = args || {};

  switch (toolName) {
    case "edit.subAgentWrite":
      if (result?.success) {
        const filename = arg.relativePath || "file";
        const diffInfo =
          result.diffSummary || `${result.linesWritten || 0} lines`;
        return `✅ Edited ${chalk.cyan(filename)} - ${chalk.gray(diffInfo)}`;
      }
      return `❌ Failed to edit ${chalk.cyan(arg.relativePath || "file")}`;
    case "edit.searchReplace":
      if (result?.success) {
        const filename = arg.relativePath || "file";
        const occurrences = result.occurrences || 0;
        return `✅ Edited ${chalk.cyan(filename)} - ${chalk.gray(
          `${occurrences} replacement(s)`
        )}`;
      }
      return `❌ Failed to edit ${chalk.cyan(arg.relativePath || "file")}`;
    case "exec.listProcesses":
      if (result?.success !== false) {
        const count = Array.isArray(result)
          ? result.length
          : result?.processes?.length || 0;
        return `✅ Found ${chalk.cyan(count.toString())} processes`;
      }
      return `❌ Failed to list processes`;
    case "exec.getProcessInfo":
      if (result?.success !== false) {
        return `✅ Retrieved process info for PID ${chalk.cyan(
          arg.pid || "unknown"
        )}`;
      }
      return `❌ Failed to get process info for PID ${chalk.cyan(
        arg.pid || "unknown"
      )}`;
    case "exec.getProcessLogs":
      if (result?.success !== false) {
        const status = result?.isRunning ? "running" : "stopped";
        return `✅ Retrieved logs for PID ${chalk.cyan(
          arg.pid || "unknown"
        )} - ${chalk.gray(`process ${status}`)}`;
      }
      return `❌ Failed to get logs for PID ${chalk.cyan(
        arg.pid || "unknown"
      )}`;
    // File system completions
    case "fs.writeFile":
      if (result?.ok !== false) {
        return `✅ Wrote file ${chalk.cyan(arg.relativePath || "file")}`;
      }
      return `❌ Failed to write file ${chalk.cyan(
        arg.relativePath || "file"
      )}`;
    case "fs.readFile":
      if (result?.text) {
        const size = result.text.length;
        return `✅ Read file ${chalk.cyan(
          arg.relativePath || "file"
        )} - ${chalk.gray(`${size} characters`)}`;
      }
      return `❌ Failed to read file ${chalk.cyan(arg.relativePath || "file")}`;
    case "fs.listDir":
      if (Array.isArray(result)) {
        return `✅ Listed directory ${chalk.cyan(
          arg.relativePath || "."
        )} - ${chalk.gray(`${result.length} items`)}`;
      }
      return `❌ Failed to list directory ${chalk.cyan(
        arg.relativePath || "."
      )}`;
    case "fs.makeDir":
      if (result?.ok) {
        return `✅ Created directory ${chalk.cyan(
          arg.relativePath || "directory"
        )}`;
      }
      return `❌ Failed to create directory ${chalk.cyan(
        arg.relativePath || "directory"
      )}`;
    case "fs.delete":
      if (result?.ok) {
        return `✅ Deleted ${chalk.cyan(arg.relativePath || "item")}`;
      }
      return `❌ Failed to delete ${chalk.cyan(arg.relativePath || "item")}`;
    case "fs.copy":
      if (result?.ok) {
        return `✅ Copied ${chalk.cyan(
          arg.sourcePath || "source"
        )} to ${chalk.cyan(arg.destinationPath || "destination")}`;
      }
      return `❌ Failed to copy ${chalk.cyan(arg.sourcePath || "source")}`;
    case "fs.move":
      if (result?.ok) {
        return `✅ Moved ${chalk.cyan(
          arg.sourcePath || "source"
        )} to ${chalk.cyan(arg.destinationPath || "destination")}`;
      }
      return `❌ Failed to move ${chalk.cyan(arg.sourcePath || "source")}`;
    case "fs.stats":
      if (result?.stats) {
        const size = result.stats.size ? ` - ${result.stats.size} bytes` : "";
        return `✅ Retrieved stats for ${chalk.cyan(
          arg.relativePath || "item"
        )}${size}`;
      }
      return `❌ Failed to get stats for ${chalk.cyan(
        arg.relativePath || "item"
      )}`;
    case "fs.summarize":
      if (result?.success !== false && result?.summary) {
        const lines = result.totalLines ? ` - ${result.totalLines} lines` : "";
        return `✅ Summarized file ${chalk.cyan(
          arg.relativePath || "file"
        )}${lines}`;
      }
      return `❌ Failed to summarize file ${chalk.cyan(
        arg.relativePath || "file"
      )}`;
    case "fs.readChunk":
      if (result?.text) {
        const lines = result.chunkLines || 0;
        return `✅ Read chunk from ${chalk.cyan(
          arg.relativePath || "file"
        )} - ${chalk.gray(`${lines} lines`)}`;
      }
      return `❌ Failed to read chunk from ${chalk.cyan(
        arg.relativePath || "file"
      )}`;
    case "fs.lineCount":
      if (result?.ok) {
        const lines = result.totalLines || 0;
        const strategy = result.strategy ? ` - ${result.strategy}` : "";
        return `✅ Counted lines in ${chalk.cyan(
          arg.relativePath || "file"
        )} - ${chalk.gray(`${lines} lines${strategy}`)}`;
      }
      return `❌ Failed to count lines in ${chalk.cyan(
        arg.relativePath || "file"
      )}`;
    // Execution completions
    case "exec.command":
      if (result?.success) {
        const duration = result.duration ? `${result.duration}ms` : "";
        const output = result.output
          ? ` - ${result.output.split("\n").length} lines output`
          : "";
        return `✅ Command completed ${duration}${output}`;
      }
      return `❌ Command failed: ${result?.error || "execution error"}`;
    case "exec.startServer":
      if (result?.success) {
        const port = result.port ? ` on port ${result.port}` : "";
        const pid = result.pid ? ` (PID ${result.pid})` : "";
        return `✅ Server started${port}${pid}`;
      }
      return `❌ Failed to start server: ${
        result?.message || result?.error || "unknown error"
      }`;
    case "exec.stopServer":
      if (result?.success) {
        return `✅ Server stopped: ${result.name || "server"}`;
      }
      return `❌ Failed to stop server: ${result?.message || "unknown error"}`;
    case "exec.findPidsByPort":
      if (result?.success && result?.pids?.length > 0) {
        return `✅ Found ${result.pids.length} process(es) on port ${arg.port}`;
      } else if (result?.success) {
        return `✅ Port ${arg.port} is free`;
      }
      return `❌ Failed to check port ${arg.port}`;
    case "exec.killPid":
      if (result?.success) {
        return `✅ Killed process PID ${arg.pid} with signal ${
          result.signal || "TERM"
        }`;
      }
      return `❌ Failed to kill process PID ${arg.pid}`;
    case "exec.freePort":
      if (result?.success) {
        const killed = result.killedPids?.length || 0;
        return killed > 0
          ? `✅ Freed port ${arg.port} - killed ${killed} process(es)`
          : `✅ Port ${arg.port} was already free`;
      }
      return `❌ Failed to free port ${arg.port}`;
    case "exec.grep":
      if (result?.success) {
        const count = result.count || 0;
        return `✅ Search completed - ${chalk.gray(`${count} matches found`)}`;
      }
      return `❌ Search failed`;
    case "exec.listServers":
      if (result?.success !== false) {
        const count =
          result?.count ||
          (Array.isArray(result?.servers) ? result.servers.length : 0);
        return `✅ Found ${chalk.cyan(count.toString())} running servers`;
      }
      return `❌ Failed to list servers`;
    case "exec.getServerLogs":
      if (result?.success && result?.logs) {
        const lines = result.logs.split("\n").length;
        return `✅ Retrieved server logs - ${chalk.gray(`${lines} lines`)}`;
      }
      return `❌ Failed to get server logs`;
    // Sandbox completions
    case "sandbox.launch":
      if (result?.containerId) {
        return `✅ Launched ${arg.runtime || "unknown"} sandbox - ${chalk.gray(
          result.containerId.substring(0, 12)
        )}`;
      }
      return `❌ Failed to launch sandbox`;
    case "sandbox.switch":
      if (result?.containerId) {
        const switched = result.switched ? "switched to" : "already using";
        return `✅ Sandbox ${switched} ${arg.runtime} - ${chalk.gray(
          result.containerId.substring(0, 12)
        )}`;
      }
      return `❌ Failed to switch sandbox`;
    case "sandbox.info":
      if (result?.runtime) {
        return `✅ Sandbox info: ${result.runtime} runtime - ${chalk.gray(
          result.containerId?.substring(0, 12) || "unknown"
        )}`;
      }
      return `❌ No active sandbox`;
    case "sandbox.shutdown":
      if (result?.ok) {
        return `✅ Sandbox shut down`;
      }
      return `❌ Failed to shut down sandbox`;
    // Docker completions
    case "docker.start":
      if (result?.containerId) {
        return `✅ Started container ${chalk.cyan(
          arg.image || "container"
        )} - ${chalk.gray(result.containerId.substring(0, 12))}`;
      }
      return `❌ Failed to start container ${chalk.cyan(
        arg.image || "container"
      )}`;
    case "docker.exec":
      if (result?.output !== undefined) {
        const lines = result.output.split("\n").length;
        return `✅ Command executed in container - ${chalk.gray(
          `${lines} lines output`
        )}`;
      }
      return `❌ Failed to execute command in container`;
    case "docker.stop":
      if (result?.ok) {
        return `✅ Stopped container ${chalk.cyan(
          (arg.containerId || "container").substring(0, 12)
        )}`;
      }
      return `❌ Failed to stop container`;
    case "docker.getCurrentContainer":
      if (result?.id) {
        return `✅ Current container: ${chalk.gray(
          result.id.substring(0, 12)
        )}`;
      }
      return `❌ No current container found`;
    case "docker.listNetworks":
      if (Array.isArray(result)) {
        return `✅ Listed Docker networks - ${chalk.gray(
          `${result.length} networks`
        )}`;
      }
      return `❌ Failed to list Docker networks`;
    case "docker.createNetwork":
      if (result?.ok) {
        return `✅ Created Docker network ${chalk.cyan(arg.name || "network")}`;
      }
      return `❌ Failed to create Docker network ${chalk.cyan(
        arg.name || "network"
      )}`;
    case "docker.connectToNetwork":
      if (result?.ok) {
        return `✅ Connected container to network ${chalk.cyan(
          arg.networkName || "network"
        )}`;
      }
      return `❌ Failed to connect container to network`;
    case "docker.disconnectFromNetwork":
      if (result?.ok) {
        return `✅ Disconnected container from network ${chalk.cyan(
          arg.networkName || "network"
        )}`;
      }
      return `❌ Failed to disconnect container from network`;
    case "docker.restartWithPorts":
      if (result?.containerId) {
        return `✅ Restarted container with new ports - ${chalk.gray(
          result.containerId.substring(0, 12)
        )}`;
      }
      return `❌ Failed to restart container with new ports`;
    // Internal browser completions
    case "browser.navigate":
      if (result?.success) {
        const title = result.title
          ? ` - "${result.title.substring(0, 30)}..."`
          : "";
        return `✅ Internal Browser Agent navigated to ${chalk.cyan(
          result.url || arg.url || "page"
        )}${title}`;
      }
      return `❌ Internal Browser Agent navigation failed`;
    case "browser.screenshot":
      if (result?.success) {
        return `✅ Internal Browser Agent screenshot saved to ${chalk.cyan(
          result.relativePath || result.path || "file"
        )}`;
      }
      return `❌ Internal Browser Agent screenshot failed`;
    case "browser.create":
      if (result?.success) {
        return `✅ Internal Browser Agent created`;
      }
      return `❌ Failed to create Internal Browser Agent`;
    case "browser.close":
      if (result?.success) {
        return `✅ Internal Browser Agent closed`;
      }
      return `❌ Failed to close Internal Browser Agent`;
    case "browser.status":
      if (result?.active) {
        return `✅ Internal Browser Agent is active - ${chalk.gray(
          `session: ${result.sessionId?.substring(0, 12) || "unknown"}`
        )}`;
      }
      return `✅ Internal Browser Agent is inactive`;
    // Context7 / docs
    case "context7.search":
      if (result?.success !== false) {
        const count = Array.isArray(result)
          ? result.length
          : result?.libraries?.length || 0;
        return `✅ Web search completed - ${chalk.gray(
          `${count} libraries found`
        )}`;
      }
      return `❌ Web search failed`;
    case "context7.getDocs":
      if (result?.success !== false && result?.content) {
        const size =
          typeof result.content === "string" ? result.content.length : 0;
        return `✅ Documentation fetched - ${chalk.gray(`${size} characters`)}`;
      }
      return `❌ Failed to fetch documentation`;
    case "docs.fetchUrl":
      if (result?.success !== false && result?.text) {
        const chars = result.text.length;
        return `✅ Web content fetched - ${chalk.gray(`${chars} characters`)}`;
      }
      return `❌ Failed to fetch web content`;
    case "hyperagent.run":
      if (result?.success !== false) {
        return `✅ Hyperbrowser Agent task completed`;
      }
      return `❌ Hyperbrowser Agent task failed`;
    // HyperBrowser completions
    case "hbrowser.session.create":
      if (result?.id) {
        return `✅ Hyperbrowser session created - ${chalk.gray(
          result.id.substring(0, 12)
        )}`;
      }
      return `❌ Failed to create Hyperbrowser session`;
    case "hbrowser.session.stop":
      if (result?.ok) {
        return `✅ Hyperbrowser session stopped`;
      }
      return `❌ Failed to stop Hyperbrowser session`;
    case "hbrowser.navigate":
      if (result?.title) {
        return `✅ Hyperbrowser navigated - ${chalk.gray(
          `"${result.title.substring(0, 30)}..."`
        )}`;
      }
      return `❌ Hyperbrowser navigation failed`;
    // Google Drive completions
    case "pDrive.isAccountLinked":
      if (result?.isLinked || result?.linked) {
        const email = result?.email ? ` (${result.email})` : "";
        return `✅ Google Drive account is linked${email}`;
      }
      return `❌ Google Drive account not linked - use pDrive.linkAccount to connect`;
    case "pDrive.linkAccount":
      if (result?.success && result?.authUrl) {
        return `✅ Google Drive OAuth started - ${chalk.cyan(
          "visit the authorization URL to complete linking"
        )}`;
      }
      return `❌ Failed to start Google Drive OAuth flow`;
    case "pDrive.unlinkAccount":
      if (result?.success) {
        return `✅ Google Drive account unlinked`;
      }
      return `❌ Failed to unlink Google Drive account`;
    case "pDrive.listFiles":
      if (result?.success && result?.files && Array.isArray(result.files)) {
        const count = result.count || result.files.length;
        return `✅ Listed Google Drive files - ${chalk.gray(
          `${count} files found`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Google Drive not linked - use pDrive.linkAccount first`;
      }
      return `❌ Failed to list Google Drive files`;
    case "pDrive.readFile":
      if (result?.success && (result?.content || result?.text)) {
        const size = (result.content || result.text).length;
        const name = result?.name ? ` "${result.name}"` : "";
        return `✅ Read Google Drive file${name} - ${chalk.gray(
          `${size} characters`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Google Drive not linked - use pDrive.linkAccount first`;
      }
      return `❌ Failed to read Google Drive file`;
    case "pDrive.writeFile":
      if (result?.success && (result?.fileId || result?.id)) {
        const name = result?.name ? ` "${result.name}"` : "";
        return `✅ Created Google Drive file${name} - ${chalk.gray(
          `ID: ${(result.fileId || result.id).substring(0, 12)}...`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Google Drive not linked - use pDrive.linkAccount first`;
      }
      return `❌ Failed to create Google Drive file`;
    case "pDrive.searchFiles":
      if (result?.success && result?.files && Array.isArray(result.files)) {
        const count = result.count || result.files.length;
        const query = result?.query ? ` for "${result.query}"` : "";
        return `✅ Google Drive search completed${query} - ${chalk.gray(
          `${count} files found`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Google Drive not linked - use pDrive.linkAccount first`;
      }
      return `❌ Google Drive search failed`;
    // Notion completions
    case "notion.isLinked":
      if (result?.isLinked) {
        return `✅ Notion account is linked and ready`;
      }
      return `❌ Notion account not linked - use notion.linkAccount to connect`;
    case "notion.linkAccount":
      if (result?.success) {
        return `✅ Notion account linked successfully`;
      }
      return `❌ Failed to link Notion account - check your integration token`;
    case "notion.unlinkAccount":
      if (result?.success) {
        return `✅ Notion account unlinked successfully`;
      }
      return `❌ Failed to unlink Notion account`;
    case "notion.createPage":
      if (result?.success && result?.pageId) {
        const title = arg.title ? ` "${arg.title}"` : "";
        return `✅ Created Notion page${title} - ${chalk.gray(
          `ID: ${result.pageId.substring(0, 12)}...`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to create Notion page`;
    case "notion.createDatabase":
      if (result?.success && result?.databaseId) {
        const title = arg.title ? ` "${arg.title}"` : "";
        return `✅ Created Notion database${title} - ${chalk.gray(
          `ID: ${result.databaseId.substring(0, 12)}...`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to create Notion database`;
    case "notion.queryDatabase":
      if (result?.success && result?.results) {
        const count = result.results.length;
        const more = result.hasMore ? " (more available)" : "";
        return `✅ Queried Notion database - ${chalk.gray(
          `${count} results${more}`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to query Notion database`;
    case "notion.updatePage":
      if (result?.success) {
        return `✅ Updated Notion page successfully`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to update Notion page`;
    case "notion.getPage":
      if (result?.success && result?.page) {
        return `✅ Retrieved Notion page successfully`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to get Notion page`;
    case "notion.getDatabase":
      if (result?.success && result?.database) {
        return `✅ Retrieved Notion database successfully`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to get Notion database`;
    case "notion.search":
      if (result?.success && result?.results) {
        const count = result.results.length;
        const query = arg.query ? ` for "${arg.query}"` : "";
        return `✅ Notion search completed${query} - ${chalk.gray(
          `${count} results found`
        )}`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Notion search failed`;
    case "notion.addBlocks":
      if (result?.success) {
        const blockCount = arg.blocks?.length || 0;
        return `✅ Added ${blockCount} block(s) to Notion page`;
      } else if (result?.needsAuth) {
        return `❌ Notion not linked - use notion.linkAccount first`;
      }
      return `❌ Failed to add blocks to Notion page`;
    default:
      if (toolName.startsWith("mcp.")) {
        const parts = toolName.split(".");
        const serverName = parts[1];
        const toolFunction = parts.slice(2).join(".");
        if (result?.success !== false) {
          return `✅ ${chalk.cyan(
            toolFunction
          )} completed via MCP server ${chalk.yellow(serverName)}`;
        }
        return `❌ ${chalk.cyan(
          toolFunction
        )} failed via MCP server ${chalk.yellow(serverName)}`;
      }
      return null;
  }
}

// Enhanced wrapper to safely execute tool functions with comprehensive feedback
export function createSafeToolWrapper<T extends (...args: any[]) => any>(
  toolName: string,
  toolFn: T
): T {
  return ((...args: any[]) => {
    const executionId = `${toolName}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    toolCollector.startExecution(executionId, toolName, args[0] || args);

    try {
      const result = toolFn(...args);

      if (result && typeof (result as any).then === "function") {
        return (result as Promise<any>)
          .then((res: any) => {
            toolCollector.completeExecution(executionId, res);
            // Show only the completion message to save space
            const completionMessage = getToolCompletionMessage(
              toolName,
              args[0] || args,
              res
            );
            if (completionMessage) {
              console.log(chalk.green(completionMessage));
            }
            return res;
          })
          .catch((error: Error) => {
            toolCollector.failExecution(executionId, error);
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

      // For synchronous operations, just show the final message
      toolCollector.completeExecution(executionId, result);
      const completionMessage = getToolCompletionMessage(
        toolName,
        args[0] || args,
        result
      );
      if (completionMessage) {
        console.log(chalk.green(completionMessage));
      }
      return result;
    } catch (error) {
      toolCollector.failExecution(executionId, error as Error);
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
