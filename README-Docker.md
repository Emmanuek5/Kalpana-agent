# AI Container - Custom Docker Image

## Overview

This project uses a custom Docker image that includes all three supported runtimes pre-installed to dramatically reduce container startup times.

## Multi-Runtime Image Contents

The `ai-container:multi-runtime` image includes:

### Runtimes
- **Node.js 20** - Latest LTS version with npm
- **Bun 1.2.22** - Modern JavaScript runtime with TypeScript support
- **Python 3.11** - Latest Python with pip and common packages

### Pre-installed Python Packages
- requests, numpy, pandas, matplotlib
- jupyter, flask, fastapi, uvicorn
- pytest, black, flake8, mypy

### System Tools
- curl, wget, git
- net-tools, procps, iproute2
- vim, nano, htop, tree, jq
- Build tools (gcc, make, etc.)

## Building the Image

### Prerequisites
- Docker installed and running
- At least 2GB free disk space

### Build Command
```bash
# Run the build script
build-images.bat

# Or manually:
docker build -f Dockerfile.bun -t ai-container:multi-runtime .
```

### Build Time
- Initial build: ~5-10 minutes (downloads and installs everything)
- Subsequent builds: ~1-2 minutes (uses Docker layer caching)

## Benefits

### Before (Dynamic Installation)
- Container startup: 30-60 seconds
- Installing Node.js, Bun, Python on every launch
- Network-dependent (downloads packages each time)
- Inconsistent due to package version changes

### After (Pre-built Image)
- Container startup: 1-3 seconds
- Everything pre-installed and ready
- Offline-capable (no downloads needed)
- Consistent environment across all launches

## Usage

The AI Container system automatically uses the custom image when you:

1. Launch a Bun sandbox: `sandbox.launch({ runtime: "bun" })`
2. Launch a Node.js sandbox: `sandbox.launch({ runtime: "node" })`
3. Launch a Python sandbox: `sandbox.launch({ runtime: "python" })`

All three runtime types now use the same multi-runtime image, so switching between them is instant.

## Verification

After building, you can test the image:

```bash
# Test all runtimes
docker run --rm ai-container:multi-runtime node --version
docker run --rm ai-container:multi-runtime bun --version  
docker run --rm ai-container:multi-runtime python --version

# Test interactive shell
docker run -it --rm ai-container:multi-runtime /bin/bash
```

## Image Size

The multi-runtime image is approximately 1.5-2GB, which includes:
- Ubuntu 22.04 base (~200MB)
- Node.js 20 (~150MB)
- Bun (~100MB)
- Python 3.11 + packages (~800MB)
- System tools (~200MB)

This is a reasonable trade-off for the dramatic performance improvement.

## Troubleshooting

### Image Not Found Error
If you get "image not found" errors, make sure to build the image first:
```bash
build-images.bat
```

### Build Failures
- Ensure Docker has internet access for downloads
- Check available disk space (need ~3GB during build)
- Try building again (network issues can cause temporary failures)

### Runtime Issues
- Verify all tools are available: `docker run --rm ai-container:multi-runtime which node bun python`
- Check versions match expected: `docker run --rm ai-container:multi-runtime node --version`

## Updating the Image

To update the image with new versions or packages:

1. Edit `Dockerfile.bun` with your changes
2. Run `build-images.bat` to rebuild
3. The new image will be used on next container launch

## Development

The image is designed to be:
- **Fast**: Everything pre-installed for instant startup
- **Complete**: All three runtimes with common packages
- **Consistent**: Same environment every time
- **Offline-capable**: No network dependencies after build
