# Kalpana (कल्पना) - AI Container

## Kalpana AI - Multi-Runtime Development Assistant

**Kalpana** (Sanskrit: कल्पना, meaning "imagination/creation") is an AI development assistant that runs in your terminal with ultra-fast containerized execution. Kalpana can:

- **Multi-Runtime Container**: Single Docker container with Node.js 20, Bun 1.2.22, and Python 3.11 pre-installed
- **Ultra-Fast Startup**: 1-3 second container launch (vs 30-60 seconds previously)
- **Simultaneous Runtimes**: All runtimes available in the same container - no switching needed
- **Multi-Modal AI Analysis**: Analyze images, PDFs, videos, and audio files using Google Gemini AI
- **Google Drive Integration**: Seamlessly work with files from your Google Drive
- **Web Automation**: Browse the web and automate tasks via Hyperbrowser
- **Documentation Access**: Fetch docs using Context7 or direct URL access
- **Extensible Tool System**: MCP (Model Context Protocol) support for custom tools

### Setup

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

**Standard CLI:**

```bash
bun run start
# or directly: bun run src/cli.ts
```

**Interactive CLI (Enhanced UI):**

```bash
bun run interactive
# or directly: bun run src/cli-interactive.ts
```

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
- **Web Automation**: Request web browsing and automation tasks
- To provide files as context, mount them in the Docker tool via volume options.
  To install dependencies:

```bash
bun install
```

To run Kalpana:

```bash
bun run index.ts
```

### Additional Resources

- **[Gemini AI Integration](./README-Gemini.md)** - Complete guide for multi-modal file analysis
- **[Google Drive Integration](./README-GoogleDrive.md)** - Setup and usage for cloud file operations
- **[Docker Setup](./README-Docker.md)** - Custom container configuration

---

**Kalpana** - Where imagination meets creation in AI-powered development.

This project was created using `bun init` in bun v1.2.15. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
