@echo off
echo Building custom AI Container multi-runtime image...

echo.
echo Building multi-runtime image (Node.js + Bun + Python)...
docker build -f Dockerfile.bun -t ai-container:multi-runtime .

echo.
echo Checking image size...
docker images ai-container:multi-runtime

echo.
echo Testing all runtimes...
echo Testing Node.js...
docker run --rm ai-container:multi-runtime node --version
echo Testing npm...
docker run --rm ai-container:multi-runtime npm --version
echo Testing Bun...
docker run --rm ai-container:multi-runtime bun --version
echo Testing Python...
docker run --rm ai-container:multi-runtime python --version
echo Testing pip...
docker run --rm ai-container:multi-runtime pip --version

echo.
echo Multi-runtime image built successfully!
echo You can now use ultra-fast container startup with all runtimes pre-installed:
echo - Node.js 20 with npm
echo - Bun 1.2.22 with TypeScript support
echo - Python 3.11 with common packages
echo - All essential system tools
