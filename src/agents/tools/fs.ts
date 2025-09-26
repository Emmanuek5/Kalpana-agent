import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  fsWriteFile,
  fsReadFile,
  fsListDir,
  fsMakeDir,
  fsDelete,
  fsCopy,
  fsMove,
  fsStats,
  summarizeFile,
  fsReadFileChunk,
  fsLineCount,
} from "../../tools/fs";
import { createSafeToolWrapper } from "../safeToolWrapper";
import chalk from "chalk";

export function buildFsTools() {
  return {
    "fs.writeFile": tool<
      { relativePath: string; content: string },
      { ok: true }
    >({
      description: "Write a file inside the sandbox persistent volume.",
      inputSchema: zodSchema(
        z.object({ relativePath: z.string(), content: z.string() })
      ),
      execute: createSafeToolWrapper("fs.writeFile", fsWriteFile as any),
    }),

    "fs.readFile": tool<
      { relativePath: string; startLine?: number; endLine?: number },
      any
    >({
      description:
        "Read a file from the sandbox persistent volume. Returns max 400 lines at a time. For large files (>1000 lines), shows summary unless specific line range requested. Use fs.summarize first for large files, then read specific chunks with startLine/endLine if needed.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string(),
          startLine: z.number().optional(),
          endLine: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper("fs.readFile", async (args: any) => {
        const result = await fsReadFile({
          relativePath: args.relativePath,
          maxLines: 400,
          startLine: args.startLine,
          endLine: args.endLine,
        });
        return result;
      }),
    }),

    "fs.listDir": tool<
      { relativePath?: string; recursive?: boolean; limit?: number },
      { name: string; type: string; path: string }[]
    >({
      description:
        "List files in a directory within the sandbox volume. Defaults to returning up to 2000 items to protect context limits. Use 'limit' to adjust and prefer non-recursive scans first.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string().optional(),
          recursive: z.boolean().optional(),
          limit: z
            .number()
            .optional()
            .describe("Max entries to return (default 2000)"),
        })
      ),
      execute: createSafeToolWrapper("fs.listDir", async (args) => {
        const HARD_MAX = 5000;
        const DEFAULT_LIMIT = 2000;
        const limit = Math.max(
          1,
          Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_MAX)
        );
        const res = (await fsListDir(args as any)) as any;
        const entries = Array.isArray(res) ? res : [];
        const capped = entries.slice(0, limit);
        try {
          console.log(
            chalk.gray(
              `[fs.listDir] ${args?.relativePath ?? "."} -> ${
                entries.length
              } entries (returning ${capped.length})`
            )
          );
          for (const e of capped.slice(0, 10)) {
            console.log(chalk.gray(`  - ${e.type} ${e.path}`));
          }
          if (entries.length > capped.length) {
            console.log(
              chalk.gray(
                `  ... (omitted ${entries.length - capped.length} more)`
              )
            );
          }
        } catch {}
        return capped;
      }),
    }),

    "fs.makeDir": tool<
      { relativePath: string; recursive?: boolean },
      { ok: boolean; path: string }
    >({
      description: "Create a directory within the sandbox volume.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string(),
          recursive: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper("fs.makeDir", fsMakeDir as any),
    }),

    "fs.delete": tool<
      { relativePath: string; recursive?: boolean },
      { ok: boolean; deleted?: string; error?: string }
    >({
      description: "Delete a file or directory within the sandbox volume.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string(),
          recursive: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper("fs.delete", fsDelete as any),
    }),

    "fs.copy": tool<
      { sourcePath: string; destinationPath: string },
      { ok: boolean; copied?: string; error?: string }
    >({
      description: "Copy a file or directory within the sandbox volume.",
      inputSchema: zodSchema(
        z.object({
          sourcePath: z.string(),
          destinationPath: z.string(),
        })
      ),
      execute: createSafeToolWrapper("fs.copy", fsCopy as any),
    }),

    "fs.move": tool<
      { sourcePath: string; destinationPath: string },
      { ok: boolean; moved?: string; error?: string }
    >({
      description: "Move/rename a file or directory within the sandbox volume.",
      inputSchema: zodSchema(
        z.object({
          sourcePath: z.string(),
          destinationPath: z.string(),
        })
      ),
      execute: createSafeToolWrapper("fs.move", fsMove as any),
    }),

    "fs.stats": tool<
      { relativePath: string },
      { ok: boolean; stats?: any; error?: string }
    >({
      description:
        "Get file or directory statistics (size, dates, permissions).",
      inputSchema: zodSchema(z.object({ relativePath: z.string() })),
      execute: createSafeToolWrapper("fs.stats", fsStats as any),
    }),

    "fs.summarize": tool<{ relativePath: string }, any>({
      description:
        "Get an AI-generated summary of a file's contents, structure, and purpose. Use this FIRST before reading large files to understand what they contain.",
      inputSchema: zodSchema(z.object({ relativePath: z.string() })),
      execute: createSafeToolWrapper("fs.summarize", summarizeFile as any),
    }),

    "fs.readChunk": tool<
      { relativePath: string; startLine: number; endLine: number },
      any
    >({
      description:
        "Read a specific chunk of lines from a file. Use after fs.summarize to read specific sections of interest.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string(),
          startLine: z.number(),
          endLine: z.number(),
        })
      ),
      execute: createSafeToolWrapper("fs.readChunk", fsReadFileChunk as any),
    }),

    "fs.lineCount": tool<{ relativePath: string }, any>({
      description:
        "Get line count and reading strategy recommendation for a file without reading its full content. Use this to decide the best reading approach (direct, summarize+read, or summarize+chunk).",
      inputSchema: zodSchema(z.object({ relativePath: z.string() })),
      execute: createSafeToolWrapper("fs.lineCount", fsLineCount as any),
    }),
  } as const;
}
