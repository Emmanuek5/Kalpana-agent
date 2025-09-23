import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  localScrape,
  quickExtractText,
  summarizeUrl,
  extractStructuredData,
  cleanupLocalScraper,
  type LocalScrapeOptions,
} from "../../tools/local-scraper.js";

export function buildLocalScraperTools() {
  return {
    "localScraper.scrape": tool<LocalScrapeOptions, string>({
      description: `Intelligent local web scraping using Puppeteer + AI. Perfect for:
- Content extraction and analysis
- Product information gathering
- Article/blog content extraction
- Documentation scraping
- Data collection from web pages
- Free alternative to paid scraping services

Features:
- AI-powered content analysis and summarization
- Smart scrolling for dynamic content
- Metadata and link extraction
- Screenshot capabilities
- No external API costs`,
      inputSchema: zodSchema<LocalScrapeOptions>(
        z.object({
          url: z.string().describe("URL to scrape"),
          waitForSelector: z
            .string()
            .optional()
            .describe("CSS selector to wait for before extracting"),
          waitTime: z
            .number()
            .optional()
            .describe("Additional wait time in milliseconds"),
          extractImages: z
            .boolean()
            .optional()
            .describe("Extract images from the page"),
          extractLinks: z
            .boolean()
            .optional()
            .describe("Extract links from the page"),
          extractMetadata: z
            .boolean()
            .optional()
            .describe("Extract page metadata (title, description, etc.)"),
          useAI: z
            .boolean()
            .optional()
            .describe(
              "Use AI for intelligent content analysis (default: true)"
            ),
          customPrompt: z
            .string()
            .optional()
            .describe("Custom prompt for AI analysis"),
          screenshot: z
            .boolean()
            .optional()
            .describe("Take a screenshot of the page"),
          screenshotPath: z
            .string()
            .optional()
            .describe("Path to save screenshot (in sandbox)"),
          timeout: z
            .number()
            .optional()
            .describe("Timeout in milliseconds (default: 30000)"),
          maxScrolls: z
            .number()
            .optional()
            .describe(
              "Maximum number of scrolls for dynamic content (default: 3)"
            ),
          ignoreImages: z
            .boolean()
            .optional()
            .describe(
              "Block image loading for faster scraping (default: true)"
            ),
        })
      ),
      execute: async (args) => {
        try {
          const options: LocalScrapeOptions = {
            url: args.url,
            waitForSelector: args.waitForSelector,
            waitTime: args.waitTime,
            extractImages: args.extractImages,
            extractLinks: args.extractLinks,
            extractMetadata: args.extractMetadata,
            useAI: args.useAI,
            customPrompt: args.customPrompt,
            screenshot: args.screenshot,
            screenshotPath: args.screenshotPath,
            timeout: args.timeout,
            maxScrolls: args.maxScrolls,
            ignoreImages: args.ignoreImages,
          };

          const result = await localScrape(options);

          if (!result.success) {
            return `❌ Scraping failed: ${result.error}`;
          }

          let response = `✅ Successfully scraped: ${result.url}\n\n`;

          if (result.title) {
            response += `📄 **Title**: ${result.title}\n\n`;
          }

          if (result.aiAnalysis) {
            response += `🤖 **AI Analysis**:\n`;
            response += `- **Content Type**: ${result.aiAnalysis.contentType}\n`;
            response += `- **Summary**: ${result.aiAnalysis.summary}\n`;
            response += `- **Confidence**: ${(
              result.aiAnalysis.confidence * 100
            ).toFixed(1)}%\n\n`;

            if (result.aiAnalysis.keyPoints.length > 0) {
              response += `🔑 **Key Points**:\n`;
              result.aiAnalysis.keyPoints.forEach((point) => {
                response += `• ${point}\n`;
              });
              response += "\n";
            }

            if (result.aiAnalysis.dataPoints.length > 0) {
              response += `📊 **Structured Data**:\n`;
              result.aiAnalysis.dataPoints.slice(0, 10).forEach((dp) => {
                response += `• **${dp.label}**: ${dp.value} (${dp.type})\n`;
              });
              response += "\n";
            }

            if (result.aiAnalysis.relevantLinks.length > 0) {
              response += `🔗 **Relevant Links**:\n`;
              result.aiAnalysis.relevantLinks.slice(0, 5).forEach((link) => {
                response += `• [${link.text}](${link.url}) - ${link.description}\n`;
              });
              response += "\n";
            }
          }

          if (
            result.content &&
            (!result.aiAnalysis || result.aiAnalysis.confidence < 0.7)
          ) {
            const preview =
              result.content.length > 500
                ? result.content.substring(0, 500) + "..."
                : result.content;
            response += `📝 **Raw Content Preview**:\n${preview}\n\n`;
          }

          if (result.links && result.links.length > 0) {
            response += `🔗 **All Links** (${result.links.length}):\n`;
            result.links.slice(0, 10).forEach((link) => {
              response += `• [${link.text}](${link.url})\n`;
            });
            if (result.links.length > 10) {
              response += `... and ${result.links.length - 10} more links\n`;
            }
            response += "\n";
          }

          if (result.images && result.images.length > 0) {
            response += `🖼️ **Images** (${result.images.length}):\n`;
            result.images.slice(0, 5).forEach((img, i) => {
              response += `${i + 1}. ${img.src}${
                img.alt ? ` (${img.alt})` : ""
              }\n`;
            });
            if (result.images.length > 5) {
              response += `... and ${result.images.length - 5} more images\n`;
            }
            response += "\n";
          }

          if (result.metadata) {
            response += `📋 **Metadata**:\n`;
            if (result.metadata.description)
              response += `• Description: ${result.metadata.description}\n`;
            if (result.metadata.author)
              response += `• Author: ${result.metadata.author}\n`;
            if (result.metadata.publishDate)
              response += `• Published: ${result.metadata.publishDate}\n`;
            if (result.metadata.keywords)
              response += `• Keywords: ${result.metadata.keywords}\n`;
            response += "\n";
          }

          if (result.screenshot || result.screenshotPath) {
            response += `📸 **Screenshot**: ${
              result.screenshotPath || "Captured (base64)"
            }\n\n`;
          }

          return response;
        } catch (error: any) {
          return `❌ Local scraper error: ${error.message}`;
        }
      },
    }),

    "localScraper.quickText": tool<{ url: string; timeout?: number }, string>({
      description: `Quick text extraction from a URL using local Puppeteer. Fast and efficient for simple content extraction without AI analysis. Perfect for:
- Quick content preview
- Simple text extraction
- Fast page content retrieval
- Lightweight scraping tasks`,
      inputSchema: zodSchema<{ url: string; timeout?: number }>(
        z.object({
          url: z.string().describe("URL to extract text from"),
          timeout: z
            .number()
            .optional()
            .describe("Timeout in milliseconds (default: 15000)"),
        })
      ),
      execute: async (args) => {
        try {
          const result = await quickExtractText(args.url, args.timeout);

          if (!result.success) {
            return `❌ Quick text extraction failed: ${result.error}`;
          }

          let response = `✅ Text extracted from: ${args.url}\n\n`;

          if (result.title) {
            response += `📄 **Title**: ${result.title}\n\n`;
          }

          if (result.text) {
            const preview =
              result.text.length > 2000
                ? result.text.substring(0, 2000) + "..."
                : result.text;
            response += `📝 **Content**:\n${preview}\n`;
          }

          return response;
        } catch (error: any) {
          return `❌ Quick text extraction error: ${error.message}`;
        }
      },
    }),

    "localScraper.summarize": tool<
      { url: string; customPrompt?: string },
      string
    >({
      description: `AI-powered content summarization from any URL using local Puppeteer + AI. Provides intelligent summaries and key points extraction. Perfect for:
- Article summarization
- Content analysis
- Key information extraction
- Research assistance
- Content overview generation`,
      inputSchema: zodSchema<{ url: string; customPrompt?: string }>(
        z.object({
          url: z.string().describe("URL to summarize"),
          customPrompt: z
            .string()
            .optional()
            .describe("Custom prompt for AI summarization"),
        })
      ),
      execute: async (args) => {
        try {
          const result = await summarizeUrl(args.url, args.customPrompt);

          if (!result.success) {
            return `❌ URL summarization failed: ${result.error}`;
          }

          let response = `✅ AI Summary for: ${args.url}\n\n`;

          if (result.summary) {
            response += `📝 **Summary**:\n${result.summary}\n\n`;
          }

          if (result.keyPoints && result.keyPoints.length > 0) {
            response += `🔑 **Key Points**:\n`;
            result.keyPoints.forEach((point) => {
              response += `• ${point}\n`;
            });
          }

          return response;
        } catch (error: any) {
          return `❌ URL summarization error: ${error.message}`;
        }
      },
    }),

    "localScraper.extractData": tool<
      { url: string; dataPrompt: string },
      string
    >({
      description: `Extract specific structured data from web pages using AI analysis. Specify what data you want to extract and the AI will find and structure it. Perfect for:
- Product information extraction
- Contact details retrieval
- Pricing information gathering
- Specification extraction
- Custom data collection`,
      inputSchema: zodSchema<{ url: string; dataPrompt: string }>(
        z.object({
          url: z.string().describe("URL to extract data from"),
          dataPrompt: z
            .string()
            .describe(
              "Describe what specific data you want to extract (e.g., 'product prices and specifications', 'contact information', 'article metadata')"
            ),
        })
      ),
      execute: async (args) => {
        try {
          const result = await extractStructuredData(args.url, args.dataPrompt);

          if (!result.success) {
            return `❌ Data extraction failed: ${result.error}`;
          }

          let response = `✅ Structured data extracted from: ${args.url}\n`;
          response += `🎯 **Search criteria**: ${args.dataPrompt}\n\n`;

          if (result.data?.dataPoints && result.data.dataPoints.length > 0) {
            response += `📊 **Extracted Data Points**:\n`;
            result.data.dataPoints.forEach((dp: any) => {
              response += `• **${dp.label}**: ${dp.value} (${dp.type})\n`;
            });
            response += "\n";
          }

          if (
            result.data?.relevantLinks &&
            result.data.relevantLinks.length > 0
          ) {
            response += `🔗 **Relevant Links**:\n`;
            result.data.relevantLinks.forEach((link: any) => {
              response += `• [${link.text}](${link.url}) - ${link.description}\n`;
            });
            response += "\n";
          }

          if (result.data?.mainContent) {
            const preview =
              result.data.mainContent.length > 1000
                ? result.data.mainContent.substring(0, 1000) + "..."
                : result.data.mainContent;
            response += `📝 **Content Context**:\n${preview}\n`;
          }

          return response;
        } catch (error: any) {
          return `❌ Data extraction error: ${error.message}`;
        }
      },
    }),

    "localScraper.cleanup": tool<{}, string>({
      description: `Clean up local scraper browser resources. Use this to free up memory and close browser instances when done with scraping tasks.`,
      inputSchema: zodSchema<{}>(z.object({})),
      execute: async () => {
        try {
          await cleanupLocalScraper();
          return `✅ Local scraper resources cleaned up successfully`;
        } catch (error: any) {
          return `⚠️ Cleanup warning: ${error.message}`;
        }
      },
    }),
  };
}
