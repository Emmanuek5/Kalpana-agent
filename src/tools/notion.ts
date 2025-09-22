import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";
import os from "os";

export interface NotionConfig {
  token?: string;
  isLinked: boolean;
}

export interface NotionPageInput {
  parentId: string;
  title: string;
  content?: string;
  properties?: Record<string, any>;
}

export interface NotionDatabaseInput {
  parentId: string;
  title: string;
  properties: Record<string, any>;
}

export interface NotionQueryInput {
  databaseId: string;
  filter?: any;
  sorts?: any[];
  startCursor?: string;
  pageSize?: number;
}

export interface NotionUpdatePageInput {
  pageId: string;
  properties?: Record<string, any>;
  archived?: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.kalpana');
const CONFIG_FILE = path.join(CONFIG_DIR, 'notion-config.json');

// Ensure config directory exists
function ensureConfigDir(): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

let notionClient: Client | null = null;
let config: NotionConfig = { isLinked: false };

// Load configuration on module initialization
try {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    const configData = fs.readFileSync(CONFIG_FILE, "utf8");
    config = JSON.parse(configData);
    if (config.token) {
      notionClient = new Client({ auth: config.token });
    }
  }
} catch (error) {
  console.warn("Failed to load Notion configuration:", error);
}

function saveConfig() {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Failed to save Notion configuration:", error);
  }
}

export async function isNotionLinked(): Promise<{ isLinked: boolean; hasToken: boolean }> {
  return {
    isLinked: config.isLinked,
    hasToken: !!config.token
  };
}

export async function linkNotionAccount(token: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    // Test the token by making a simple API call
    const testClient = new Client({ auth: token });
    await testClient.users.me({});
    
    // If successful, save the configuration
    config.token = token;
    config.isLinked = true;
    notionClient = testClient;
    saveConfig();
    
    return {
      success: true,
      message: "Notion account linked successfully"
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to link Notion account: ${error.message}`
    };
  }
}

export async function unlinkNotionAccount(): Promise<{ success: boolean; message?: string }> {
  try {
    config = { isLinked: false };
    notionClient = null;
    
    // Remove config file
    ensureConfigDir();
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    
    return {
      success: true,
      message: "Notion account unlinked successfully"
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to unlink Notion account"
    };
  }
}

export async function createNotionPage({
  parentId,
  title,
  content,
  properties = {}
}: NotionPageInput): Promise<{ success: boolean; pageId?: string; url?: string; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const pageData: any = {
      parent: { page_id: parentId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        },
        ...properties
      }
    };

    // Add content blocks if provided
    if (content) {
      pageData.children = [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: content
                }
              }
            ]
          }
        }
      ];
    }

    const response = await notionClient.pages.create(pageData);
    
    return {
      success: true,
      pageId: response.id,
      url: `https://notion.so/${response.id.replace(/-/g, '')}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to create page: ${error.message}`
    };
  }
}

export async function createNotionDatabase({
  parentId,
  title,
  properties
}: NotionDatabaseInput): Promise<{ success: boolean; databaseId?: string; url?: string; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const response = await notionClient.databases.create({
      parent: { page_id: parentId },
      title: [
        {
          type: "text",
          text: {
            content: title
          }
        }
      ],
      properties
    });
    
    return {
      success: true,
      databaseId: response.id,
      url: `https://notion.so/${response.id.replace(/-/g, '')}`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to create database: ${error.message}`
    };
  }
}

export async function queryNotionDatabase({
  databaseId,
  filter,
  sorts,
  startCursor,
  pageSize = 100
}: NotionQueryInput): Promise<{ success: boolean; results?: any[]; nextCursor?: string; hasMore?: boolean; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const response = await notionClient.databases.query({
      database_id: databaseId,
      filter,
      sorts,
      start_cursor: startCursor,
      page_size: pageSize
    });
    
    return {
      success: true,
      results: response.results,
      nextCursor: response.next_cursor || undefined,
      hasMore: response.has_more,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to query database: ${error.message}`
    };
  }
}

export async function updateNotionPage({
  pageId,
  properties,
  archived
}: NotionUpdatePageInput): Promise<{ success: boolean; pageId?: string; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const updateData: any = {};
    
    if (properties) {
      updateData.properties = properties;
    }
    
    if (archived !== undefined) {
      updateData.archived = archived;
    }

    const response = await notionClient.pages.update({
      page_id: pageId,
      ...updateData
    });
    
    return {
      success: true,
      pageId: response.id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to update page: ${error.message}`
    };
  }
}

export async function getNotionPage(pageId: string): Promise<{ success: boolean; page?: any; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const response = await notionClient.pages.retrieve({ page_id: pageId });
    
    return {
      success: true,
      page: response,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to get page: ${error.message}`
    };
  }
}

export async function getNotionDatabase(databaseId: string): Promise<{ success: boolean; database?: any; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const response = await notionClient.databases.retrieve({ database_id: databaseId });
    
    return {
      success: true,
      database: response,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to get database: ${error.message}`
    };
  }
}

export async function searchNotion(query: string): Promise<{ success: boolean; results?: any[]; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    const response = await notionClient.search({
      query,
      page_size: 50
    });
    
    return {
      success: true,
      results: response.results,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to search: ${error.message}`
    };
  }
}

export async function addBlocksToPage(pageId: string, blocks: any[]): Promise<{ success: boolean; error?: string; needsAuth?: boolean }> {
  if (!notionClient) {
    return { success: false, needsAuth: true, error: "Notion not linked. Use linkNotionAccount first." };
  }

  try {
    await notionClient.blocks.children.append({
      block_id: pageId,
      children: blocks
    });
    
    return {
      success: true,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to add blocks: ${error.message}`
    };
  }
}
