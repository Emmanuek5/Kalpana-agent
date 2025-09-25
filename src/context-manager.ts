import { type ModelMessage } from "ai";
import { generateText, generateObject } from "ai";
import { getAIProvider } from "./agents/system.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { estimateTokens, estimateMessageTokens } from "./token-counter.js";

/**
 * Context Management System for Kalpana
 *
 * Manages conversation context to stay within the 230k token limit by:
 * 1. Monitoring token usage in real-time
 * 2. Summarizing older conversation segments
 * 3. Maintaining key information and recent context
 * 4. Providing retrieval capabilities for summarized content
 */

export interface ConversationSegment {
  id: string;
  timestamp: number;
  messages: ModelMessage[];
  summary?: string;
  keyPoints?: string[];
  tokenCount: number;
  importance: "low" | "medium" | "high";
  assessment?: ImportanceAssessment; // Structured assessment data
}

export interface ContextWindow {
  totalTokens: number;
  maxTokens: number;
  recentMessages: ModelMessage[];
  summarizedSegments: ConversationSegment[];
  systemPromptTokens: number;
}

export interface ContextManagerConfig {
  maxContextTokens: number;
  targetContextTokens: number; // When to start summarizing
  recentMessagesCount: number; // Always keep this many recent messages
  summaryModel: string;
  contextDir: string;
}

// Schema for structured importance assessment
const ImportanceAssessmentSchema = z.object({
  importance: z
    .enum(["low", "medium", "high"])
    .describe("Overall importance level of the conversation segment"),
  reasoning: z.string().describe("Brief explanation for the importance rating"),
  keyTopics: z.array(z.string()).describe("Main topics or themes discussed"),
  technicalContent: z
    .boolean()
    .describe("Whether the segment contains significant technical content"),
  errorOrIssues: z
    .boolean()
    .describe(
      "Whether the segment discusses errors, problems, or critical issues"
    ),
  configurationChanges: z
    .boolean()
    .describe("Whether configuration, setup, or installation is discussed"),
  codeOrImplementation: z
    .boolean()
    .describe("Whether code implementation or development work is discussed"),
  confidenceScore: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence in the importance assessment (0-1)"),
});

type ImportanceAssessment = z.infer<typeof ImportanceAssessmentSchema>;

export class ContextManager {
  private config: ContextManagerConfig;
  private conversationSegments: ConversationSegment[] = [];
  private segmentCounter = 0;

  constructor(config?: Partial<ContextManagerConfig>) {
    this.config = {
      maxContextTokens: 230000, // 230k token limit
      targetContextTokens: 225000, // Start summarizing very close to limit (98%)
      recentMessagesCount: 0, // Don't preserve any specific number - keep all until limit
      summaryModel: process.env.SUB_AGENT_MODEL_ID || "openai/gpt-4o",
      contextDir: path.join(os.homedir(), ".kalpana", "context"),
      ...config,
    };

    this.ensureContextDir();
  }

  /**
   * Force summarization of the provided messages regardless of token usage.
   * Clears existing stored segments and rebuilds them from the given messages.
   * Returns a set of summary messages suitable for injecting into context.
   */
  async forceSummarizeAll(
    messages: ModelMessage[],
    modelId: string = this.config.summaryModel
  ): Promise<ModelMessage[]> {
    // Reset stored segments and counter
    this.conversationSegments = [];
    this.segmentCounter = 0;

    // Group and summarize all messages
    const segments = await this.groupMessagesIntoSegments(messages);
    for (const segment of segments) {
      await this.summarizeSegment(segment);
    }
    this.conversationSegments.push(...segments);

    // Create and return summary messages
    const summaryMessages = await this.createSummaryMessages();
    return summaryMessages;
  }

  /**
   * Save the entire raw message history for this session to disk
   */
  async saveMessages(
    sessionId: string,
    messages: ModelMessage[]
  ): Promise<string> {
    await this.ensureContextDir();
    const filePath = path.join(
      this.config.contextDir,
      `messages_${sessionId}.json`
    );
    const payload = {
      sessionId,
      timestamp: Date.now(),
      modelId: this.config.summaryModel,
      messages,
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  }

  private async ensureContextDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.contextDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Analyze current context window and determine if summarization is needed
   */
  async analyzeContext(
    messages: ModelMessage[],
    systemPrompt: string,
    modelId: string = this.config.summaryModel
  ): Promise<ContextWindow> {
    const systemPromptTokens = estimateTokens(
      systemPrompt,
      modelId,
      true
    ).tokens;
    let totalTokens = systemPromptTokens;

    // Calculate tokens for all messages
    const messageTokens = messages.map((msg) => ({
      message: msg,
      tokens: estimateMessageTokens(msg, modelId).tokens,
    }));

    totalTokens += messageTokens.reduce((sum, item) => sum + item.tokens, 0);

    // Add tokens from summarized segments
    const summarizedTokens = this.conversationSegments.reduce(
      (sum, segment) =>
        sum +
        (segment.summary ? estimateTokens(segment.summary, modelId).tokens : 0),
      0
    );
    totalTokens += summarizedTokens;

    return {
      totalTokens,
      maxTokens: this.config.maxContextTokens,
      recentMessages: messages,
      summarizedSegments: this.conversationSegments,
      systemPromptTokens,
    };
  }

  /**
   * Manage context by summarizing older segments if needed
   */
  async manageContext(
    messages: ModelMessage[],
    systemPrompt: string,
    modelId: string = this.config.summaryModel
  ): Promise<ModelMessage[]> {
    const contextWindow = await this.analyzeContext(
      messages,
      systemPrompt,
      modelId
    );

    // If we're under the target, no action needed - keep all messages
    if (contextWindow.totalTokens <= this.config.targetContextTokens) {
      return messages;
    }

    // We've hit the limit - need to summarize oldest messages to make room
    // Calculate how many tokens we need to free up
    const targetTokens =
      contextWindow.totalTokens > this.config.maxContextTokens
        ? Math.min(
            this.config.targetContextTokens,
            this.config.maxContextTokens * 0.7
          ) // Emergency: aim for 70% of max
        : this.config.targetContextTokens;

    const excessTokens = contextWindow.totalTokens - targetTokens;
    const safetyMargin = 5000; // Extra buffer for response generation
    const tokensToFree = excessTokens + safetyMargin;

    // Start from the oldest messages and summarize until we free enough tokens
    let tokensSaved = 0;
    let messagesToSummarize: ModelMessage[] = [];
    let remainingMessages = [...messages];

    // Work from oldest to newest, summarizing messages until we have enough space
    for (let i = 0; i < messages.length && tokensSaved < tokensToFree; i++) {
      const message = messages[i];
      if (!message) continue; // Skip undefined messages

      const messageTokens = estimateMessageTokens(message, modelId).tokens;
      messagesToSummarize.push(message);
      tokensSaved += messageTokens;
      remainingMessages = messages.slice(i + 1);
    }

    // If we need to summarize everything (edge case), keep at least the last 5 messages
    if (remainingMessages.length < 5 && messages.length > 5) {
      const keepCount = Math.min(5, messages.length);
      remainingMessages = messages.slice(-keepCount);
      messagesToSummarize = messages.slice(0, -keepCount);
    }

    // Group messages to summarize into segments
    if (messagesToSummarize.length > 0) {
      const segmentsToSummarize = await this.groupMessagesIntoSegments(
        messagesToSummarize
      );

      // Summarize each segment
      for (const segment of segmentsToSummarize) {
        if (!segment.summary) {
          await this.summarizeSegment(segment);
        }
      }

      // Add to our stored segments
      this.conversationSegments.push(...segmentsToSummarize);

      // Create context-aware summary messages
      const summaryMessages = await this.createSummaryMessages();

      // Return summary + remaining messages
      return [...summaryMessages, ...remainingMessages];
    }

    // If no summarization was needed (shouldn't happen), return original messages
    return messages;
  }

  /**
   * Group messages into logical segments for summarization
   */
  private async groupMessagesIntoSegments(
    messages: ModelMessage[]
  ): Promise<ConversationSegment[]> {
    const segments: ConversationSegment[] = [];
    const segmentSize = 8; // Messages per segment

    for (let i = 0; i < messages.length; i += segmentSize) {
      const segmentMessages = messages.slice(i, i + segmentSize);
      const tokenCount = segmentMessages.reduce(
        (sum, msg) =>
          sum + estimateMessageTokens(msg, this.config.summaryModel).tokens,
        0
      );

      // Assess importance using structured AI analysis
      const { importance, assessment } = await this.assessSegmentImportance(
        segmentMessages
      );

      segments.push({
        id: `segment_${++this.segmentCounter}_${Date.now()}`,
        timestamp: Date.now(),
        messages: segmentMessages,
        tokenCount,
        importance,
        assessment,
      });
    }

    return segments;
  }

  /**
   * Assess the importance of a conversation segment using structured AI analysis
   */
  private async assessSegmentImportance(messages: ModelMessage[]): Promise<{
    importance: "low" | "medium" | "high";
    assessment: ImportanceAssessment;
  }> {
    const conversationText = messages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join("\n\n");

    try {
      const aiProvider = getAIProvider();
      const aiProviderType = process.env.AI_PROVIDER || "openrouter";

      let modelId: string;
      if (aiProviderType === "ollama") {
        modelId =
          process.env.OLLAMA_MODEL || this.config.summaryModel || "llama3.2";
      } else {
        modelId = this.config.summaryModel;
      }

      const model = aiProvider.languageModel(modelId);

      const { object: assessment } = await generateObject({
        model,
        schema: ImportanceAssessmentSchema,
        prompt: `Analyze this conversation segment and assess its importance for future reference.

CONVERSATION SEGMENT:
${conversationText}

Consider the following factors:
- Technical complexity and depth
- Problem-solving and troubleshooting content
- Configuration, setup, or installation steps
- Code implementation and development work
- Error resolution and critical issues
- Strategic decisions and important discussions
- Educational or reference value for future conversations

Provide a structured assessment with reasoning for the importance level.`,
        system:
          "You are an expert at analyzing technical conversations and determining their importance for context management. Focus on identifying content that would be valuable to preserve and reference later.",
      });

      return {
        importance: assessment.importance,
        assessment,
      };
    } catch (error) {
      // Fallback to simple keyword-based assessment
      console.warn(
        `Warning: Structured importance assessment failed, using fallback: ${
          (error as Error).message
        }`
      );

      const content = conversationText.toLowerCase();

      // High importance indicators
      const highImportanceKeywords = [
        "error",
        "critical",
        "important",
        "config",
        "setup",
        "install",
        "api key",
        "authentication",
        "database",
        "security",
        "deploy",
      ];

      // Medium importance indicators
      const mediumImportanceKeywords = [
        "create",
        "build",
        "implement",
        "fix",
        "update",
        "modify",
        "function",
        "class",
        "method",
        "variable",
      ];

      const highMatches = highImportanceKeywords.filter((keyword) =>
        content.includes(keyword)
      ).length;

      const mediumMatches = mediumImportanceKeywords.filter((keyword) =>
        content.includes(keyword)
      ).length;

      let importance: "low" | "medium" | "high" = "low";
      if (highMatches >= 2) importance = "high";
      else if (highMatches >= 1 || mediumMatches >= 3) importance = "medium";

      // Create fallback assessment
      const fallbackAssessment: ImportanceAssessment = {
        importance,
        reasoning:
          "Fallback keyword-based assessment due to AI analysis failure",
        keyTopics: [],
        technicalContent: mediumMatches > 0,
        errorOrIssues:
          content.includes("error") || content.includes("critical"),
        configurationChanges:
          content.includes("config") || content.includes("setup"),
        codeOrImplementation:
          content.includes("function") || content.includes("class"),
        confidenceScore: 0.5,
      };

      return {
        importance,
        assessment: fallbackAssessment,
      };
    }
  }

  /**
   * Summarize a conversation segment using AI
   */
  private async summarizeSegment(segment: ConversationSegment): Promise<void> {
    try {
      const aiProvider = getAIProvider();
      const aiProviderType = process.env.AI_PROVIDER || "openrouter";

      let modelId: string;
      if (aiProviderType === "ollama") {
        modelId =
          process.env.OLLAMA_MODEL || this.config.summaryModel || "llama3.2";
      } else {
        modelId = this.config.summaryModel;
      }

      const model = aiProvider.languageModel(modelId);

      const conversationText = segment.messages
        .map((msg) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          const content =
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content);
          return `${role}: ${content}`;
        })
        .join("\n\n");

      const summaryPrompt = `You are summarizing a conversation segment for context management. 

CONVERSATION SEGMENT:
${conversationText}

Please provide:
1. A concise summary (2-3 sentences) of what was discussed and accomplished
2. Key technical details, configurations, or decisions that should be remembered
3. Any important context for future conversations

Focus on preserving information that would be valuable for continuing the conversation later.

Format your response as:
SUMMARY: [concise summary]
KEY_POINTS: [bullet points of important details]`;

      const result = await generateText({
        model,
        messages: [{ role: "user", content: summaryPrompt }],
        system:
          "You are a helpful assistant that creates concise but comprehensive summaries of technical conversations.",
      });

      // Parse the response
      const lines = result.text.split("\n");
      let summary = "";
      let keyPoints: string[] = [];
      let currentSection = "";

      for (const line of lines) {
        if (line.startsWith("SUMMARY:")) {
          currentSection = "summary";
          summary = line.replace("SUMMARY:", "").trim();
        } else if (line.startsWith("KEY_POINTS:")) {
          currentSection = "keyPoints";
        } else if (currentSection === "summary" && line.trim()) {
          summary += " " + line.trim();
        } else if (currentSection === "keyPoints" && line.trim()) {
          if (line.trim().startsWith("-") || line.trim().startsWith("•")) {
            keyPoints.push(line.trim().substring(1).trim());
          } else if (line.trim()) {
            keyPoints.push(line.trim());
          }
        }
      }

      segment.summary = summary || result.text.substring(0, 500);
      segment.keyPoints =
        keyPoints.length > 0 ? keyPoints : [result.text.substring(0, 200)];
    } catch (error) {
      // Fallback: create a basic summary
      segment.summary = `Conversation segment with ${segment.messages.length} messages`;
      segment.keyPoints = [
        "Summary generation failed - raw messages preserved",
      ];
    }
  }

  /**
   * Create summary messages to inject into context
   */
  private async createSummaryMessages(): Promise<ModelMessage[]> {
    if (this.conversationSegments.length === 0) {
      return [];
    }

    // Group segments by importance
    const highImportance = this.conversationSegments.filter(
      (s) => s.importance === "high"
    );
    const mediumImportance = this.conversationSegments.filter(
      (s) => s.importance === "medium"
    );
    const lowImportance = this.conversationSegments.filter(
      (s) => s.importance === "low"
    );

    let contextSummary = "## Previous Conversation Context\n\n";

    if (highImportance.length > 0) {
      contextSummary += "### Important Discussions:\n";
      for (const segment of highImportance) {
        contextSummary += `- ${segment.summary}\n`;
        if (
          segment.assessment?.keyTopics &&
          segment.assessment.keyTopics.length > 0
        ) {
          contextSummary += `  📚 Topics: ${segment.assessment.keyTopics.join(
            ", "
          )}\n`;
        }
        if (segment.keyPoints) {
          contextSummary +=
            segment.keyPoints.map((point) => `  • ${point}`).join("\n") + "\n";
        }
        if (segment.assessment?.reasoning) {
          contextSummary += `  🧠 Why important: ${segment.assessment.reasoning}\n`;
        }
        contextSummary += "\n";
      }
    }

    if (mediumImportance.length > 0) {
      contextSummary += "### Recent Work:\n";
      for (const segment of mediumImportance) {
        contextSummary += `- ${segment.summary}\n`;
        if (
          segment.assessment?.keyTopics &&
          segment.assessment.keyTopics.length > 0
        ) {
          contextSummary += `  📚 Topics: ${segment.assessment.keyTopics.join(
            ", "
          )}\n`;
        }
      }
      contextSummary += "\n";
    }

    if (lowImportance.length > 0) {
      contextSummary += `### Earlier Discussion: ${lowImportance.length} segments covering general conversation\n\n`;
    }

    contextSummary += `*This summary represents ${this.conversationSegments.length} conversation segments to maintain context within token limits.*`;

    return [
      {
        role: "assistant" as const,
        content: `Here's a summary of our previous conversation to maintain context:\n\n${contextSummary}`,
      },
    ];
  }

  /**
   * Save context state to disk for persistence
   */
  async saveContext(sessionId: string): Promise<void> {
    try {
      const contextFile = path.join(
        this.config.contextDir,
        `${sessionId}.json`
      );
      const contextData = {
        segments: this.conversationSegments,
        timestamp: Date.now(),
        segmentCounter: this.segmentCounter,
      };

      await fs.writeFile(contextFile, JSON.stringify(contextData, null, 2));
    } catch (error) {
      // Silent failure - context saving is not critical
    }
  }

  /**
   * Load context state from disk
   */
  async loadContext(sessionId: string): Promise<void> {
    try {
      const contextFile = path.join(
        this.config.contextDir,
        `${sessionId}.json`
      );
      const contextData = JSON.parse(await fs.readFile(contextFile, "utf8"));

      this.conversationSegments = contextData.segments || [];
      this.segmentCounter = contextData.segmentCounter || 0;
    } catch (error) {
      // Context file doesn't exist or is invalid - start fresh
    }
  }

  /**
   * Get context statistics
   */
  getContextStats(): {
    segmentCount: number;
    totalSummarizedMessages: number;
    importanceBreakdown: Record<string, number>;
  } {
    const importanceBreakdown = {
      high: this.conversationSegments.filter((s) => s.importance === "high")
        .length,
      medium: this.conversationSegments.filter((s) => s.importance === "medium")
        .length,
      low: this.conversationSegments.filter((s) => s.importance === "low")
        .length,
    };

    return {
      segmentCount: this.conversationSegments.length,
      totalSummarizedMessages: this.conversationSegments.reduce(
        (sum, segment) => sum + segment.messages.length,
        0
      ),
      importanceBreakdown,
    };
  }

  /**
   * Search through summarized context
   */
  searchContext(query: string): ConversationSegment[] {
    const queryLower = query.toLowerCase();

    return this.conversationSegments.filter((segment) => {
      const summaryMatch = segment.summary?.toLowerCase().includes(queryLower);
      const keyPointsMatch = segment.keyPoints?.some((point) =>
        point.toLowerCase().includes(queryLower)
      );
      const topicsMatch = segment.assessment?.keyTopics?.some((topic) =>
        topic.toLowerCase().includes(queryLower)
      );
      const reasoningMatch = segment.assessment?.reasoning
        ?.toLowerCase()
        .includes(queryLower);

      return summaryMatch || keyPointsMatch || topicsMatch || reasoningMatch;
    });
  }

  /**
   * Clear old context segments (cleanup)
   */
  clearOldSegments(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    const initialCount = this.conversationSegments.length;

    this.conversationSegments = this.conversationSegments.filter(
      (segment) => segment.timestamp > cutoff
    );

    const removedCount = initialCount - this.conversationSegments.length;
  }
}

// Global context manager instance
export const contextManager = new ContextManager();
