import { z } from "zod";
import { tool, zodSchema } from "ai";
import { searchReplace, subAgentWrite } from "../../tools/edit";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildEditTools() {
  return {
    "edit.searchReplace": tool<
      {
        relativePath: string;
        searchText: string;
        replaceText: string;
        replaceAll?: boolean;
      },
      { success: boolean; occurrences: number; message: string }
    >({
      description:
        "Search and replace text in a file. Can replace first occurrence or all occurrences.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string(),
          searchText: z.string(),
          replaceText: z.string(),
          replaceAll: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "edit.searchReplace",
        searchReplace as any
      ),
    }),

    "edit.subAgentWrite": tool<
      {
        relativePath: string;
        instruction: string;
        createIfNotExists?: boolean;
      },
      {
        success: boolean;
        message: string;
        summary: string;
        warnings?: string[];
        linesWritten?: number;
      }
    >({
      description:
        "Use a specialized sub-agent to write or modify files based on natural language instructions. The sub-agent has full file context and follows best practices. Returns structured output with content summary.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string(),
          instruction: z.string(),
          createIfNotExists: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "edit.subAgentWrite",
        subAgentWrite as any
      ),
    }),
  } as const;
}

