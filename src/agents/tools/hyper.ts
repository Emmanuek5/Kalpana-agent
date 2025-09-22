import { z } from "zod";
import { tool, zodSchema } from "ai";
import { startHyperAgentTask } from "../../tools/hyperagent";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildHyperAgentTools() {
  return {
    "hyperagent.run": tool<
      {
        task: string;
        llm?: string;
        sessionId?: string;
        maxSteps?: number;
        keepBrowserOpen?: boolean;
      },
      unknown
    >({
      description:
        "Run a HyperAgent task (subagent) to browse and act on the web.",
      inputSchema: zodSchema(
        z.object({
          task: z.string(),
          llm: z.string().optional(),
          sessionId: z.string().optional(),
          maxSteps: z.number().optional(),
          keepBrowserOpen: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "hyperagent.run",
        startHyperAgentTask as any
      ),
    }),
  } as const;
}
