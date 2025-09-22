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
git clone https://github.com/your-org/kalpana.git
cd kalpana
bun install
```

### Configuration

**Global Installation (Recommended):**

After installing Kalpana globally, run the interactive setup:

```bash
kalpana config setup
```

This will guide you through configuring your API keys and preferences. The configuration is stored globally in `~/.kalpana/config.json`.

**Configuration Commands:**
```bash
kalpana config setup              # Interactive setup wizard
kalpana config show               # Display current configuration  
kalpana config set <key> <value>  # Set a configuration value
kalpana config get <key>          # Get a configuration value
kalpana config validate           # Validate configuration
```

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
