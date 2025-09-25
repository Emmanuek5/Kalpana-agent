# Kalpana (कल्पना) - AI Container

## Kalpana AI - Multi-Runtime Development Assistant

**Kalpana** (Sanskrit: कल्पना, meaning "imagination/creation") is an AI development assistant that runs in your terminal with ultra-fast containerized execution. Kalpana can:

- **Multi-Runtime Container**: Single Docker container with Node.js 20, Bun 1.2.22, and Python 3.11 pre-installed
- **Ultra-Fast Startup**: 1-3 second container launch (vs 30-60 seconds previously)
- **Simultaneous Runtimes**: All runtimes available in the same container - no switching needed
- **Flexible Sandbox**: Custom sandbox directories with `--sandbox` option for project-specific workspaces
- **Multi-Modal AI Analysis**: Analyze images, PDFs, videos, and audio files using Google Gemini AI
- **Google Drive Integration**: Seamlessly work with files from your Google Drive
- **Advanced Web Automation**: Complete browser automation with local Puppeteer, remote HyperBrowser, and AI-powered HyperAgent
- **Intelligent Web Scraping**: Extract content from websites with captcha solving and ad blocking
- **Documentation Access**: Fetch docs using Context7 or direct URL access
- **Multi-Language Error Checking**: Comprehensive syntax validation for 9+ programming languages
- **Smart Context Management**: Intelligent conversation memory with automatic summarization
- **Extensible Tool System**: MCP (Model Context Protocol) support for custom tools

### Installation

**Global Installation (Recommended):**

```bash
# Install globally via npm
npm install -g kalpana-agent

# Or via yarn
yarn global add kalpana-agent

# Or via pnpm
pnpm install -g kalpana-agent

# Or via bun
bun install -g kalpana-agent
```

**Note:** The package name is `kalpana-agent`, but the CLI commands are `kalpana` and `kalpana-interactive`.

**Local Development Setup:**

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/kalpana-agent.git
cd kalpana-agent
bun install
```

### Configuration

#### Browser logging

By default, browser automation logs (Puppeteer request failures, page errors, and navigation messages) are suppressed to keep the console clean. To enable verbose logging for debugging, set:

```bash
# Windows PowerShell
$env:SCRAPER_DEBUG = "1"

# Bash
export SCRAPER_DEBUG=1
```

When enabled, you'll see messages like request failures (ignored), page script errors, navigation traces, and cleanup issues from `src/tools/local-scraper.ts` and `src/tools/browser.ts`.

**Global Installation (Recommended):**

After installing Kalpana globally, run the interactive setup:

```bash
kalpana-config setup
```

This will guide you through configuring your API keys and preferences. The configuration is stored globally in `~/.kalpana/config.json`.

**Configuration Commands:**

```bash
kalpana-config setup              # Interactive setup wizard
kalpana-config show               # Display current configuration
kalpana-config set <key> <value>  # Set a configuration value
kalpana-config get <key>          # Get a configuration value
kalpana-config validate           # Validate configuration
kalpana-config mcp                # Open MCP servers configuration
```

### MCP Server Configuration

Kalpana supports [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers for extending functionality. Configure MCP servers in `~/mcp.json`:

```bash
kalpana-config mcp    # Opens ~/mcp.json in your default editor
```

**Example MCP Configuration:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/files"
      ]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-brave-api-key"
      }
    }
  }
}
```

#### Adding MCP Servers with Different Transports

Kalpana supports three main transport methods for connecting to MCP servers, allowing flexibility based on your needs. The `transport` field in each server configuration specifies the method:

- **SSE (Server-Sent Events)**: The default for lightweight remote connections. Use this for simple tool fetching from remote servers where you need quick, one-way communication without persistent sessions. Ideal for read-only or stateless tools.
- **HTTP**: For streaming with session support. Use this for interactive or streaming tools that require bidirectional communication, such as those involving real-time updates or authenticated sessions.
- **Stdio**: For local processes like npx commands. Use this for running local MCP servers directly on your machine, providing the fastest execution for tools that don't need remote access.

To avoid tool name conflicts across servers, prefix tool calls with the server name (e.g., `mcp.servername.toolname`).

**Practical Examples in `mcp.json`:**

1. **SSE Transport (e.g., DeepWiki for documentation search)**:

   ```json
   {
     "mcpServers": {
       "deepwiki": {
         "transport": "sse",
         "url": "https://api.deepwiki.com/mcp",
         "headers": {
           "Authorization": "Bearer your-deepwiki-api-key"
         }
       }
     }
   }
   ```

   This connects to a remote DeepWiki server via SSE for fetching documentation tools. Authentication is handled via headers.

2. **HTTP Transport (e.g., Context7 for advanced search)**:

   ```json
   {
     "mcpServers": {
       "context7": {
         "transport": "http",
         "url": "https://api.context7.com/mcp",
         "headers": {
           "X-API-Key": "your-context7-api-key"
         }
       }
     }
   }
   ```

   Use HTTP for Context7's interactive documentation tools that may involve streaming responses. Sessions are maintained for multi-step queries.

3. **Stdio Transport (e.g., Local Filesystem Server)**:
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "transport": "stdio",
         "command": "npx",
         "args": [
           "-y",
           "@modelcontextprotocol/server-filesystem",
           "/path/to/allowed/files"
         ],
         "env": {
           "ALLOWED_PATHS": "/path/to/allowed/files"
         }
       }
     }
   }
   ```
   This runs a local filesystem MCP server via Stdio, perfect for file operations without network overhead.

**Additional Notes:**

- **Dynamic Loading**: Servers are loaded dynamically at runtime. Failed servers (e.g., due to connection errors or invalid configs) are ignored, and Kalpana continues with available tools.
- **Error Handling**: Check the console for loading errors. Use the `/mcp` in-chat command to verify status.
- **CLI Testing**: Test your MCP configuration independently with:
  ```bash
  bun src/mcp.ts --config ./mcp.json
  ```
  This command loads and lists available tools from your configured servers without starting the full Kalpana CLI.

**Local Development Setup:**

1. Create a `.env` file with:

```
OPENROUTER_API_KEY=...           # Required: OpenRouter API key for AI models
HYPERBROWSER_API_KEY=...         # Required: Hyperbrowser API key for web automation
CONTEXT7_API_KEY=...             # Optional: Context7 API key for documentation search
GEMINI_API_KEY=...               # Optional: Google Gemini API key for multi-modal analysis
GOOGLE_CLIENT_ID=...             # Optional: Google OAuth client ID for Drive integration
GOOGLE_CLIENT_SECRET=...         # Optional: Google OAuth client secret for Drive integration

# Docker host (required)
# Windows (Docker Desktop):
# DOCKER_HOST=npipe://./pipe/docker_engine
# Linux/macOS:
# DOCKER_HOST=unix:///var/run/docker.sock
# Or TCP (if enabled):
# DOCKER_HOST=http://localhost:2375

# Optional model configuration
# MODEL_ID=openai/gpt-4o-mini     # Default AI model for main agent
# SUB_AGENT_MODEL_ID=openai/gpt-4o-mini  # Model for sub-agent file writer
# GEMINI_MODEL=gemini-2.0-flash-exp      # Default Gemini model for analysis
# AI_SYSTEM=custom_prompt.txt      # Custom system prompt file
# SANDBOX_VOLUME_PATH=./.sandbox  # Custom sandbox directory
```

2. Build the multi-runtime Docker image:

```bash
bun run build-image
# or: docker build -f Dockerfile.bun -t ai-container:multi-runtime .
```

3. Start Kalpana:

**Global Installation:**

```bash
# Standard CLI
kalpana

# Interactive CLI (Enhanced UI)
kalpana-interactive
```

**Local Development:**

```bash
# Standard CLI
bun run start
# or directly: bun run src/cli.ts

# Interactive CLI (Enhanced UI)
bun run interactive
# or directly: bun run src/cli-interactive.ts
```

### CLI Options

**Sandbox Configuration:**

```bash
# Global installation
kalpana --sandbox .                              # Current directory
kalpana --sandbox ./my-web-app                   # Specific project folder
kalpana --sandbox ../shared-workspace            # Parent directory
kalpana --sandbox /absolute/path/to/workspace    # Absolute path
kalpana --sandbox ./project --save-history       # With history saving

# Local development
bun run start --sandbox .
bun run start --sandbox ./my-web-app
bun run start --sandbox ../shared-workspace
```

**Available CLI Options:**

- `--sandbox <path>` - Set custom sandbox directory (supports relative and absolute paths)
- `--save-history` - Save conversation history to `history.json`
- `--history` - Alias for `--save-history`

**In-Chat Commands:**

- `/help` - Show help message and available commands
- `/mcp` - Show MCP server status and loaded tools
- `/context` - Show context manager status and token usage
- `/context search <query>` - Search through summarized conversation history
- `/context stats` - Show detailed context statistics and memory usage
- `/processes` (or `/ps`) - List all running processes in container

### Features

**Standard CLI:**

- Real-time progress indicators with animated spinners
- File editing with diff information (+5 -2 lines)
- Contextual tool descriptions
- `/mcp` command to view MCP server status

**Interactive CLI (Enhanced):**

- Expandable tool call details with full arguments and results
- Arrow key navigation through tool calls
- Visual progress tracking with real-time updates
- Enhanced UI with boxes and improved layout
- Press `Enter` to expand/collapse tool details
- Press `ESC` to exit
- Press `m` for MCP status

### Usage

- Type instructions. Kalpana will call tools as needed to help with your development tasks.
- **Interactive CLI**: Use ↑/↓ arrows to navigate tool calls, Enter to expand details
- **Multi-Modal Analysis**: Ask Kalpana to analyze images, PDFs, videos, or audio files
- **Google Drive**: Link your Google Drive account to work with cloud files
- **Web Automation**: Three powerful browser automation approaches:
  - **Local Browser**: Fast Puppeteer automation for development and testing
  - **HyperBrowser**: Remote browser with captcha solving, ad blocking, and anti-detection
  - **HyperAgent**: AI-powered autonomous web tasks with natural language descriptions
- **Web Scraping**: Extract structured data (text, links, images, metadata) from websites
- **Custom Sandbox**: Use `--sandbox` to work in any directory for project-specific workflows
- **Error Checking**: Validate code syntax and quality across multiple programming languages
- **Context Management**: Intelligent conversation memory that preserves important information

### Multi-Language Error Checking

**Supported Languages:**

- **JavaScript/TypeScript**: Syntax validation, ESLint integration, import/export checking
- **Python**: Indentation validation, Python 2/3 compatibility, import analysis
- **PHP**: Syntax checking, deprecated function detection, variable validation
- **Go**: Package validation, unused variable detection, error handling patterns
- **Rust**: Memory safety checks, unused variable warnings, unwrap() usage analysis
- **Java**: Naming conventions, syntax validation, best practice enforcement
- **C/C++**: Memory leak detection, syntax checking, modern C++ recommendations

**Error Checking Features:**

- **Comprehensive validation**: Syntax errors, type errors, linting issues, best practices
- **Line-by-line reporting**: Precise error locations with detailed descriptions
- **Project-wide analysis**: Validate entire codebases including critical configuration files
- **Integration ready**: Works with TypeScript compiler, ESLint, and other development tools
- **Smart file detection**: Automatically detects file types and applies appropriate validation rules

**Usage Examples:**

```bash
# Check individual files
"Check this Python script for errors: ./app.py"
"Validate the syntax of my TypeScript component"

# Project-wide validation
"Analyze this entire project for code quality issues"
"Check all the configuration files in this repository"
```

### Smart Context Management

**Intelligent Memory System:**

- **Automatic summarization**: Preserves conversation history within 230k token limits
- **Importance-based retention**: Prioritizes critical discussions (errors, configurations, decisions)
- **Silent operation**: Works seamlessly in the background without interrupting workflow
- **Persistent storage**: Context saved to `~/.kalpana/context/` for session continuity

**Context Features:**

- **Smart truncation**: Only summarizes when approaching token limits (225k/230k)
- **Key information preservation**: Technical details, code snippets, and important decisions retained
- **Searchable history**: Find information from previous conversations with `/context search`
- **Usage monitoring**: Track token consumption and conversation health with `/context stats`
- **Configurable thresholds**: Optimized for maximum context preservation

**Context Commands:**

```bash
/context                    # Show current token usage and status
/context search "docker"    # Search conversation history
/context stats             # Detailed memory and token statistics
```

### Browser Automation Capabilities

**Local Browser Tools:**

- Complete Puppeteer automation for localhost testing
- Click, type, scroll, screenshot, and form interactions
- Fast execution for development workflows

**HyperBrowser (Remote):**

- Cloud-based browser instances with advanced features
- Automatic captcha solving and ad blocking
- Anti-detection with residential proxies
- Session management for complex workflows
- Intelligent web scraping with structured data extraction

**HyperAgent (AI-Powered):**

- Natural language web task automation
- Examples: "Find the best laptop under $1000 on Amazon"
- Autonomous multi-step workflows with AI decision-making
- Handles complex research and data gathering tasks

**Web Scraping Features:**

- Extract text content, links, images, and metadata
- Wait for dynamic content to load
- Custom CSS selectors for precise targeting
- Batch operations on multiple elements

### Additional Resources

- **[Gemini AI Integration](./README-Gemini.md)** - Complete guide for multi-modal file analysis
- **[Google Drive Integration](./README-GoogleDrive.md)** - Setup and usage for cloud file operations
- **[Docker Setup](./README-Docker.md)** - Custom container configuration

---

**Kalpana** - Where imagination meets creation in AI-powered development.

This project was created using `bun init` in bun v1.2.15. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
