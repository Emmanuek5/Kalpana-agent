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
        "Execute a Puppeteer script directly from the host. Can access localhost applications running in containers (ports are mirrored) and external websites. Write complete Puppeteer scripts with browser automation logic.",
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
