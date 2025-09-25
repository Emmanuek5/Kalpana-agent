# Ollama Integration for Kalpana

Kalpana now supports local AI models through Ollama integration! Run powerful AI models locally on your machine without requiring cloud API keys.

## What is Ollama?

[Ollama](https://ollama.com/) is a tool that lets you run large language models locally on your machine. It supports popular models like Llama 3.2, Mistral, Code Llama, and many others.

## Setup Instructions

### 1. Install Ollama

Visit [ollama.com](https://ollama.com/) and download Ollama for your operating system.

**Windows/macOS:**

- Download and run the installer from the website

**Linux:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Pull a Model

After installing Ollama, pull a model to use with Kalpana:

```bash
# Popular models you can try:
ollama pull llama3.2          # Meta's Llama 3.2 (4.1GB)
ollama pull mistral           # Mistral 7B (4.1GB)
ollama pull codellama         # Code Llama for programming (3.8GB)
ollama pull qwen2.5:7b        # Qwen 2.5 7B (4.4GB)
ollama pull phi3              # Microsoft Phi-3 (2.3GB) - smaller, faster

# List available models
ollama list
```

### 3. Configure Kalpana

Run the configuration setup and choose Ollama:

```bash
kalpana-config setup
```

When prompted:

1. **Choose AI provider**: Select `ollama`
2. **Ollama Base URL**: Use default `http://localhost:11434` (or your custom URL)
3. **Default Ollama model**: Enter the model name you pulled (e.g., `llama3.2`, `mistral`)

Alternatively, set environment variables:

```bash
# Set provider to Ollama
export AI_PROVIDER=ollama

# Set Ollama configuration
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.2

# Or set in .env file
echo "AI_PROVIDER=ollama" >> .env
echo "OLLAMA_BASE_URL=http://localhost:11434" >> .env
echo "OLLAMA_MODEL=llama3.2" >> .env
```

### 4. Start Kalpana

```bash
# Standard CLI
kalpana

# Interactive CLI
kalpana-interactive
```

## Model Recommendations

### For General Use

- **llama3.2** (4.1GB) - Excellent all-around performance
- **mistral** (4.1GB) - Fast and capable, good for most tasks

### For Coding

- **codellama** (3.8GB) - Specialized for programming tasks
- **qwen2.5-coder:7b** (4.4GB) - Excellent coding capabilities

### For Faster Performance (Smaller Models)

- **phi3** (2.3GB) - Microsoft's efficient model
- **gemma2:2b** (1.6GB) - Google's compact model

## Configuration Options

### Environment Variables

```bash
# Provider selection (required)
AI_PROVIDER=ollama                    # Use Ollama instead of OpenRouter

# Ollama settings
OLLAMA_BASE_URL=http://localhost:11434  # Ollama server URL (default)
OLLAMA_MODEL=llama3.2                   # Default model to use

# Alternative: use MODEL_ID for backward compatibility
MODEL_ID=mistral                        # Can be used instead of OLLAMA_MODEL
```

### Advanced Configuration

```bash
# Custom Ollama server (if running on different host/port)
OLLAMA_BASE_URL=http://192.168.1.100:11434

# Use different models for different purposes
OLLAMA_MODEL=llama3.2                  # Main model
SUB_AGENT_MODEL_ID=codellama           # For file editing tasks
```

## Features with Ollama

All Kalpana features work with Ollama:

✅ **Code Generation & Editing** - Create and modify files with natural language  
✅ **Multi-Runtime Sandbox** - Execute code in Node.js, Bun, Python containers  
✅ **Web Automation** - Browser automation and web scraping  
✅ **File Operations** - Read, write, and analyze files  
✅ **Error Checking** - Multi-language syntax validation  
✅ **Context Management** - Intelligent conversation memory  
✅ **Tool Integration** - All 13+ built-in tools work seamlessly

## Benefits of Using Ollama

### Privacy & Security

- **Local execution**: Your code and conversations never leave your machine
- **No API keys**: No need for cloud service accounts
- **Offline capable**: Work without internet connection

### Cost Efficiency

- **No usage fees**: Run unlimited queries without per-token costs
- **No rate limits**: Process as much as your hardware can handle
- **One-time setup**: Download models once, use forever

### Performance

- **Low latency**: No network round trips
- **Consistent speed**: Performance depends only on your hardware
- **Customizable**: Choose models that fit your speed/quality needs

## Switching Between Providers

You can easily switch between OpenRouter and Ollama:

```bash
# Switch to Ollama
kalpana-config set AI_PROVIDER ollama
kalpana-config set OLLAMA_MODEL llama3.2

# Switch back to OpenRouter
kalpana-config set AI_PROVIDER openrouter
```

## Troubleshooting

### Ollama Not Running

```bash
# Check if Ollama is running
ollama list

# Start Ollama service (if needed)
ollama serve
```

### Model Not Found

```bash
# Pull the model first
ollama pull llama3.2

# Verify it's available
ollama list
```

### Connection Issues

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Verify URL in config
kalpana-config get OLLAMA_BASE_URL
```

### Performance Tips

1. **Use appropriate model sizes**: Smaller models (2-7B parameters) run faster
2. **Sufficient RAM**: Ensure you have enough RAM for the model (usually 4-8GB)
3. **GPU acceleration**: Ollama automatically uses GPU if available (NVIDIA/Apple Silicon)
4. **Model preloading**: Keep models loaded by making periodic requests

## Model Comparison

| Model      | Size  | Best For       | Speed      | Quality    |
| ---------- | ----- | -------------- | ---------- | ---------- |
| phi3       | 2.3GB | Fast responses | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| llama3.2   | 4.1GB | General use    | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐ |
| mistral    | 4.1GB | Balanced       | ⭐⭐⭐⭐   | ⭐⭐⭐⭐   |
| codellama  | 3.8GB | Programming    | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐ |
| qwen2.5:7b | 4.4GB | High quality   | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ |

## Getting Started Example

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model
ollama pull llama3.2

# 3. Configure Kalpana
kalpana-config setup
# Choose: ollama -> http://localhost:11434 -> llama3.2

# 4. Start coding!
kalpana
```

Your first prompt: "Create a simple Express.js API with authentication"

Kalpana will generate the code, set up the environment, install dependencies, and run the server - all using your local Ollama model!

---

**Kalpana + Ollama** = Private, fast, unlimited local AI development assistance.
