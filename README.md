# ai-container

## AI Container CLI - Multi-Runtime

Run an AI agent in your terminal with ultra-fast containerized execution that can:

- **Multi-Runtime Container**: Single Docker container with Node.js 20, Bun 1.2.22, and Python 3.11 pre-installed
- **Ultra-Fast Startup**: 1-3 second container launch (vs 30-60 seconds previously)
- **Simultaneous Runtimes**: All runtimes available in the same container - no switching needed
- Use Hyperbrowser to browse the web via remote Chromium
- Fetch docs using Context7 (or fall back to URL fetch)
- Use Vercel AI SDK with OpenRouter models and tool calls

### Setup

1. Create a `.env` file with:

```
OPENROUTER_API_KEY=...           # Required: OpenRouter API key for AI models
HYPERBROWSER_API_KEY=...         # Required: Hyperbrowser API key for web automation
CONTEXT7_API_KEY=...             # Optional: Context7 API key for documentation search

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
# AI_SYSTEM=custom_prompt.txt      # Custom system prompt file
# SANDBOX_VOLUME_PATH=./.sandbox  # Custom sandbox directory
```

2. Build the multi-runtime Docker image:

```bash
bun run build-image
# or: docker build -f Dockerfile.bun -t ai-container:multi-runtime .
```

3. Start CLI:

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

- Type instructions. The agent will call tools as needed.
- **Interactive CLI**: Use ↑/↓ arrows to navigate tool calls, Enter to expand details
- To provide files as context, mount them in the Docker tool via volume options.
  To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.15. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
