import { execInContainer } from "./docker";
import { getActiveSandbox } from "../sandbox";
import fs from "node:fs/promises";
import path from "node:path";

export interface CreateInternalBrowserInput {
  headless?: boolean;
  viewport?: { width: number; height: number };
}

export interface NavigateInput {
  url: string;
  waitFor?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  timeout?: number;
}

export interface ScreenshotInput {
  path?: string;
  fullPage?: boolean;
  quality?: number;
  type?: "png" | "jpeg";
}

export interface ClickInput {
  selector: string;
  timeout?: number;
}

export interface TypeInput {
  selector: string;
  text: string;
  delay?: number;
}

export interface WaitForInput {
  selector?: string;
  timeout?: number;
  visible?: boolean;
}

export interface EvaluateInput {
  script: string;
}

// Track browser sessions
let browserSessionId: string | null = null;

async function ensureNodeAndPuppeteerInstalled() {
  const { containerId, runtime } = getActiveSandbox();

  // Check if Node.js is available
  const nodeCheckResult = await execInContainer({
    containerId,
    cmd: ["which", "node"],
  });

  if (
    !nodeCheckResult.output.includes("/node") &&
    !nodeCheckResult.output.includes("node")
  ) {
    console.log("[browser] Node.js not found, installing...");

    if (runtime === "python") {
      // Install Node.js in Python environment
      const installNodeResult = await execInContainer({
        containerId,
        cmd: [
          "sh",
          "-c",
          "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs",
        ],
        workdir: "/root/workspace",
      });

      if (
        installNodeResult.output.includes("error") ||
        installNodeResult.output.includes("failed")
      ) {
        throw new Error(
          `Failed to install Node.js: ${installNodeResult.output}`
        );
      }
    } else {
      throw new Error(
        "Node.js not available and cannot install in this environment"
      );
    }
  }

  // Check if npm is available
  const npmCheckResult = await execInContainer({
    containerId,
    cmd: ["which", "npm"],
  });

  if (
    !npmCheckResult.output.includes("/npm") &&
    !npmCheckResult.output.includes("npm")
  ) {
    throw new Error("npm not available - Node.js installation may have failed");
  }

  // Check if Puppeteer is already installed
  const checkResult = await execInContainer({
    containerId,
    cmd: [
      "node",
      "-e",
      "try { require('puppeteer'); console.log('installed'); } catch(e) { console.log('not-installed'); }",
    ],
  });

  if (checkResult.output.includes("installed")) {
    return true;
  }

  // Install Puppeteer
  console.log("[browser] Installing Puppeteer...");
  const installResult = await execInContainer({
    containerId,
    cmd: ["npm", "install", "puppeteer"],
    workdir: "/root/workspace",
  });

  if (
    !installResult.output.includes("added") &&
    !installResult.output.includes("up to date")
  ) {
    throw new Error(`Failed to install Puppeteer: ${installResult.output}`);
  }

  return true;
}

async function createBrowserScript() {
  const script = `
const puppeteer = require('puppeteer');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async launch(options = {}) {
    try {
      this.browser = await puppeteer.launch({
        headless: options.headless !== false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
        ],
        ...options
      });
      
      this.page = await this.browser.newPage();
      
      if (options.viewport) {
        await this.page.setViewport(options.viewport);
      }
      
      return { success: true, message: 'Browser launched successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async navigate(url, options = {}) {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      await this.page.goto(url, {
        waitUntil: options.waitFor || 'domcontentloaded',
        timeout: options.timeout || 30000,
      });
      
      const title = await this.page.title();
      const url_final = this.page.url();
      
      return { 
        success: true, 
        title, 
        url: url_final,
        message: \`Navigated to \${title}\`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async screenshot(options = {}) {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      const screenshotPath = options.path || '/root/workspace/screenshot.png';
      
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: options.fullPage || false,
        quality: options.quality,
        type: options.type || 'png',
      });
      
      return { 
        success: true, 
        path: screenshotPath,
        message: \`Screenshot saved to \${screenshotPath}\`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async click(selector, options = {}) {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      await this.page.waitForSelector(selector, { timeout: options.timeout || 5000 });
      await this.page.click(selector);
      
      return { 
        success: true, 
        message: \`Clicked element: \${selector}\`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async type(selector, text, options = {}) {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.type(selector, text, { delay: options.delay || 0 });
      
      return { 
        success: true, 
        message: \`Typed "\${text}" into \${selector}\`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async waitFor(options = {}) {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      if (options.selector) {
        await this.page.waitForSelector(options.selector, {
          timeout: options.timeout || 5000,
          visible: options.visible
        });
        return { 
          success: true, 
          message: \`Element found: \${options.selector}\`
        };
      } else {
        await this.page.waitForTimeout(options.timeout || 1000);
        return { 
          success: true, 
          message: \`Waited \${options.timeout || 1000}ms\`
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async evaluate(script) {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      const result = await this.page.evaluate(script);
      return { 
        success: true, 
        result,
        message: 'Script executed successfully'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getContent() {
    if (!this.page) {
      return { success: false, error: 'Browser not launched' };
    }

    try {
      const content = await this.page.content();
      const title = await this.page.title();
      const url = this.page.url();
      
      return { 
        success: true, 
        content,
        title,
        url,
        length: content.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
      return { success: true, message: 'Browser closed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Handle process communication
const browserManager = new BrowserManager();

process.on('message', async (message) => {
  try {
    const { action, options } = message;
    let result;

    switch (action) {
      case 'launch':
        result = await browserManager.launch(options);
        break;
      case 'navigate':
        result = await browserManager.navigate(options.url, options);
        break;
      case 'screenshot':
        result = await browserManager.screenshot(options);
        break;
      case 'click':
        result = await browserManager.click(options.selector, options);
        break;
      case 'type':
        result = await browserManager.type(options.selector, options.text, options);
        break;
      case 'waitFor':
        result = await browserManager.waitFor(options);
        break;
      case 'evaluate':
        result = await browserManager.evaluate(options.script);
        break;
      case 'getContent':
        result = await browserManager.getContent();
        break;
      case 'close':
        result = await browserManager.close();
        break;
      default:
        result = { success: false, error: \`Unknown action: \${action}\` };
    }

    process.send(result);
  } catch (error) {
    process.send({ success: false, error: error.message });
  }
});

// Keep process alive
process.on('SIGTERM', async () => {
  await browserManager.close();
  process.exit(0);
});
`;

  return script;
}

async function createPythonBrowserScript() {
  const script = `
import sys
import json
import asyncio
from playwright.async_api import async_playwright
import argparse

class BrowserManager:
    def __init__(self):
        self.browser = None
        self.page = None
        self.playwright = None

    async def launch(self, options=None):
        try:
            if options is None:
                options = {}
            
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=options.get('headless', True),
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ]
            )
            
            self.page = await self.browser.new_page()
            
            if 'viewport' in options:
                await self.page.set_viewport_size(
                    width=options['viewport']['width'],
                    height=options['viewport']['height']
                )
            
            return {"success": True, "message": "Browser launched successfully"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def navigate(self, url, options=None):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            if options is None:
                options = {}
                
            wait_until = options.get('waitFor', 'domcontentloaded')
            timeout = options.get('timeout', 30000)
            
            await self.page.goto(url, wait_until=wait_until, timeout=timeout)
            title = await self.page.title()
            final_url = self.page.url
            
            return {
                "success": True,
                "title": title,
                "url": final_url,
                "message": f"Navigated to {title}"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def screenshot(self, options=None):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            if options is None:
                options = {}
                
            screenshot_path = options.get('path', '/root/workspace/screenshot.png')
            full_page = options.get('fullPage', False)
            
            await self.page.screenshot(
                path=screenshot_path,
                full_page=full_page,
                type=options.get('type', 'png'),
                quality=options.get('quality')
            )
            
            return {
                "success": True,
                "path": screenshot_path,
                "message": f"Screenshot saved to {screenshot_path}"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def click(self, selector, options=None):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            if options is None:
                options = {}
                
            timeout = options.get('timeout', 5000)
            await self.page.wait_for_selector(selector, timeout=timeout)
            await self.page.click(selector)
            
            return {
                "success": True,
                "message": f"Clicked element: {selector}"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def type_text(self, selector, text, options=None):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            if options is None:
                options = {}
                
            await self.page.wait_for_selector(selector, timeout=5000)
            delay = options.get('delay', 0)
            if delay > 0:
                await self.page.type(selector, text, delay=delay)
            else:
                await self.page.fill(selector, text)
            
            return {
                "success": True,
                "message": f'Typed "{text}" into {selector}'
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def wait_for(self, options=None):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            if options is None:
                options = {}
                
            if 'selector' in options:
                timeout = options.get('timeout', 5000)
                await self.page.wait_for_selector(options['selector'], timeout=timeout)
                return {
                    "success": True,
                    "message": f"Element found: {options['selector']}"
                }
            else:
                timeout = options.get('timeout', 1000)
                await asyncio.sleep(timeout / 1000)
                return {
                    "success": True,
                    "message": f"Waited {timeout}ms"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def evaluate(self, script):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            result = await self.page.evaluate(script)
            return {
                "success": True,
                "result": result,
                "message": "Script executed successfully"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_content(self):
        if not self.page:
            return {"success": False, "error": "Browser not launched"}
        
        try:
            content = await self.page.content()
            title = await self.page.title()
            url = self.page.url
            
            return {
                "success": True,
                "content": content,
                "title": title,
                "url": url,
                "length": len(content)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def close(self):
        try:
            if self.page:
                await self.page.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            return {"success": True, "message": "Browser closed successfully"}
        except Exception as e:
            return {"success": False, "error": str(e)}

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', help='Browser action to perform')
    parser.add_argument('--options', help='JSON options for the action', default='{}')
    args = parser.parse_args()
    
    options = json.loads(args.options)
    browser_manager = BrowserManager()
    
    try:
        if args.action == 'launch':
            result = await browser_manager.launch(options)
        elif args.action == 'navigate':
            result = await browser_manager.navigate(options['url'], options)
        elif args.action == 'screenshot':
            result = await browser_manager.screenshot(options)
        elif args.action == 'click':
            result = await browser_manager.click(options['selector'], options)
        elif args.action == 'type':
            result = await browser_manager.type_text(options['selector'], options['text'], options)
        elif args.action == 'waitFor':
            result = await browser_manager.wait_for(options)
        elif args.action == 'evaluate':
            result = await browser_manager.evaluate(options['script'])
        elif args.action == 'getContent':
            result = await browser_manager.get_content()
        elif args.action == 'close':
            result = await browser_manager.close()
        else:
            result = {"success": False, "error": f"Unknown action: {args.action}"}
        
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    asyncio.run(main())
`;

  return script;
}

async function ensurePythonBrowserDeps() {
  const { containerId } = getActiveSandbox();

  // Check if playwright is installed
  const checkResult = await execInContainer({
    containerId,
    cmd: ["python", "-c", "import playwright; print('installed')"],
  });

  if (checkResult.output.includes("installed")) {
    return true;
  }

  console.log("[browser] Installing Playwright for Python...");

  // Install playwright
  const installResult = await execInContainer({
    containerId,
    cmd: ["pip", "install", "playwright"],
    workdir: "/root/workspace",
  });

  if (
    installResult.output.includes("error") ||
    installResult.output.includes("failed")
  ) {
    throw new Error(`Failed to install Playwright: ${installResult.output}`);
  }

  // Install browser binaries
  const installBrowsersResult = await execInContainer({
    containerId,
    cmd: ["python", "-m", "playwright", "install", "chromium"],
    workdir: "/root/workspace",
  });

  if (installBrowsersResult.output.includes("error")) {
    throw new Error(
      `Failed to install browser binaries: ${installBrowsersResult.output}`
    );
  }

  return true;
}

async function executeBrowserAction(action: string, options: any = {}) {
  const { containerId, runtime } = getActiveSandbox();

  // Try Node.js/Puppeteer first, fallback to Python/Playwright
  let useNodeJs = false;
  let usePython = false;

  if (runtime === "node") {
    // In Node.js environment, prefer Node.js/Puppeteer
    try {
      await ensureNodeAndPuppeteerInstalled();
      useNodeJs = true;
    } catch (error) {
      console.log(
        "[browser] Node.js approach failed, trying Python/Playwright..."
      );
      try {
        await ensurePythonBrowserDeps();
        usePython = true;
      } catch (pythonError) {
        throw new Error(
          `Both Node.js and Python browser setup failed: ${error} | ${pythonError}`
        );
      }
    }
  } else {
    // In Python environment, prefer Python/Playwright
    try {
      await ensurePythonBrowserDeps();
      usePython = true;
    } catch (error) {
      console.log(
        "[browser] Python approach failed, trying Node.js/Puppeteer..."
      );
      try {
        await ensureNodeAndPuppeteerInstalled();
        useNodeJs = true;
      } catch (nodeError) {
        throw new Error(
          `Both Python and Node.js browser setup failed: ${error} | ${nodeError}`
        );
      }
    }
  }

  if (useNodeJs) {
    return await executeNodeJsBrowser(action, options);
  } else if (usePython) {
    return await executePythonBrowser(action, options);
  } else {
    throw new Error("No suitable browser runtime available");
  }
}

async function executeNodeJsBrowser(action: string, options: any = {}) {
  const { containerId } = getActiveSandbox();

  // Create browser script if it doesn't exist
  const browserScriptPath = "/root/workspace/.browser-manager.js";
  const scriptExists = await execInContainer({
    containerId,
    cmd: ["test", "-f", browserScriptPath],
  });

  if (!scriptExists.output || scriptExists.output.includes("No such file")) {
    const script = await createBrowserScript();
    await execInContainer({
      containerId,
      cmd: ["sh", "-c", `cat > ${browserScriptPath} << 'EOF'\n${script}\nEOF`],
    });
  }

  // Execute browser action
  const command = `node -e "
    const { spawn } = require('child_process');
    const child = spawn('node', ['${browserScriptPath}'], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    
    child.on('message', (result) => {
      console.log(JSON.stringify(result));
      child.kill();
    });
    
    child.on('error', (error) => {
      console.log(JSON.stringify({ success: false, error: error.message }));
    });
    
    child.send({ action: '${action}', options: ${JSON.stringify(options)} });
  "`;

  const result = await execInContainer({
    containerId,
    cmd: ["sh", "-c", command],
    workdir: "/root/workspace",
  });

  try {
    return JSON.parse(result.output.trim());
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse browser response: ${result.output}`,
    };
  }
}

async function executePythonBrowser(action: string, options: any = {}) {
  const { containerId } = getActiveSandbox();

  // Create Python browser script if it doesn't exist
  const browserScriptPath = "/root/workspace/.browser-manager.py";
  const scriptExists = await execInContainer({
    containerId,
    cmd: ["test", "-f", browserScriptPath],
  });

  if (!scriptExists.output || scriptExists.output.includes("No such file")) {
    const script = await createPythonBrowserScript();
    await execInContainer({
      containerId,
      cmd: ["sh", "-c", `cat > ${browserScriptPath} << 'EOF'\n${script}\nEOF`],
    });
  }

  // Execute browser action
  const optionsJson = JSON.stringify(options).replace(/"/g, '\\"');
  const result = await execInContainer({
    containerId,
    cmd: ["python", browserScriptPath, action, "--options", optionsJson],
    workdir: "/root/workspace",
  });

  try {
    return JSON.parse(result.output.trim());
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse Python browser response: ${result.output}`,
    };
  }
}

export async function createInternalBrowser({
  headless = true,
  viewport = { width: 1280, height: 720 },
}: CreateInternalBrowserInput = {}) {
  const result = await executeBrowserAction("launch", { headless, viewport });

  if (result.success) {
    browserSessionId = Date.now().toString();
  }

  return {
    ...result,
    sessionId: browserSessionId,
  };
}

export async function navigate({
  url,
  waitFor = "domcontentloaded",
  timeout = 30000,
}: NavigateInput) {
  return executeBrowserAction("navigate", { url, waitFor, timeout });
}

export async function screenshot({
  path = "screenshot.png",
  fullPage = false,
  quality,
  type = "png",
}: ScreenshotInput = {}) {
  const result = await executeBrowserAction("screenshot", {
    path,
    fullPage,
    quality,
    type,
  });

  if (result.success) {
    // Return the relative path for the agent
    const relativePath = path.startsWith("/root/workspace/")
      ? path.replace("/root/workspace/", "")
      : path;
    result.relativePath = relativePath;
  }

  return result;
}

export async function click({ selector, timeout = 5000 }: ClickInput) {
  return executeBrowserAction("click", { selector, timeout });
}

export async function type({ selector, text, delay = 0 }: TypeInput) {
  return executeBrowserAction("type", { selector, text, delay });
}

export async function waitFor({
  selector,
  timeout = 5000,
  visible,
}: WaitForInput) {
  return executeBrowserAction("waitFor", { selector, timeout, visible });
}

export async function evaluate({ script }: EvaluateInput) {
  return executeBrowserAction("evaluate", { script });
}

export async function getPageContent() {
  return executeBrowserAction("getContent");
}

export async function closeBrowser() {
  const result = await executeBrowserAction("close");
  browserSessionId = null;
  return result;
}

export function getBrowserStatus() {
  return {
    active: browserSessionId !== null,
    sessionId: browserSessionId,
  };
}
