import { z } from "zod";
import { tool, zodSchema } from "ai";
import { createDocument, getDocument, batchUpdate } from "../../tools/gdocs";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildGDocsTools() {
  return {
    "gdocs.createDocument": tool<{ title: string }, any>({
      description: "Create a new Google Doc.",
      inputSchema: zodSchema(z.object({ title: z.string() })),
      execute: createSafeToolWrapper(
        "gdocs.createDocument",
        async (args: any) => createDocument(args)
      ),
    }),
    "gdocs.getDocument": tool<{ documentId: string }, any>({
      description: "Get a Google Doc by ID.",
      inputSchema: zodSchema(z.object({ documentId: z.string() })),
      execute: createSafeToolWrapper("gdocs.getDocument", async (args: any) =>
        getDocument(args)
      ),
    }),
    "gdocs.batchUpdate": tool<{ documentId: string; requests: any[] }, any>({
      description: "Batch update a Google Doc (insert text, styles, etc.).",
      inputSchema: zodSchema(
        z.object({ documentId: z.string(), requests: z.array(z.any()) })
      ),
      execute: createSafeToolWrapper("gdocs.batchUpdate", async (args: any) =>
        batchUpdate(args)
      ),
    }),
  } as const;
}
