// Local Intelligent Web Scraper
// Uses local Puppeteer with AI assistance for smart content extraction

import type { Browser, Page } from "puppeteer";
import { generateObject } from "ai";
import { z } from "zod";
import { getAIProvider } from "../agents/system.js";
import path from "node:path";
import fs from "node:fs/promises";
import { getActiveSandbox } from "../sandbox.js";

// Global browser instance management (reuse from browser.ts pattern)
let globalBrowser: Browser | null = null;
let globalPage: Page | null = null;

async function getBrowserInstance(): Promise<{ browser: Browser; page: Page }> {
  const puppeteer = await import("puppeteer");

  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await puppeteer.default.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security", // Help with some scraping scenarios
        "--disable-features=VizDisplayCompositor",
      ],
    });
  }

  if (!globalPage || globalPage.isClosed()) {
    globalPage = await globalBrowser.newPage();

    // Set realistic user agent
    await globalPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set up error handlers (only once)
    globalPage.on("error", (err) => {
      console.debug("Local scraper page error:", err.message);
    });

    globalPage.on("pageerror", (err) => {
      console.debug("Local scraper page script error:", err.message);
    });

    // Handle request errors silently
    globalPage.on("requestfailed", (req) => {
      console.debug("Request failed (ignored):", req.url());
    });
  }

  return { browser: globalBrowser, page: globalPage };
}

// Schema for AI-powered content analysis
const ContentAnalysisSchema = z.object({
  mainContent: z
    .string()
    .describe("The main textual content of the page, cleaned and formatted"),
  title: z.string().describe("The primary title or heading of the page"),
  summary: z.string().describe("A concise summary of the page content"),
  keyPoints: z
    .array(z.string())
    .describe("Important bullet points or key information"),
  contentType: z
    .enum([
      "article",
      "product",
      "documentation",
      "news",
      "blog",
      "landing",
      "other",
    ])
    .describe("Type of content detected"),
  relevantLinks: z
    .array(
      z.object({
        url: z.string(),
        text: z.string(),
        description: z.string(),
      })
    )
    .describe("Important links found on the page with descriptions"),
  dataPoints: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        type: z.enum(["text", "number", "date", "url", "email"]),
      })
    )
    .describe("Structured data points extracted from the content"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence level in the extraction quality"),
});

type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;

export interface LocalScrapeOptions {
  url: string;
  waitForSelector?: string;
  waitTime?: number;
  extractImages?: boolean;
  extractLinks?: boolean;
  extractMetadata?: boolean;
  useAI?: boolean;
  customPrompt?: string;
  screenshot?: boolean;
  screenshotPath?: string;
  timeout?: number;
  maxScrolls?: number;
  ignoreImages?: boolean;
}

export interface LocalScrapeResult {
  success: boolean;
  url?: string;
  title?: string;
  content?: string;
  aiAnalysis?: ContentAnalysis;
  links?: Array<{ url: string; text: string }>;
  images?: Array<{ src: string; alt?: string }>;
  metadata?: {
    title: string;
    description: string;
    keywords: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    author: string;
    publishDate: string;
  };
  screenshot?: string;
  screenshotPath?: string;
  error?: string;
}

/**
 * Intelligent local web scraper using Puppeteer + AI
 */
export async function localScrape(
  options: LocalScrapeOptions
): Promise<LocalScrapeResult> {
  try {
    const { browser, page } = await getBrowserInstance();

    // Configure page settings with proper request handling
    if (options.ignoreImages !== false) {
      // Remove existing listeners to prevent duplicates
      page.removeAllListeners("request");

      await page.setRequestInterception(true);
      page.on("request", (req) => {
        try {
          // Check if request is already handled
          if (req.isInterceptResolutionHandled()) {
            return;
          }

          if (
            req.resourceType() === "image" ||
            req.resourceType() === "stylesheet"
          ) {
            req.abort().catch(() => {
              // Silently ignore abort errors (request already handled)
            });
          } else {
            req.continue().catch(() => {
              // Silently ignore continue errors (request already handled)
            });
          }
        } catch (error: any) {
          // Silently ignore all request handling errors
          console.debug("Request handling error (ignored):", error.message);
        }
      });
    }

    // Navigate to URL
    console.log(`🌐 Navigating to: ${options.url}`);
    await page.goto(options.url, {
      waitUntil: "networkidle2",
      timeout: options.timeout || 30000,
    });

    // Wait for specific selector if provided
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, {
        timeout: options.timeout || 15000,
      });
    }

    // Additional wait time if specified
    if (options.waitTime) {
      await new Promise((resolve) => setTimeout(resolve, options.waitTime));
    }

    // Smart scrolling to load dynamic content
    const maxScrolls = options.maxScrolls || 3;

    await smartScroll(page, maxScrolls);

    // Extract basic page information
    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        html: document.documentElement.outerHTML,
      };
    });

    // Extract text content
    const textContent = await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll("script, style, noscript");
      scripts.forEach((el) => el.remove());

      // Get text content from body
      return document.body?.innerText || "";
    });

    const result: LocalScrapeResult = {
      success: true,
      url: pageInfo.url,
      title: pageInfo.title,
      content: textContent,
    };

    // Extract metadata if requested
    if (options.extractMetadata) {
      result.metadata = await extractMetadata(page);
    }

    // Extract links if requested
    if (options.extractLinks) {
      result.links = await extractLinks(page);
    }

    // Extract images if requested
    if (options.extractImages) {
      result.images = await extractImages(page);
    }

    // Take screenshot if requested
    if (options.screenshot) {
      const screenshot = await takeScreenshot(page, options.screenshotPath);
      result.screenshot = screenshot.screenshot;
      result.screenshotPath = screenshot.path;
    }

    // AI-powered content analysis if requested
    if (options.useAI !== false) {
      result.aiAnalysis = await analyzeContentWithAI(
        textContent,
        pageInfo.html,
        options.customPrompt
      );
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      error: `Local scrape failed: ${error.message}`,
    };
  }
}

/**
 * Smart scrolling to trigger lazy-loaded content
 */
async function smartScroll(page: Page, maxScrolls: number = 3): Promise<void> {
  try {
    let previousHeight = await page.evaluate(() => document.body.scrollHeight);

    for (let i = 0; i < maxScrolls; i++) {
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      });

      // Wait for potential new content
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Check if new content loaded
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) {
        break; // No new content, stop scrolling
      }
      previousHeight = newHeight;
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error: any) {
    console.debug("Smart scroll error (ignored):", error.message);
  }
}

/**
 * Extract metadata from the page
 */
async function extractMetadata(
  page: Page
): Promise<LocalScrapeResult["metadata"]> {
  return await page.evaluate(() => {
    const getMetaContent = (selector: string): string => {
      const element = document.querySelector(selector);
      return element?.getAttribute("content") || "";
    };

    return {
      title: document.title,
      description: getMetaContent('meta[name="description"]'),
      keywords: getMetaContent('meta[name="keywords"]'),
      ogTitle: getMetaContent('meta[property="og:title"]'),
      ogDescription: getMetaContent('meta[property="og:description"]'),
      ogImage: getMetaContent('meta[property="og:image"]'),
      author: getMetaContent('meta[name="author"]'),
      publishDate:
        getMetaContent('meta[property="article:published_time"]') ||
        getMetaContent('meta[name="date"]'),
    };
  });
}

/**
 * Extract links from the page
 */
async function extractLinks(
  page: Page
): Promise<Array<{ url: string; text: string }>> {
  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    return links
      .map((link) => ({
        url: (link as HTMLAnchorElement).href,
        text: link.textContent?.trim() || "",
      }))
      .filter((link) => link.url && link.text)
      .slice(0, 50); // Limit to first 50 links
  });
}

/**
 * Extract images from the page
 */
async function extractImages(
  page: Page
): Promise<Array<{ src: string; alt?: string }>> {
  return await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll("img[src]"));
    return images
      .map((img) => ({
        src: (img as HTMLImageElement).src,
        alt: (img as HTMLImageElement).alt,
      }))
      .filter((img) => img.src)
      .slice(0, 20); // Limit to first 20 images
  });
}

/**
 * Take screenshot and save to sandbox
 */
async function takeScreenshot(
  page: Page,
  customPath?: string
): Promise<{ screenshot?: string; path?: string }> {
  try {
    const screenshotOptions: any = {
      fullPage: true,
      encoding: "base64",
    };

    if (customPath) {
      const { hostVolumePath, containerVolumePath } = getActiveSandbox();
      const raw = customPath.replace(/\\/g, "/");
      let rel: string;

      if (
        raw === containerVolumePath ||
        raw.startsWith(containerVolumePath + "/")
      ) {
        rel = raw.slice(containerVolumePath.length).replace(/^\/+/, "");
      } else if (path.isAbsolute(customPath)) {
        rel = path.basename(customPath);
      } else {
        rel = customPath;
      }

      const hostPath = path.resolve(hostVolumePath, rel);
      await fs.mkdir(path.dirname(hostPath), { recursive: true });
      screenshotOptions.path = hostPath;
      screenshotOptions.encoding = undefined;

      await page.screenshot(screenshotOptions);
      return { path: customPath };
    } else {
      const screenshot = await page.screenshot(screenshotOptions);
      return { screenshot: screenshot as string };
    }
  } catch (error: any) {
    console.debug("Screenshot error (ignored):", error.message);
    return {};
  }
}

/**
 * AI-powered content analysis
 */
async function analyzeContentWithAI(
  textContent: string,
  htmlContent: string,
  customPrompt?: string
): Promise<ContentAnalysis> {
  try {
    const aiProvider = getAIProvider();
    const aiProviderType = process.env.AI_PROVIDER || "openrouter";

    let modelId: string;
    if (aiProviderType === "ollama") {
      modelId =
        process.env.OLLAMA_MODEL ||
        process.env.SUB_AGENT_MODEL_ID ||
        process.env.MODEL_ID ||
        "llama3.2";
    } else {
      modelId = process.env.SUB_AGENT_MODEL_ID || "openai/gpt-4o-mini";
    }

    const model = aiProvider.languageModel(modelId);

    // Truncate content if too long (keep first 8000 chars)
    const truncatedText =
      textContent.length > 8000
        ? textContent.substring(0, 8000) + "..."
        : textContent;

    const basePrompt =
      customPrompt ||
      `Analyze this web page content and extract structured information.

TEXT CONTENT:
${truncatedText}

Focus on:
1. Identifying the main content and purpose
2. Extracting key information and data points
3. Finding relevant links and their context
4. Determining content type and structure
5. Providing a quality summary

Be thorough but concise in your analysis.`;

    const { object: analysis } = await generateObject({
      model,
      schema: ContentAnalysisSchema,
      prompt: basePrompt,
      system:
        "You are an expert web content analyzer. Extract structured information from web pages accurately and comprehensively.",
    });

    return analysis;
  } catch (error: any) {
    console.debug("AI analysis error (ignored):", error.message);

    // Fallback analysis
    return {
      mainContent: textContent.substring(0, 1000),
      title: "Content extraction failed",
      summary: "AI analysis unavailable - raw content extracted",
      keyPoints: [],
      contentType: "other",
      relevantLinks: [],
      dataPoints: [],
      confidence: 0.1,
    };
  }
}

/**
 * Quick text extraction from URL (simplified version)
 */
export async function quickExtractText(
  url: string,
  timeout: number = 15000
): Promise<{
  success: boolean;
  text?: string;
  title?: string;
  error?: string;
}> {
  try {
    const result = await localScrape({
      url,
      timeout,
      useAI: false,
      extractImages: false,
      extractLinks: false,
      extractMetadata: false,
      ignoreImages: true,
      maxScrolls: 1,
    });

    return {
      success: result.success,
      text: result.content,
      title: result.title,
      error: result.error,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Quick extraction failed: ${error.message}`,
    };
  }
}

/**
 * AI-powered content summarization
 */
export async function summarizeUrl(
  url: string,
  customPrompt?: string
): Promise<{
  success: boolean;
  summary?: string;
  keyPoints?: string[];
  error?: string;
}> {
  try {
    const result = await localScrape({
      url,
      useAI: true,
      customPrompt:
        customPrompt ||
        "Provide a comprehensive summary and key points from this content",
      extractImages: false,
      extractLinks: false,
      ignoreImages: true,
    });

    if (!result.success || !result.aiAnalysis) {
      return {
        success: false,
        error: result.error || "AI analysis failed",
      };
    }

    return {
      success: true,
      summary: result.aiAnalysis.summary,
      keyPoints: result.aiAnalysis.keyPoints,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `URL summarization failed: ${error.message}`,
    };
  }
}

/**
 * Extract structured data from a page
 */
export async function extractStructuredData(
  url: string,
  dataPrompt: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const result = await localScrape({
      url,
      useAI: true,
      customPrompt: `Extract specific structured data as requested: ${dataPrompt}`,
      extractImages: false,
      extractLinks: false,
      ignoreImages: true,
    });

    if (!result.success || !result.aiAnalysis) {
      return {
        success: false,
        error: result.error || "Data extraction failed",
      };
    }

    return {
      success: true,
      data: {
        dataPoints: result.aiAnalysis.dataPoints,
        mainContent: result.aiAnalysis.mainContent,
        relevantLinks: result.aiAnalysis.relevantLinks,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Structured data extraction failed: ${error.message}`,
    };
  }
}

/**
 * Cleanup browser resources
 */
export async function cleanupLocalScraper(): Promise<void> {
  try {
    if (globalPage && !globalPage.isClosed()) {
      await globalPage.close();
      globalPage = null;
    }
    if (globalBrowser && globalBrowser.isConnected()) {
      await globalBrowser.close();
      globalBrowser = null;
    }
  } catch (error: any) {
    console.debug("Local scraper cleanup error (ignored):", error.message);
  }
}
