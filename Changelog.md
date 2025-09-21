# Changelog

All notable changes to AI Container will be documented in this file.

## [Unreleased]

### Added

- **Non-blocking MCP Tools System**: Agent now starts immediately and loads MCP tools asynchronously in the background
- `MCPToolsManager` class for dynamic MCP server management with parallel loading
- Comprehensive error handling system for tool execution failures
- Safe tool wrapper that prevents individual tool errors from crashing the agent process
- Graceful error recovery with detailed error reporting
- Conversation history preservation even when errors occur
- Enhanced error messages that guide users toward alternative approaches
- Proper MCP client cleanup on agent shutdown
- Process management tools: `exec.findPidsByPort`, `exec.killPid`, `exec.freePort`

### Changed

- **MCP Integration**: Replaced blocking MCP loading with non-blocking async system
- Agent startup time significantly improved - no longer waits for MCP servers to connect
- MCP tools are now dynamically merged into the agent's toolset as they become available
- Tool names are prefixed with `mcp.{serverName}.{toolName}` to prevent conflicts
- Updated system prompt to encourage alternative approaches when tools fail
- Improved CLI error handling to maintain conversation context during failures
- Enhanced error logging with color-coded messages for better visibility
- Added MCP cleanup to graceful shutdown process
- `exec.startServer` now proactively checks port conflicts and reports PIDs

### Technical Details

- **MCP System**: Implemented `MCPToolsManager` class with background loading, parallel server connections, and proper client lifecycle management
- MCP servers load in parallel using `Promise.allSettled()` for maximum performance
- Added comprehensive logging with color-coded status messages for MCP operations
- Automatic retry and error isolation - failed servers don't prevent others from loading
- Added `createSafeToolWrapper` function that wraps all tool executions
- Implemented try-catch blocks around the main `generateText` call
- Modified CLI to preserve history even during critical errors
- Added structured error responses with `recoverable: true` flag
- Enhanced error messages to be more user-friendly and actionable
- Implemented process utilities for PID discovery and port freeing inside sandbox

### Benefits

- **Instant Agent Startup**: No more waiting for MCP servers - agent starts immediately
- **Dynamic Tool Loading**: MCP tools become available as servers connect, without blocking the main process
- **Improved Reliability**: Failed MCP servers don't prevent agent startup or affect other servers
- **Better Performance**: Parallel loading of multiple MCP servers for faster overall connection times
- Agent no longer crashes when individual tools fail (e.g., `exec.command`, `browser.create`, etc.)
- Conversation context is always preserved, allowing users to continue their session
- Better debugging with detailed error logs while maintaining user experience
- Graceful degradation when tools encounter issues
- Proper resource cleanup prevents MCP connection leaks
