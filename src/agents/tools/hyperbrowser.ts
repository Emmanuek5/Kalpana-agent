import { z } from "zod";
import { tool, zodSchema } from "ai";
import { 
  createSession, 
  navigate, 
  stopSession, 
  scrapeUrl, 
  scrapeWithSession,
  clickElement,
  typeText,
  takeScreenshot,
  waitForElement,
  getPageInfo,
  evaluateScript,
  scrollTo,
  getText,
  getAttribute,
  selectOption,
  hover,
  pressKey,
  refresh,
  goBack,
  goForward,
  getAllElements,
  navigateAndTakeScreenshot
} from "../../tools/hyperbrowser";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildHyperbrowserTools() {
  return {
    "hbrowser.session.create": tool<
      import("../../tools/hyperbrowser").CreateSessionInput,
      { id: string; wsEndpoint: string }
    >({
      description: "Create a Hyperbrowser session",
      inputSchema: zodSchema(
        z.object({
          profile: z
            .object({
              persistChanges: z.boolean().optional(),
            })
            .optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "hbrowser.session.create",
        createSession as any
      ),
    }),

    "hbrowser.session.stop": tool<{ sessionId: string }, { ok: true }>({
      description: "Stop a Hyperbrowser session",
      inputSchema: zodSchema(z.object({ sessionId: z.string() })),
      execute: createSafeToolWrapper("hbrowser.session.stop", async (args) => ({
        ok: (await stopSession(args.sessionId)).ok as true,
      })),
    }),

    "hbrowser.navigate": tool<
      import("../../tools/hyperbrowser").NavigateInput,
      { title: string; html: string }
    >({
      description:
        "Navigate a page within a Hyperbrowser session and return HTML",
      inputSchema: zodSchema(
        z.object({ sessionId: z.string(), url: z.string().url() })
      ),
      execute: createSafeToolWrapper("hbrowser.navigate", navigate as any),
    }),

    "hbrowser.scrape": tool<
      { 
        url: string; 
        extractText?: boolean; 
        extractLinks?: boolean; 
        extractImages?: boolean; 
        extractMetadata?: boolean; 
        waitForSelector?: string; 
        timeout?: number; 
      },
      { 
        success: boolean; 
        data?: any; 
        text?: string;
        links?: string[];
        images?: string[];
        metadata?: any;
        error?: string;
      }
    >({
      description: "Scrape content from a URL using HyperBrowser's intelligent extraction. Automatically handles captchas and ad blocking.",
      inputSchema: zodSchema(
        z.object({
          url: z.string().url().describe("URL to scrape content from"),
          extractText: z.boolean().optional().describe("Extract text content (default: true)"),
          extractLinks: z.boolean().optional().describe("Extract all links from the page"),
          extractImages: z.boolean().optional().describe("Extract all image URLs from the page"),
          extractMetadata: z.boolean().optional().describe("Extract page metadata (title, description, etc.)"),
          waitForSelector: z.string().optional().describe("CSS selector to wait for before scraping"),
          timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.scrape", scrapeUrl as any),
    }),

    "hbrowser.scrapeWithSession": tool<
      { 
        sessionId: string; 
        url?: string; 
        extractText?: boolean; 
        extractLinks?: boolean; 
        extractImages?: boolean; 
        extractMetadata?: boolean; 
        selector?: string; 
      },
      { 
        success: boolean; 
        data?: any; 
        text?: string;
        links?: string[];
        images?: string[];
        metadata?: any;
        error?: string;
      }
    >({
      description: "Scrape content from the current page or navigate to a new URL within an existing HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          url: z.string().url().optional().describe("Optional URL to navigate to before scraping"),
          extractText: z.boolean().optional().describe("Extract text content (default: true)"),
          extractLinks: z.boolean().optional().describe("Extract all links from the page"),
          extractImages: z.boolean().optional().describe("Extract all image URLs from the page"),
          extractMetadata: z.boolean().optional().describe("Extract page metadata (title, description, Open Graph data)"),
          selector: z.string().optional().describe("CSS selector to extract text from specific element"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.scrapeWithSession", scrapeWithSession as any),
    }),

    "hbrowser.click": tool<
      { sessionId: string; selector: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Click on an element in a HyperBrowser session using CSS selector.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the element to click"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before clicking (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.click", clickElement as any),
    }),

    "hbrowser.type": tool<
      { sessionId: string; selector: string; text: string; clear?: boolean; delay?: number; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Type text into an input field in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the input element"),
          text: z.string().describe("Text to type into the field"),
          clear: z.boolean().optional().describe("Clear existing text before typing (default: false)"),
          delay: z.number().optional().describe("Delay between keystrokes in milliseconds (default: 0)"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before typing (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.type", typeText as any),
    }),

    "hbrowser.screenshot": tool<
      { sessionId: string; path?: string; fullPage?: boolean; quality?: number },
      { success: boolean; screenshot?: string; path?: string; error?: string }
    >({
      description: "Take a screenshot of the current page in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          path: z.string().optional().describe("File path to save screenshot. If not provided, returns base64 data"),
          fullPage: z.boolean().optional().describe("Capture full page including scrolled content (default: false)"),
          quality: z.number().min(0).max(100).optional().describe("JPEG quality 0-100 (only for .jpg files)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.screenshot", takeScreenshot as any),
    }),

    "hbrowser.waitForElement": tool<
      { sessionId: string; selector: string; timeout?: number; visible?: boolean },
      { success: boolean; error?: string }
    >({
      description: "Wait for an element to appear in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the element to wait for"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
          visible: z.boolean().optional().describe("Wait for element to be visible, not just present in DOM"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.waitForElement", waitForElement as any),
    }),

    "hbrowser.getPageInfo": tool<
      { sessionId: string },
      { success: boolean; title?: string; url?: string; error?: string }
    >({
      description: "Get information about the current page in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.getPageInfo", getPageInfo as any),
    }),

    "hbrowser.evaluateScript": tool<
      { sessionId: string; script: string; timeout?: number },
      { success: boolean; result?: any; error?: string }
    >({
      description: "Execute JavaScript code in a HyperBrowser session page context.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          script: z.string().describe("JavaScript code to execute in the page context"),
          timeout: z.number().optional().describe("Script timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.evaluateScript", evaluateScript as any),
    }),

    "hbrowser.scrollTo": tool<
      { sessionId: string; x?: number; y?: number; selector?: string; behavior?: string },
      { success: boolean; error?: string }
    >({
      description: "Scroll to specific coordinates or element in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          x: z.number().optional().describe("X coordinate to scroll to"),
          y: z.number().optional().describe("Y coordinate to scroll to"),
          selector: z.string().optional().describe("CSS selector of element to scroll to"),
          behavior: z.enum(['auto', 'smooth']).optional().describe("Scroll behavior (default: smooth)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.scrollTo", scrollTo as any),
    }),

    "hbrowser.getText": tool<
      { sessionId: string; selector: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; text?: string; error?: string }
    >({
      description: "Get text content from an element in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the element to get text from"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before getting text (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.getText", getText as any),
    }),

    "hbrowser.getAttribute": tool<
      { sessionId: string; selector: string; attribute: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; value?: string; error?: string }
    >({
      description: "Get attribute value from an element in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the element"),
          attribute: z.string().describe("Attribute name to get value from (e.g., 'href', 'src', 'class')"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before getting attribute (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.getAttribute", getAttribute as any),
    }),

    "hbrowser.selectOption": tool<
      { sessionId: string; selector: string; value?: string; text?: string; index?: number; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Select an option from a dropdown/select element in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the select element"),
          value: z.string().optional().describe("Option value to select"),
          text: z.string().optional().describe("Option text to select"),
          index: z.number().optional().describe("Option index to select (0-based)"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before selecting (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.selectOption", selectOption as any),
    }),

    "hbrowser.hover": tool<
      { sessionId: string; selector: string; waitForSelector?: boolean; timeout?: number },
      { success: boolean; error?: string }
    >({
      description: "Hover over an element in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for the element to hover over"),
          waitForSelector: z.boolean().optional().describe("Wait for element to appear before hovering (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.hover", hover as any),
    }),

    "hbrowser.pressKey": tool<
      { sessionId: string; key: string; selector?: string; modifiers?: string[] },
      { success: boolean; error?: string }
    >({
      description: "Press a key or key combination in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')"),
          selector: z.string().optional().describe("CSS selector to focus before pressing key"),
          modifiers: z.array(z.string()).optional().describe("Modifier keys to hold (e.g., ['Control', 'Shift'])"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.pressKey", pressKey as any),
    }),

    "hbrowser.refresh": tool<
      { sessionId: string },
      { success: boolean; error?: string }
    >({
      description: "Refresh the current page in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.refresh", refresh as any),
    }),

    "hbrowser.goBack": tool<
      { sessionId: string },
      { success: boolean; error?: string }
    >({
      description: "Navigate back in browser history in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.goBack", goBack as any),
    }),

    "hbrowser.goForward": tool<
      { sessionId: string },
      { success: boolean; error?: string }
    >({
      description: "Navigate forward in browser history in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.goForward", goForward as any),
    }),

    "hbrowser.getAllElements": tool<
      { sessionId: string; selector: string; attribute?: string; getText?: boolean; waitForSelector?: boolean; timeout?: number },
      { success: boolean; elements?: any[]; error?: string }
    >({
      description: "Get information about all elements matching a CSS selector in a HyperBrowser session.",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          selector: z.string().describe("CSS selector for elements to find"),
          attribute: z.string().optional().describe("Attribute to extract from each element"),
          getText: z.boolean().optional().describe("Whether to extract text content from each element"),
          waitForSelector: z.boolean().optional().describe("Wait for at least one element to appear (default: true)"),
          timeout: z.number().optional().describe("Wait timeout in milliseconds (default: 10000)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.getAllElements", getAllElements as any),
    }),

    "hbrowser.navigateAndTakeScreenshot": tool<
      { sessionId: string; url: string; path?: string; fullPage?: boolean; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'; timeout?: number; scrollWaitMs?: number },
      { success: boolean; title?: string; url?: string; screenshot?: string; path?: string; error?: string }
    >({
      description: "Navigate within a HyperBrowser session, scroll to bottom to load dynamic content, then capture a screenshot (saved to sandbox if path is provided).",
      inputSchema: zodSchema(
        z.object({
          sessionId: z.string().describe("HyperBrowser session ID"),
          url: z.string().url().describe("URL to navigate to"),
          path: z.string().optional().describe("File path to save screenshot (e.g., '/root/workspace/screenshot.png' or 'shots/page.png')"),
          fullPage: z.boolean().optional().describe("Capture full page including scrolled content (default: true)"),
          waitUntil: z.enum(['load','domcontentloaded','networkidle0','networkidle2']).optional().describe("Navigation completion event (default: networkidle2)"),
          timeout: z.number().optional().describe("Navigation timeout in milliseconds (default: 30000)"),
          scrollWaitMs: z.number().optional().describe("Delay between scroll steps in ms (default: 800)"),
        })
      ),
      execute: createSafeToolWrapper("hbrowser.navigateAndTakeScreenshot", navigateAndTakeScreenshot as any),
    }),
  } as const;
}

