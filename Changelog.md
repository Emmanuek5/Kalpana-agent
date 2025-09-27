# Changelog

All notable changes to AI Container will be documented in this file.

## [1.1.11] - 2025-09-24

### Fixed

- Sanitized tool names sent to providers to satisfy OpenAI function name pattern (^[a-zA-Z0-9_-]+$). This resolves `Invalid 'tools[0].name'` errors when using OpenAI-backed models via OpenRouter. Tool keys like `fs.writeFile` are now transformed to `fs_writeFile` transparently before requests.
- Normalized sanitized tool names back to dotted originals in `safeToolWrapper` for clean logging and messages (e.g., `fs_writeFile` displays as `fs.writeFile`).

## [1.1.12] - 2025-09-26

### Fixed

- Prevented provider context overflows that caused OpenRouter 400 errors ("maximum context length") by:
  - Truncating large tool outputs globally in `safeToolWrapper` (caps for strings, arrays, objects, and depth)
  - Capping `fs.listDir` results by default (returns up to 2000 items; hard max 5000; configurable via `limit`)
  - Hardening `runAgent` error handling to avoid undefined `response` access and return a friendly message on provider errors

### Notes

- The truncation limits can be tuned via environment variables: `TOOL_MAX_STRING_CHARS`, `TOOL_MAX_ARRAY_ITEMS`, `TOOL_MAX_OBJECT_KEYS`.

### Added

- Google Calendar integration with OAuth and tools:

  - `gcal.isLinked`, `gcal.linkAccount`, `gcal.unlinkAccount`
  - `gcal.listCalendars`, `gcal.listEvents`, `gcal.createEvent`, `gcal.updateEvent`, `gcal.deleteEvent`, `gcal.quickAdd`
  - Uses the same OAuth credentials as Google Drive (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`). Tokens stored at `~/.kalpana/gcal-token.json`.

- Gmail integration with OAuth and tools:

  - `gmail.isLinked`, `gmail.linkAccount`, `gmail.unlinkAccount`
  - `gmail.listLabels`, `gmail.listMessages`, `gmail.getMessage`, `gmail.sendMessage`
  - Uses the same OAuth credentials; tokens stored at `~/.kalpana/gmail-token.json`.

- Google Workspace (Sheets & Docs): single OAuth linking shared across services
  - Sheets: `sheets.isLinked`, `sheets.linkAccount`, `sheets.unlinkAccount`, `sheets.readRange`, `sheets.writeRange`, `sheets.appendRows`, `sheets.createSpreadsheet`
  - Docs: `gdocs.createDocument`, `gdocs.getDocument`, `gdocs.batchUpdate`
  - Token stored at `~/.kalpana/gworkspace-token.json`.

## [1.1.0] - 2025-01-23

### Added

- **Multi-Language Error Checking System**: Comprehensive syntax validation for 9+ programming languages
  - JavaScript/TypeScript: Syntax validation, ESLint integration, import/export checking
  - Python: Indentation validation, Python 2/3 compatibility, import analysis
  - PHP: Syntax checking, deprecated function detection, variable validation
  - Go: Package validation, unused variable detection, error handling patterns
  - Rust: Memory safety checks, unused variable warnings, unwrap() usage analysis
  - Java: Naming conventions, syntax validation, best practice enforcement
  - C/C++: Memory leak detection, syntax checking, modern C++ recommendations
- **Smart Context Management System**: Intelligent conversation memory with automatic summarization
  - Preserves conversation history within 230k token limits
  - Importance-based retention prioritizing critical discussions
  - Silent operation working seamlessly in background
  - Persistent storage in ~/.kalpana/context/ for session continuity
  - Searchable history with `/context search <query>` command
  - Token usage monitoring with `/context` and `/context stats` commands
- **Error Checking Tools**:
  - `errorCheck.checkFile` for single file validation with line-by-line error reporting
  - `errorCheck.validateProject` for comprehensive project health checks
  - Automatic file type detection with smart content analysis
  - Integration with TypeScript compiler, ESLint, and other development tools
- **Enhanced CLI Commands**:
  - `/context` - Show context manager status and token usage
  - `/context search <query>` - Search through summarized conversation history
  - `/context stats` - Show detailed context statistics and memory usage
- **System Prompt Updates**: Added comprehensive documentation for error checking and context management capabilities

### Changed

- Updated package version to 1.1.0
- Enhanced package description to include new error checking and context management features
- Added new keywords: "error-checking", "context-management"
- Updated README.md with detailed sections on multi-language error checking and smart context management
- System prompt now includes error checking and context management capabilities

## [Unreleased]

### Added

- **Enhanced Server Management**: 2-minute timeout for long-running processes with automatic continuation and PID tracking
- **Background Server Syntax**: System prompt now guides agent to use `&` syntax for all server commands (e.g., `node app.js &`)
- **Improved Process Handling**: Commands timeout gracefully after 2 minutes but continue running, returning PID for later monitoring
- **Real-time Progress Indicators**: Interactive CLI progress system showing what the AI is doing in real-time
- **Animated Loading Spinners**: Visual feedback with spinning indicators for all tool operations
- **File Editing Progress**: Shows file names being edited with diff information (+X -Y lines)
- **Contextual Tool Messages**: User-friendly descriptions for each tool operation (e.g., "Editing file src/app.js", "Searching for pattern", "Starting server on port 3000")
- **Tool Result Summaries**: Shows completion status, duration, and operation-specific results
- **Progress Indicator System**: `ProgressIndicator` class that tracks and displays tool execution status
- **Non-blocking MCP Tools System**: Agent now starts immediately and loads MCP tools asynchronously in the background
- `MCPToolsManager` class for dynamic MCP server management with parallel loading
- **Enhanced MCP Transport Support**: Added SSE (default), HTTP `StreamableHTTPClientTransport`, and comprehensive stdio transport support for maximum compatibility
- Comprehensive error handling system for tool execution failures
- Safe tool wrapper that prevents individual tool errors from crashing the agent process
- Graceful error recovery with detailed error reporting
- Conversation history preservation even when errors occur
- Enhanced error messages that guide users toward alternative approaches
- Proper MCP client cleanup on agent shutdown
- Process management tools: `exec.findPidsByPort`, `exec.killPid`, `exec.freePort`
- **Container lifecycle management**: Track all containers started by the agent and stop/remove them on exit. Adds labels `ai-container.managed` and `ai-container.session` and a cleanup step in CLI/interactive CLIs.

### Changed

- **Enhanced CLI Experience**: Replaced simple "Thinking..." message with real-time progress indicators
- **Improved Progress File Detection**: Enhanced file path extraction in progress indicators to handle various argument structures
- **File Edit Tools**: Now provide detailed diff information including lines added/removed
- **Tool Execution Feedback**: Each tool shows descriptive progress messages instead of generic "Tool called" logs
- **onStepFinish Callback**: Enhanced to provide rich progress tracking and result summaries
- **MCP Architecture Refactor**: Moved MCP initialization from agent runtime to CLI startup level
- **Single MCP Initialization**: MCP tools load once at startup instead of on every agent call
- **Cleaner Agent Runtime**: Removed repetitive MCP loading messages from agent execution
- **Silent MCP Loading**: MCP tools load quietly in background with single status summary
- **Improved Startup UX**: Clean startup flow without overlapping messages and prompts
- Agent startup time significantly improved - no longer waits for MCP servers to connect
- MCP tools are now dynamically merged into the agent's toolset as they become available
- Tool names are prefixed with `mcp.{serverName}.{toolName}` to prevent conflicts
- **Transport Compatibility**: Default to SSE transport (AI SDK native) with optional HTTP and stdio transport support
- **Flexible Stdio Configuration**: Support both nested `{"stdio": {"command": "..."}}` and direct `{"command": "..."}` formats
- Configuration-driven transport selection via `"transport": "http"` in mcp.json
- Enhanced stdio MCP servers with process lifecycle management and detailed logging
- Updated system prompt to encourage alternative approaches when tools fail
- Improved CLI error handling to maintain conversation context during failures
- Enhanced error logging with color-coded messages for better visibility
- Added MCP cleanup to graceful shutdown process
- `exec.startServer` now proactively checks port conflicts and reports PIDs

### Technical Details

- **Progress System**: Created `ProgressIndicator` class with animated spinners, timing, and contextual messaging
- **Tool Mapping**: Comprehensive tool name to user-friendly description mapping for all 40+ tools
- **Diff Calculation**: Enhanced `subAgentWrite` to calculate and report lines added/removed
- **Result Parsing**: Smart parsing of tool results to extract meaningful completion information
- **Terminal Control**: Uses ANSI escape codes for real-time line clearing and spinner animation
- **MCP System**: Implemented `MCPToolsManager` class with background loading, parallel server connections, and proper client lifecycle management
- **Stdio MCP Support**: Full support for stdio-based MCP servers with flexible configuration options
- **Configuration Formats**: Support multiple config patterns - nested stdio, direct command, SSE, and HTTP transports
- MCP servers load in parallel using `Promise.allSettled()` for maximum performance
- Added comprehensive logging with color-coded status messages for MCP operations
- Automatic retry and error isolation - failed servers don't prevent others from loading
- Process lifecycle management for stdio MCP servers with proper cleanup
- Added `createSafeToolWrapper` function that wraps all tool executions
- Implemented try-catch blocks around the main `generateText` call
- Modified CLI to preserve history even during critical errors
- Added structured error responses with `recoverable: true` flag
- Enhanced error messages to be more user-friendly and actionable
- Implemented process utilities for PID discovery and port freeing inside sandbox

### Benefits

- **Transparent AI Operations**: Users can see exactly what the AI is doing in real-time (e.g., "Editing file src/app.js...")
- **Visual Progress Feedback**: Animated spinners and progress indicators provide engaging CLI experience
- **Detailed File Edit Summaries**: See exact changes made to files with diff information (+5 -2 lines)
- **Operation Context**: Clear descriptions of each tool operation instead of cryptic tool names
- **Execution Timing**: See how long each operation takes for performance awareness
- **Professional CLI Experience**: Matches expectations from modern development tools
- **Instant Agent Startup**: No more waiting for MCP servers - agent starts immediately
- **Dynamic Tool Loading**: MCP tools become available as servers connect, without blocking the main process
- **Improved Reliability**: Failed MCP servers don't prevent agent startup or affect other servers
- **Better Performance**: Parallel loading of multiple MCP servers for faster overall connection times
- Agent no longer crashes when individual tools fail (e.g., `exec.command`, `browser.create`, etc.)
- Conversation context is always preserved, allowing users to continue their session
- Better debugging with detailed error logs while maintaining user experience
- Graceful degradation when tools encounter issues
- Proper resource cleanup prevents MCP connection leaks

### **MCP Configuration Examples**

The system now supports multiple MCP server configuration formats:

```json
{
  "mcpServers": {
    "context7-stdio": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "your-key"]
    },
    "context7-sse": {
      "url": "https://mcp.context7.com/mcp",
      "headers": { "Authorization": "Bearer your-token" }
    },
    "local-nested": {
      "stdio": {
        "command": "node",
        "args": ["./local-server.js"],
        "env": { "DEBUG": "true" }
      }
    },
    "http-server": {
      "url": "https://example.com/mcp",
      "transport": "http",
      "sessionId": "custom-session"
    }
  }
}
```
