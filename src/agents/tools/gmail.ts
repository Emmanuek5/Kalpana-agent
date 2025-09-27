import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  isGmailLinked,
  linkGmailAccount,
  unlinkGmailAccount,
  listLabels,
  listMessages,
  getMessage,
  sendMessage,
} from "../../tools/gmail";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildGmailTools() {
  return {
    "gmail.isLinked": tool<{}, any>({
      description: "Check if Gmail account is linked and token is valid.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gmail.isLinked", async () =>
        isGmailLinked()
      ),
    }),

    "gmail.linkAccount": tool<{}, any>({
      description:
        "Start OAuth flow to link Gmail account. Returns authorization URL.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gmail.linkAccount", async () =>
        linkGmailAccount()
      ),
    }),

    "gmail.unlinkAccount": tool<{}, any>({
      description: "Unlink Gmail account and remove stored tokens.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gmail.unlinkAccount", async () =>
        unlinkGmailAccount()
      ),
    }),

    "gmail.listLabels": tool<{}, any>({
      description: "List Gmail labels for the linked account.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gmail.listLabels", async () =>
        listLabels()
      ),
    }),

    "gmail.listMessages": tool<
      {
        labelIds?: string[];
        q?: string;
        maxResults?: number;
      },
      any
    >({
      description: "List Gmail messages by query or label.",
      inputSchema: zodSchema(
        z.object({
          labelIds: z.array(z.string()).optional(),
          q: z.string().optional(),
          maxResults: z.number().optional(),
        })
      ),
      execute: createSafeToolWrapper("gmail.listMessages", async (args: any) =>
        listMessages(args)
      ),
    }),

    "gmail.getMessage": tool<{ id: string }, any>({
      description: "Get a specific Gmail message by ID.",
      inputSchema: zodSchema(z.object({ id: z.string() })),
      execute: createSafeToolWrapper("gmail.getMessage", async (args: any) =>
        getMessage(args)
      ),
    }),

    "gmail.sendMessage": tool<
      {
        to: string;
        subject: string;
        text: string;
        from?: string;
      },
      any
    >({
      description: "Send an email using Gmail.",
      inputSchema: zodSchema(
        z.object({
          to: z.string(),
          subject: z.string(),
          text: z.string(),
          from: z.string().optional(),
        })
      ),
      execute: createSafeToolWrapper("gmail.sendMessage", async (args: any) =>
        sendMessage(args)
      ),
    }),
  } as const;
}
