import { Hyperbrowser } from "@hyperbrowser/sdk";

export interface StartHyperAgentInput {
  task: string;
  llm?: string; // per SDK HyperAgentLlm enum, allow string passthrough
  sessionId?: string; // reuse existing session
  maxSteps?: number;
  keepBrowserOpen?: boolean;
}

const client = new Hyperbrowser({ apiKey: process.env.HYPERBROWSER_API_KEY });

export async function startHyperAgentTask({
  task,
  llm,
  sessionId,
  maxSteps,
  keepBrowserOpen,
}: StartHyperAgentInput) {
  const res = await client.agents.hyperAgent.startAndWait({
    task,
    llm: llm as any,
    sessionId,
    maxSteps,
    keepBrowserOpen,
  });
  return res;
}
