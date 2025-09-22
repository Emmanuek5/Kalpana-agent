import "dotenv/config";
import {
  createOpenRouter,
  openrouter as defaultOpenRouter,
} from "@openrouter/ai-sdk-provider";

export const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : defaultOpenRouter;

export async function buildSystemPrompt(): Promise<string> {
  let system: string | undefined = undefined;
  if (!system) {
    try {
      const fs = await import("node:fs/promises");
      system = await fs.readFile("system.txt", "utf8");
    } catch {}
  }
  if (!system) {
    system =
      "You are a helpful, concise AI agent with expert developer skills. Prefer step-by-step tool use and precise answers. If a tool fails, continue with alternative approaches and report the issue.";
  }
  system += `\n  Today's date is ${new Date().toLocaleDateString()}. \n  `;
  return system;
}
