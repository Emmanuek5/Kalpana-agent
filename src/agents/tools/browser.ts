import { z } from "zod";
import { tool, zodSchema } from "ai";
import { 
  goToPage, 
  clickElement, 
  typeText, 
  takeScreenshot, 
  waitForElement, 
  getPageInfo, 
  evaluateScript,
  closeBrowser,
  scrollTo,
  getText,
  getAttribute,
  selectOption,
  hover,
  pressKey,
  refresh,
  goBack,
  goForward,
  getAllElements
} from "../../tools/browser";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildBrowserTools() {
  return {
    "browser.goToPage": tool<
      { url: string; waitUntil?: string; timeout?: number },
      { success: boolean; title?: string; url?: string; error?: string }
    >({
      description: "Navigate to a web page. Can access localhost applications and external websites.",
      inputSchema: zodSchema(
        z.object({
          url: z.string().describe("URL to navigate to (e.g., 'http://localhost:3000' or 'https://example.com')"),
          waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional().describe("When to consider navigation complete (default: networkidle2)"),
          timeout: z.number().optional().describe("Navigation timeout in milliseconds (default: 30000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.goToPage", goToPage as any),
    }),

    "browser.click": tool<
      { selector: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Click on an element using CSS selector.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the element to click (e.g., 'button', '#submit', '.btn-primary')"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before clicking (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.click", clickElement as any),
    }),

    "browser.type": tool<
      { selector: string; text: string; clear?: boolean; delay?: number; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Type text into an input field using CSS selector.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the input element (e.g., 'input[type=\"text\"]', '#username', '.search-box')"),
          text: z.string().describe("Text to type into the field"),
          clear: z.boolean().optional().describe("Clear existing text before typing (default: false)"),
          delay: z.number().optional().describe("Delay between keystrokes in milliseconds (default: 0)"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before typing (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.type", typeText as any),
    }),

    "browser.screenshot": tool<
      { path?: string; fullPage?: boolean; quality?: number },
      { success: boolean; screenshot?: string; path?: string; error?: string }
    >({
      description: "Take a screenshot of the current page. Returns base64 image data or saves to file.",
      inputSchema: zodSchema(
        z.object({
          path: z.string().optional().describe("File path to save screenshot (e.g., '/root/workspace/screenshot.png'). If not provided, returns base64 data"),
          fullPage: z.boolean().optional().describe("Capture full page including scrolled content (default: false)"),
          quality: z.number().min(0).max(100).optional().describe("JPEG quality 0-100 (only for .jpg files)"),
        })
      ),
      execute: createSafeToolWrapper("browser.screenshot", takeScreenshot as any),
    }),

    "browser.waitForElement": tool<
      { selector: string; timeout?: number; visible?: boolean },
      { success: boolean; error?: string }
    >({
      description: "Wait for an element to appear on the page.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the element to wait for"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
          visible: z.boolean().optional().describe("Wait for element to be visible, not just present in DOM"),
        })
      ),
      execute: createSafeToolWrapper("browser.waitForElement", waitForElement as any),
    }),

    "browser.getPageInfo": tool<
      {},
      { success: boolean; title?: string; url?: string; error?: string }
    >({
      description: "Get information about the current page (title and URL).",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.getPageInfo", getPageInfo as any),
    }),

    "browser.evaluateScript": tool<
      { script: string; timeout?: number },
      { success: boolean; result?: any; error?: string }
    >({
      description: "Execute JavaScript code in the browser page context. Use for complex DOM interactions or data extraction.",
      inputSchema: zodSchema(
        z.object({
          script: z.string().describe("JavaScript code to execute in the page context"),
          timeout: z.number().optional().describe("Script timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.evaluateScript", evaluateScript as any),
    }),

    "browser.close": tool<
      {},
      { success: boolean; error?: string }
    >({
      description: "Close the browser instance to free resources.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.close", closeBrowser as any),
    }),

    "browser.scrollTo": tool<
      { x?: number; y?: number; selector?: string; behavior?: string },
      { success: boolean; error?: string }
    >({
      description: "Scroll to specific coordinates or element on the page.",
      inputSchema: zodSchema(
        z.object({
          x: z.number().optional().describe("X coordinate to scroll to"),
          y: z.number().optional().describe("Y coordinate to scroll to"),
          selector: z.string().optional().describe("CSS selector of element to scroll to"),
          behavior: z.enum(['auto', 'smooth']).optional().describe("Scroll behavior (default: smooth)"),
        })
      ),
      execute: createSafeToolWrapper("browser.scrollTo", scrollTo as any),
    }),

    "browser.getText": tool<
      { selector: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; text?: string; error?: string }
    >({
      description: "Get text content from an element using CSS selector.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the element to get text from"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before getting text (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.getText", getText as any),
    }),

    "browser.getAttribute": tool<
      { selector: string; attribute: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; value?: string; error?: string }
    >({
      description: "Get attribute value from an element using CSS selector.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the element"),
          attribute: z.string().describe("Attribute name to get value from (e.g., 'href', 'src', 'class')"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before getting attribute (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.getAttribute", getAttribute as any),
    }),

    "browser.selectOption": tool<
      { selector: string; value?: string; text?: string; index?: number; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Select an option from a dropdown/select element.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the select element"),
          value: z.string().optional().describe("Option value to select"),
          text: z.string().optional().describe("Option text to select"),
          index: z.number().optional().describe("Option index to select (0-based)"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before selecting (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.selectOption", selectOption as any),
    }),

    "browser.hover": tool<
      { selector: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Hover over an element using CSS selector.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for the element to hover over"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before hovering (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.hover", hover as any),
    }),

    "browser.pressKey": tool<
      { key: string; selector?: string; modifiers?: string[] },
      { success: boolean; error?: string }
    >({
      description: "Press a key or key combination. Can focus on specific element first.",
      inputSchema: zodSchema(
        z.object({
          key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')"),
          selector: z.string().optional().describe("CSS selector to focus before pressing key"),
          modifiers: z.array(z.string()).optional().describe("Modifier keys to hold (e.g., ['Control', 'Shift'])"),
        })
      ),
      execute: createSafeToolWrapper("browser.pressKey", pressKey as any),
    }),

    "browser.refresh": tool<
      {},
      { success: boolean; error?: string }
    >({
      description: "Refresh the current page.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.refresh", refresh as any),
    }),

    "browser.goBack": tool<
      {},
      { success: boolean; error?: string }
    >({
      description: "Navigate back in browser history.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.goBack", goBack as any),
    }),

    "browser.goForward": tool<
      {},
      { success: boolean; error?: string }
    >({
      description: "Navigate forward in browser history.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("browser.goForward", goForward as any),
    }),

    "browser.getAllElements": tool<
      { selector: string; attribute?: string; getText?: boolean; waitForSelector?: boolean; timeout?: number },
      { success: boolean; elements?: any[]; error?: string }
    >({
      description: "Get information about all elements matching a CSS selector.",
      inputSchema: zodSchema(
        z.object({
          selector: z.string().describe("CSS selector for elements to find"),
          attribute: z.string().optional().describe("Attribute to extract from each element"),
          getText: z.boolean().optional().describe("Whether to extract text content from each element"),
          waitForSelector: z.boolean().optional().describe("Wait for at least one element to appear (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("browser.getAllElements", getAllElements as any),
    }),
  } as const;
}
