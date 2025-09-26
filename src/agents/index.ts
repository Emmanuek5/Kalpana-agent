import { z } from "zod";
import {
  generateText,
  tool,
  stepCountIs,
  zodSchema,
  type ModelMessage,
} from "ai";
import { getAIProvider, buildSystemPrompt } from "./system";
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
import { buildErrorCheckTools } from "./tools/error-check";
import { buildLocalScraperTools } from "./tools/local-scraper";
import { mcpManager } from "../mcp";
import { contextManager } from "../context-manager.js";
import { calculateRemainingContext } from "../token-counter.js";

// Sanitize tool names to satisfy providers that restrict tool name characters
// Allowed pattern per OpenAI: ^[a-zA-Z0-9_-]+$
function sanitizeToolNames<T extends Record<string, any>>(
  tools: T
): Record<string, any> {
  const sanitized: Record<string, any> = {};
  const usedNames = new Set<string>();

  for (const [originalName, def] of Object.entries(tools)) {
    let base = originalName.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!base) base = "tool";

    let name = base;
    let counter = 2;
    while (usedNames.has(name)) {
      name = `${base}_${counter++}`;
    }
    usedNames.add(name);
    sanitized[name] = def;
  }

  return sanitized;
}

export async function runAgent(
  userInstruction: string,
  history: ModelMessage[] = [],
  useInteractiveProgress = false
) {
  const aiProvider = getAIProvider();

  // Get model ID based on provider
  const aiProviderType = process.env.AI_PROVIDER || "openrouter";

  let modelId: string;
  if (aiProviderType === "ollama") {
    modelId = process.env.OLLAMA_MODEL || process.env.MODEL_ID || "llama3.2";
  } else {
    modelId = process.env.MODEL_ID || "openai/gpt-4o-mini";
  }

  const model = aiProvider.languageModel(modelId);
  const system = await buildSystemPrompt();

  // Filter and ensure messages are properly formatted as ModelMessage[]
  const filteredHistory = history.filter((msg): msg is ModelMessage => {
    return (
      msg &&
      typeof msg === "object" &&
      "role" in msg &&
      "content" in msg &&
      (msg.role === "user" || msg.role === "assistant" || msg.role === "system")
    );
  });

  // Apply context management to keep within token limits
  const managedHistory = await contextManager.manageContext(
    filteredHistory,
    system,
    modelId
  );

  // Check remaining context space
  const contextInfo = calculateRemainingContext(
    managedHistory,
    system,
    230000, // 230k token limit
    modelId
  );

  // Context management happens silently in the background

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
    ...(await import("./tools/gcal")).buildGCalTools(),
    ...buildGeminiTools(),
    ...buildNotionTools(),
    ...buildErrorCheckTools(),
    ...buildLocalScraperTools(),

    ...wrappedMcpTools,
  } as const;

  const allMessages: ModelMessage[] = [
    ...managedHistory,
    { role: "user", content: userInstruction },
  ];

  let result: any;
  try {
    const generateOptions: any = {
      model,
      messages: allMessages,
      system,
      stopWhen: stepCountIs(30),
      tools: sanitizeToolNames(tools),
    };

    // Add provider-specific options
    if (aiProviderType === "openrouter") {
      generateOptions.providerOptions = {
        // Request provider reasoning when supported (OpenRouter)
        openrouter: { include_reasoning: true },
      };
    }

    result = await generateText(generateOptions);
  } catch (error) {
    const err = error as any;
    const providerMsg =
      err?.data?.error?.message || err?.message || "Unknown provider error";
    const friendly = providerMsg.includes("maximum context length")
      ? "The request exceeded the model's context window. I've enabled aggressive truncation for tool outputs and will keep listings/results concise. Please try your request again with narrower scope if listing huge folders."
      : providerMsg;

    // Return a safe fallback response and preserve message history
    return {
      text: `⚠️ Agent error: ${friendly}`,
      reasoning: undefined,
      messages: [
        ...history,
        { role: "user", content: userInstruction },
        { role: "assistant", content: `Error: ${friendly}` },
      ] as ModelMessage[],
    };
  }

  // Best-effort extraction of provider reasoning across providers
  const extractReasoning = (r: any): string | undefined => {
    try {
      // Common locations to attempt
      if (typeof r?.reasoning === "string") return r.reasoning;
      if (typeof r?.response?.reasoning === "string")
        return r.response.reasoning;
      // Some providers may attach to the last assistant message
      const msgs = r?.response?.messages;
      if (Array.isArray(msgs)) {
        const lastAssistant = [...msgs]
          .reverse()
          .find((m: any) => m?.role === "assistant");
        if (typeof lastAssistant?.reasoning === "string")
          return lastAssistant.reasoning;
        if (typeof lastAssistant?.metadata?.reasoning === "string")
          return lastAssistant.metadata.reasoning;
      }
    } catch {}
    return undefined;
  };
  const reasoning = extractReasoning(result);

  const responseMessages = (result as any)?.response?.messages as
    | ModelMessage[]
    | undefined;
  if (
    responseMessages &&
    Array.isArray(responseMessages) &&
    responseMessages.length > 0
  ) {
    // Filter out 'user' and 'system' messages from provider response to avoid duplicates
    const providerAssistantMessages = responseMessages.filter(
      (m) =>
        m &&
        typeof m === "object" &&
        "role" in m &&
        (m.role === "assistant" || m.role === "tool")
    );
    // Append the new user message and provider assistant/tool messages to existing history
    return {
      text: result.text,
      reasoning,
      messages: [
        ...history,
        { role: "user", content: userInstruction },
        ...providerAssistantMessages,
      ] as ModelMessage[],
    };
  }
  // Fallback: append a simple assistant response
  return {
    text: result.text,
    reasoning,
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
