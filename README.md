# ai-container

## AI Container CLI

Run an AI agent in your terminal that can:

- Start and interact with Docker containers (with volume mounts for context)
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
# SANDBOX_RUNTIME=node            # Default sandbox runtime (node/python)
# SANDBOX_VOLUME_PATH=./.sandbox  # Custom sandbox directory
```

2. Start CLI:

```
bun run src/cli.ts
```

### Usage

- Type instructions. The agent will call tools as needed.
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
