import { z } from "zod";
import { tool, zodSchema } from "ai";
import { createSession, navigate, stopSession } from "../../tools/hyperbrowser";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildHyperbrowserTools() {
  return {
    "hbrowser.session.create": tool<
      import("../../tools/hyperbrowser").CreateSessionInput,
      { id: string; wsEndpoint: string }
    >({
      description: "Create a Hyperbrowser session",
      inputSchema: zodSchema(
        z.object({
          profile: z
            .object({
              id: z.string().optional(),
              persistChanges: z.boolean().optional(),
            })
            .optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "hbrowser.session.create",
        createSession as any
      ),
    }),

    "hbrowser.session.stop": tool<{ sessionId: string }, { ok: true }>({
      description: "Stop a Hyperbrowser session",
      inputSchema: zodSchema(z.object({ sessionId: z.string() })),
      execute: createSafeToolWrapper("hbrowser.session.stop", async (args) => ({
        ok: (await stopSession(args.sessionId)).ok as true,
      })),
    }),

    "hbrowser.navigate": tool<
      import("../../tools/hyperbrowser").NavigateInput,
      { title: string; html: string }
    >({
      description:
        "Navigate a page within a Hyperbrowser session and return HTML",
      inputSchema: zodSchema(
        z.object({ sessionId: z.string(), url: z.string().url() })
      ),
      execute: createSafeToolWrapper("hbrowser.navigate", navigate as any),
    }),
  } as const;
}

