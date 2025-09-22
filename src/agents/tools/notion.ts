import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  isNotionLinked,
  linkNotionAccount,
  unlinkNotionAccount,
  createNotionPage,
  createNotionDatabase,
  queryNotionDatabase,
  updateNotionPage,
  getNotionPage,
  getNotionDatabase,
  searchNotion,
  addBlocksToPage,
} from "../../tools/notion";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildNotionTools() {
  return {
    "notion.isLinked": tool<{}, { isLinked: boolean; hasToken: boolean }>({
      description: "Check if Notion account is linked to the AI agent",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("notion.isLinked", async () => isNotionLinked()),
    }),

    "notion.linkAccount": tool<
      { token: string },
      { success: boolean; message?: string; error?: string }
    >({
      description:
        "Link a Notion account using an integration token. Get your token from https://www.notion.so/my-integrations",
      inputSchema: zodSchema(
        z.object({
          token: z.string().describe("Notion integration token (starts with 'ntn_')"),
        })
      ),
      execute: createSafeToolWrapper(
        "notion.linkAccount",
        async ({ token }: { token: string }) => linkNotionAccount(token)
      ),
    }),

    "notion.unlinkAccount": tool<{}, { success: boolean; message?: string }>({
      description: "Unlink the connected Notion account",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("notion.unlinkAccount", async () => unlinkNotionAccount()),
    }),

    "notion.createPage": tool<
      {
        parentId: string;
        title: string;
        content?: string;
        properties?: Record<string, any>;
      },
      {
        success: boolean;
        pageId?: string;
        url?: string;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description:
        "Create a new page in Notion. The parent can be a page ID or database ID.",
      inputSchema: zodSchema(
        z.object({
          parentId: z.string().describe("ID of the parent page or database"),
          title: z.string().describe("Title of the new page"),
          content: z.string().optional().describe("Initial content for the page"),
          properties: z.record(z.string(), z.any()).optional().describe("Page properties (for database pages)"),
        })
      ),
      execute: createSafeToolWrapper("notion.createPage", createNotionPage as any),
    }),

    "notion.createDatabase": tool<
      {
        parentId: string;
        title: string;
        properties: Record<string, any>;
      },
      {
        success: boolean;
        databaseId?: string;
        url?: string;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description:
        "Create a new database in Notion. Define the schema with properties.",
      inputSchema: zodSchema(
        z.object({
          parentId: z.string().describe("ID of the parent page"),
          title: z.string().describe("Title of the new database"),
          properties: z.record(z.string(), z.any()).describe("Database schema properties"),
        })
      ),
      execute: createSafeToolWrapper("notion.createDatabase", createNotionDatabase as any),
    }),

    "notion.queryDatabase": tool<
      {
        databaseId: string;
        filter?: any;
        sorts?: any[];
        startCursor?: string;
        pageSize?: number;
      },
      {
        success: boolean;
        results?: any[];
        nextCursor?: string;
        hasMore?: boolean;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description:
        "Query a Notion database with optional filters and sorting. Returns pages that match the criteria.",
      inputSchema: zodSchema(
        z.object({
          databaseId: z.string().describe("ID of the database to query"),
          filter: z.any().optional().describe("Filter criteria for the query"),
          sorts: z.array(z.any()).optional().describe("Sort criteria for results"),
          startCursor: z.string().optional().describe("Cursor for pagination"),
          pageSize: z.number().optional().describe("Number of results per page (max 100)"),
        })
      ),
      execute: createSafeToolWrapper("notion.queryDatabase", queryNotionDatabase as any),
    }),

    "notion.updatePage": tool<
      {
        pageId: string;
        properties?: Record<string, any>;
        archived?: boolean;
      },
      {
        success: boolean;
        pageId?: string;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description:
        "Update a Notion page's properties or archive status.",
      inputSchema: zodSchema(
        z.object({
          pageId: z.string().describe("ID of the page to update"),
          properties: z.record(z.string(), z.any()).optional().describe("Properties to update"),
          archived: z.boolean().optional().describe("Whether to archive the page"),
        })
      ),
      execute: createSafeToolWrapper("notion.updatePage", updateNotionPage as any),
    }),

    "notion.getPage": tool<
      { pageId: string },
      {
        success: boolean;
        page?: any;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description: "Retrieve a specific Notion page by ID.",
      inputSchema: zodSchema(
        z.object({
          pageId: z.string().describe("ID of the page to retrieve"),
        })
      ),
      execute: createSafeToolWrapper(
        "notion.getPage",
        async ({ pageId }: { pageId: string }) => getNotionPage(pageId)
      ),
    }),

    "notion.getDatabase": tool<
      { databaseId: string },
      {
        success: boolean;
        database?: any;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description: "Retrieve a specific Notion database by ID.",
      inputSchema: zodSchema(
        z.object({
          databaseId: z.string().describe("ID of the database to retrieve"),
        })
      ),
      execute: createSafeToolWrapper(
        "notion.getDatabase",
        async ({ databaseId }: { databaseId: string }) => getNotionDatabase(databaseId)
      ),
    }),

    "notion.search": tool<
      { query: string },
      {
        success: boolean;
        results?: any[];
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description:
        "Search across all Notion pages and databases that the integration has access to.",
      inputSchema: zodSchema(
        z.object({
          query: z.string().describe("Search query string"),
        })
      ),
      execute: createSafeToolWrapper(
        "notion.search",
        async ({ query }: { query: string }) => searchNotion(query)
      ),
    }),

    "notion.addBlocks": tool<
      {
        pageId: string;
        blocks: any[];
      },
      {
        success: boolean;
        error?: string;
        needsAuth?: boolean;
      }
    >({
      description:
        "Add content blocks to a Notion page. Blocks can be paragraphs, headings, lists, etc.",
      inputSchema: zodSchema(
        z.object({
          pageId: z.string().describe("ID of the page to add blocks to"),
          blocks: z.array(z.any()).describe("Array of block objects to add"),
        })
      ),
      execute: createSafeToolWrapper(
        "notion.addBlocks",
        async ({ pageId, blocks }: { pageId: string; blocks: any[] }) =>
          addBlocksToPage(pageId, blocks)
      ),
    }),
  } as const;
}
