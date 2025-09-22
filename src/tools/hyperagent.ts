import { Hyperbrowser } from "@hyperbrowser/sdk";

export interface StartHyperAgentInput {
  task: string;
  llm?: string; // per SDK HyperAgentLlm enum, allow string passthrough
  sessionId?: string; // reuse existing session
  maxSteps?: number;
  keepBrowserOpen?: boolean;
}

let client: Hyperbrowser | null = null;

function getClient() {
  if (!client) {
    if (!process.env.HYPERBROWSER_API_KEY) {
      throw new Error("HYPERBROWSER_API_KEY environment variable is required for HyperAgent functionality");
    }
    client = new Hyperbrowser({ apiKey: process.env.HYPERBROWSER_API_KEY });
  }
  return client;
}

export async function startHyperAgentTask({
  task,
  llm,
  sessionId,
  maxSteps,
  keepBrowserOpen,
}: StartHyperAgentInput) {
  const hyperbrowserClient = getClient();
  const res = await hyperbrowserClient.agents.hyperAgent.startAndWait({
    task,
    llm: llm as any,
    sessionId,
    maxSteps,
    keepBrowserOpen,
  });
  return res;
}
