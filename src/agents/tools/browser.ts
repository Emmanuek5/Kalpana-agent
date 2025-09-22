import { z } from "zod";
import { tool, zodSchema } from "ai";
import { runPuppeteerScript } from "../../tools/browser";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildBrowserTools() {
  return {
    "browser.runPuppeteerScript": tool<
      { script: string; timeout?: number },
      { success: boolean; output: string; error?: string }
    >({
      description:
        "Execute a Puppeteer script with browser, page, and puppeteer objects available. Can access localhost applications running in containers (ports are mirrored) and external websites. Use page.goto(), page.type(), page.click(), etc. Browser is automatically launched and closed.",
      inputSchema: zodSchema(
        z.object({
          script: z.string().describe("Complete Puppeteer script to execute"),
          timeout: z.number().optional().describe("Timeout in milliseconds (default: 60000)"),
        })
      ),
      execute: createSafeToolWrapper(
        "browser.runPuppeteerScript",
        runPuppeteerScript as any
      ),
    }),
  } as const;
}
