import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  createInternalBrowser,
  navigate,
  screenshot,
  click,
  type as browserType,
  waitFor,
  evaluate,
  getPageContent,
  closeBrowser,
  getBrowserStatus,
} from "../../tools/browser";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildBrowserTools() {
  return {
    "browser.create": tool<
      { headless?: boolean; viewport?: { width: number; height: number } },
      { success: boolean; message?: string; sessionId?: string; error?: string }
    >({
      description:
        "Create an internal Puppeteer browser instance within the sandbox container. This browser can access localhost applications.",
      inputSchema: zodSchema(
        z.object({
          headless: z.boolean().optional(),
          viewport: z
            .object({ width: z.number(), height: z.number() })
            .optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "browser.create",
        createInternalBrowser as any
      ),
    }),

    "browser.navigate": tool<
      {
        url: string;
        waitFor?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
        timeout?: number;
      },
      {
        success: boolean;
        title?: string;
        url?: string;
        message?: string;
        error?: string;
      }
    >({
      description: "Navigate the internal browser to a URL.",
      inputSchema: zodSchema(
        z.object({
          url: z.string(),
          waitFor: z
            .enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
            .optional(),
          timeout: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper("browser.navigate", navigate as any),
    }),

    "browser.screenshot": tool<
      {
        path?: string;
        fullPage?: boolean;
        quality?: number;
        type?: "png" | "jpeg";
      },
      {
        success: boolean;
        path?: string;
        relativePath?: string;
        message?: string;
        error?: string;
      }
    >({
      description:
        "Take a screenshot of the current page in the internal browser.",
      inputSchema: zodSchema(
        z.object({
          path: z.string().optional(),
          fullPage: z.boolean().optional(),
          quality: z.number().optional(),
          type: z.enum(["png", "jpeg"]).optional(),
        })
      ),
      execute: createSafeToolWrapper("browser.screenshot", screenshot as any),
    }),

    "browser.click": tool<
      { selector: string; timeout?: number },
      { success: boolean; message?: string; error?: string }
    >({
      description: "Click an element in the internal browser by CSS selector.",
      inputSchema: zodSchema(
        z.object({ selector: z.string(), timeout: z.number().optional() })
      ),
      execute: createSafeToolWrapper("browser.click", click as any),
    }),

    "browser.type": tool<
      { selector: string; text: string; delay?: number },
      { success: boolean; message?: string; error?: string }
    >({
      description: "Type text into an element in the internal browser.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string(),
          text: z.string(),
          delay: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper("browser.type", browserType as any),
    }),

    "browser.waitFor": tool<
      { selector?: string; timeout?: number; visible?: boolean },
      { success: boolean; message?: string; error?: string }
    >({
      description:
        "Wait for an element to appear or for a timeout in the internal browser.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().optional(),
          timeout: z.number().optional(),
          visible: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper("browser.waitFor", waitFor as any),
    }),

    "browser.evaluate": tool<
      { script: string },
      { success: boolean; result?: any; message?: string; error?: string }
    >({
      description:
        "Execute JavaScript code in the internal browser page context.",
      inputSchema: zodSchema(z.object({ script: z.string() })),
      execute: createSafeToolWrapper("browser.evaluate", evaluate as any),
    }),

    "browser.getContent": tool<
      {},
      {
        success: boolean;
        content?: string;
        title?: string;
        url?: string;
        length?: number;
        error?: string;
      }
    >({
      description:
        "Get the HTML content of the current page in the internal browser.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper(
        "browser.getContent",
        getPageContent as any
      ),
    }),

    "browser.close": tool<
      {},
      { success: boolean; message?: string; error?: string }
    >({
      description: "Close the internal browser instance.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.close", closeBrowser as any),
    }),

    "browser.status": tool<{}, { active: boolean; sessionId?: string }>({
      description: "Get the status of the internal browser.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.status", getBrowserStatus as any),
    }),
  } as const;
}
