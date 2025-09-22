import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  context7Search,
  context7GetDocs,
  fetchDocsByUrl,
} from "../../tools/docs";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildDocsTools() {
  return {
    "context7.search": tool<{ query: string }, unknown>({
      description: "Search libraries on Context7",
      inputSchema: zodSchema(z.object({ query: z.string() })),
      execute: createSafeToolWrapper("context7.search", context7Search as any),
    }),

    "context7.getDocs": tool<
      { id: string; topic?: string; type?: "json" | "txt"; tokens?: number },
      unknown
    >({
      description: "Fetch docs for a library from Context7",
      inputSchema: zodSchema(
        z.object({
          id: z.string(),
          topic: z.string().optional(),
          type: z.enum(["json", "txt"]).optional(),
          tokens: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "context7.getDocs",
        context7GetDocs as any
      ),
    }),

    "docs.fetchUrl": tool<{ url: string }, { url: string; text: string }>({
      description: "Fetch raw text from a URL if Context7 not available",
      inputSchema: zodSchema(z.object({ url: z.string().url() })),
      execute: createSafeToolWrapper("docs.fetchUrl", fetchDocsByUrl as any),
    }),
  } as const;
}
