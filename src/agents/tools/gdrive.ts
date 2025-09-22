import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  isAccountLinked,
  linkAccount,
  unlinkAccount,
  listFiles,
  readFile,
  writeFile,
  searchFiles,
  downloadFile,
} from "../../tools/gdrive";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildGDriveTools() {
  return {
    "pDrive.isAccountLinked": tool<{}, any>({
      description:
        "Check if Google Drive account is linked and get authentication status. Use this before any other Google Drive operations.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("pDrive.isAccountLinked", async () => {
        return await isAccountLinked();
      }),
    }),

    "pDrive.linkAccount": tool<{}, any>({
      description:
        "Start Google Drive OAuth flow to link user's account. Returns authorization URL that user must visit to complete linking.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("pDrive.linkAccount", async () => {
        return await linkAccount();
      }),
    }),

    "pDrive.unlinkAccount": tool<{}, any>({
      description:
        "Unlink the currently connected Google Drive account. This will remove all stored authentication tokens and disconnect the account.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("pDrive.unlinkAccount", async () => {
        return await unlinkAccount();
      }),
    }),

    "pDrive.listFiles": tool<
      {
        folderId?: string;
        query?: string;
        maxResults?: number;
        orderBy?: string;
      },
      any
    >({
      description:
        "List files and folders in Google Drive. Can filter by folder, search query, and limit results. Use this to explore the user's Google Drive structure.",
      inputSchema: zodSchema(
        z.object({
          folderId: z
            .string()
            .optional()
            .describe("Specific folder ID to list files from"),
          query: z.string().optional().describe("Search query to filter files"),
          maxResults: z
            .number()
            .optional()
            .describe("Maximum number of files to return (default: 50)"),
          orderBy: z
            .string()
            .optional()
            .describe("Sort order (default: 'modifiedTime desc')"),
        })
      ),
      execute: createSafeToolWrapper("pDrive.listFiles", async (args: any) => {
        return await listFiles(args);
      }),
    }),

    "pDrive.readFile": tool<
      {
        fileId: string;
        mimeType?: string;
      },
      any
    >({
      description:
        "Read content from a Google Drive file by its ID. Supports Google Docs, Sheets, regular text files, and more. Use pDrive.listFiles or pDrive.searchFiles to find file IDs first.",
      inputSchema: zodSchema(
        z.object({
          fileId: z.string().describe("Google Drive file ID to read"),
          mimeType: z
            .string()
            .optional()
            .describe(
              "Preferred export format for Google Workspace files (e.g., 'text/plain', 'text/csv')"
            ),
        })
      ),
      execute: createSafeToolWrapper("pDrive.readFile", async (args: any) => {
        return await readFile(args);
      }),
    }),

    "pDrive.writeFile": tool<
      {
        name: string;
        content: string;
        folderId?: string;
        mimeType?: string;
      },
      any
    >({
      description:
        "Create a new file in Google Drive with the specified content. Can optionally specify a folder and MIME type.",
      inputSchema: zodSchema(
        z.object({
          name: z.string().describe("Name for the new file"),
          content: z.string().describe("Content to write to the file"),
          folderId: z
            .string()
            .optional()
            .describe("Google Drive folder ID to create file in (optional)"),
          mimeType: z
            .string()
            .optional()
            .describe("MIME type for the file (default: 'text/plain')"),
        })
      ),
      execute: createSafeToolWrapper("pDrive.writeFile", async (args: any) => {
        return await writeFile(args);
      }),
    }),

    "pDrive.searchFiles": tool<
      {
        query: string;
        maxResults?: number;
      },
      any
    >({
      description:
        "Search for files in Google Drive by name or content. Returns files that match the search query.",
      inputSchema: zodSchema(
        z.object({
          query: z
            .string()
            .describe("Search query (searches file names and content)"),
          maxResults: z
            .number()
            .optional()
            .describe("Maximum number of results (default: 20)"),
        })
      ),
      execute: createSafeToolWrapper(
        "pDrive.searchFiles",
        async (args: any) => {
          return await searchFiles(args);
        }
      ),
    }),

    "pDrive.downloadFile": tool<
      {
        fileId: string;
        relativePath: string;
      },
      any
    >({
      description: "Download a file from Google Drive to the sandbox workspace. Use this for media files (images, videos, audio, PDFs) that need to be analyzed with Gemini tools. After downloading, use gemini.analyzeFile or specific analysis tools.",
      inputSchema: zodSchema(
        z.object({
          fileId: z.string().describe("Google Drive file ID to download"),
          relativePath: z.string().describe("Path where to save the file in sandbox (e.g., 'downloads/image.jpg')")
        })
      ),
      execute: createSafeToolWrapper(
        "pDrive.downloadFile",
        async (args: any) => {
          return await downloadFile(args);
        }
      ),
    }),
  } as const;
}
