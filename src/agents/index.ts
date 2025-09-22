import { z } from "zod";
import {
  generateText,
  tool,
  stepCountIs,
  zodSchema,
  type ModelMessage,
} from "ai";
import chalk from "chalk";
import { openrouter, buildSystemPrompt } from "./system";
import { buildSandboxTools } from "./tools/sandbox";
import { buildDockerTools } from "./tools/docker";
import { buildFsTools } from "./tools/fs";
import { buildEditTools } from "./tools/edit";
import { buildExecTools } from "./tools/exec";
import { buildBrowserTools } from "./tools/browser";
import { buildHyperAgentTools } from "./tools/hyper";
import { buildHyperbrowserTools } from "./tools/hyperbrowser";
import { buildGDriveTools } from "./tools/gdrive";
import { buildNotionTools } from "./tools/notion";
import { createSafeToolWrapper } from "./safeToolWrapper";
import { buildGeminiTools } from "./tools/gemini";
import { mcpManager } from "../mcp";

export async function runAgent(
  userInstruction: string,
  history: ModelMessage[] = [],
  useInteractiveProgress = false
) {
  const model = openrouter(process.env.MODEL_ID || "openai/gpt-4o-mini");
  const system = await buildSystemPrompt();

  // Load MCP tools (already loaded at CLI startup, but read current set)
  const mcpTools = mcpManager.getTools();
  const wrappedMcpTools = Object.fromEntries(
    Object.entries(mcpTools).map(([toolName, toolDef]) => {
      if (typeof toolDef === "object" && toolDef && "execute" in toolDef) {
        return [
          toolName,
          {
            ...toolDef,
            execute: createSafeToolWrapper(toolName, (toolDef as any).execute),
          },
        ];
      }
      return [toolName, toolDef];
    })
  );

  const tools = {
    ...buildSandboxTools(),
    ...buildDockerTools(),
    ...buildFsTools(),
    ...buildEditTools(),
    ...buildExecTools(),
    ...buildBrowserTools(),
    ...buildHyperAgentTools(),
    ...buildHyperbrowserTools(),
    ...buildGDriveTools(),
    ...buildGeminiTools(),
    ...buildNotionTools(),

    ...wrappedMcpTools,
  } as const;

  // Filter and ensure messages are properly formatted as ModelMessage[]
  const filteredHistory = history.filter((msg): msg is ModelMessage => {
    return msg && typeof msg === 'object' && 'role' in msg && 'content' in msg &&
           (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' );
  });

  const allMessages: ModelMessage[] = [
    ...filteredHistory,
    { role: "user", content: userInstruction }
  ];

  const result = await generateText({
    model,
    messages: allMessages,
    system,
    stopWhen: stepCountIs(30),
    providerOptions: { openrouter: { include_reasoning: false } },
    tools,
  });

  const responseMessages = (result as any).response?.messages as
    | ModelMessage[]
    | undefined;
  if (responseMessages && Array.isArray(responseMessages)) {
    return { text: result.text, messages: responseMessages };
  }
  return {
    text: result.text,
    messages: [
      ...history,
      { role: "user", content: userInstruction },
      { role: "assistant", content: result.text },
    ] as ModelMessage[],
  };
}

export async function cleanup() {
  const { mcpManager } = await import("../mcp");
  await mcpManager.cleanup();
  const { toolCollector } = await import("../tool-collector");
  toolCollector.cleanup(50);
}
