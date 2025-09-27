import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  isWorkspaceLinked,
  linkWorkspaceAccount,
  unlinkWorkspaceAccount,
  readRange,
  writeRange,
  appendRows,
  createSpreadsheet,
} from "../../tools/sheets";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildSheetsTools() {
  return {
    "sheets.isLinked": tool<{}, any>({
      description: "Check if Google Workspace (Sheets/Docs) is linked.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("sheets.isLinked", async () =>
        isWorkspaceLinked()
      ),
    }),
    "sheets.linkAccount": tool<{}, any>({
      description: "Start OAuth flow to link Google Workspace (Sheets/Docs).",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("sheets.linkAccount", async () =>
        linkWorkspaceAccount()
      ),
    }),
    "sheets.unlinkAccount": tool<{}, any>({
      description: "Unlink Google Workspace and remove stored tokens.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("sheets.unlinkAccount", async () =>
        unlinkWorkspaceAccount()
      ),
    }),
    "sheets.readRange": tool<{ spreadsheetId: string; range: string }, any>({
      description: "Read a range from a Google Sheet.",
      inputSchema: zodSchema(
        z.object({ spreadsheetId: z.string(), range: z.string() })
      ),
      execute: createSafeToolWrapper("sheets.readRange", async (args: any) =>
        readRange(args)
      ),
    }),
    "sheets.writeRange": tool<
      {
        spreadsheetId: string;
        range: string;
        values: any[][];
        valueInputOption?: "RAW" | "USER_ENTERED";
      },
      any
    >({
      description: "Write values to a range in a Google Sheet.",
      inputSchema: zodSchema(
        z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          values: z.array(z.array(z.any())),
          valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional(),
        })
      ),
      execute: createSafeToolWrapper("sheets.writeRange", async (args: any) =>
        writeRange(args)
      ),
    }),
    "sheets.appendRows": tool<
      {
        spreadsheetId: string;
        range: string;
        values: any[][];
        valueInputOption?: "RAW" | "USER_ENTERED";
      },
      any
    >({
      description: "Append rows to a Google Sheet.",
      inputSchema: zodSchema(
        z.object({
          spreadsheetId: z.string(),
          range: z.string(),
          values: z.array(z.array(z.any())),
          valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional(),
        })
      ),
      execute: createSafeToolWrapper("sheets.appendRows", async (args: any) =>
        appendRows(args)
      ),
    }),
    "sheets.createSpreadsheet": tool<{ title: string }, any>({
      description: "Create a new Google Spreadsheet.",
      inputSchema: zodSchema(z.object({ title: z.string() })),
      execute: createSafeToolWrapper(
        "sheets.createSpreadsheet",
        async (args: any) => createSpreadsheet(args)
      ),
    }),
  } as const;
}
