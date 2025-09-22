import { type ModelMessage } from "ai";
import { generateText } from "ai";
import { openrouter } from "./agents/system.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

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
  importance: 'low' | 'medium' | 'high';
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

/**
 * Rough token estimation for OpenAI-compatible models
 * More accurate than character count, less accurate than tiktoken
 */
function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English text
  // Account for special tokens, formatting, etc.
  const baseTokens = Math.ceil(text.length / 4);
  
  // Add extra tokens for JSON structure, tool calls, etc.
  const jsonMatches = text.match(/[{}[\]",:]/g);
  const extraTokens = jsonMatches ? Math.ceil(jsonMatches.length / 10) : 0;
  
  return baseTokens + extraTokens;
}

/**
 * Estimate tokens for a ModelMessage
 */
function estimateMessageTokens(message: ModelMessage): number {
  let tokens = 0;
  
  // Role token
  tokens += 1;
  
  // Content tokens
  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (typeof part === 'string') {
        tokens += estimateTokens(part);
      } else if (part && typeof part === 'object') {
        tokens += estimateTokens(JSON.stringify(part));
      }
    }
  }
  
  // Tool calls and results
  if ('toolInvocations' in message && message.toolInvocations) {
    tokens += estimateTokens(JSON.stringify(message.toolInvocations));
  }
  
  return tokens;
}

export class ContextManager {
  private config: ContextManagerConfig;
  private conversationSegments: ConversationSegment[] = [];
  private segmentCounter = 0;

  constructor(config?: Partial<ContextManagerConfig>) {
    this.config = {
      maxContextTokens: 230000, // 230k token limit
      targetContextTokens: 200000, // Start summarizing at 200k
      recentMessagesCount: 10, // Always keep last 10 messages
      summaryModel: process.env.SUB_AGENT_MODEL_ID || "openai/gpt",
      contextDir: path.join(os.homedir(), '.kalpana', 'context'),
      ...config
    };
    
    this.ensureContextDir();
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
    systemPrompt: string
  ): Promise<ContextWindow> {
    const systemPromptTokens = estimateTokens(systemPrompt);
    let totalTokens = systemPromptTokens;
    
    // Calculate tokens for all messages
    const messageTokens = messages.map(msg => ({
      message: msg,
      tokens: estimateMessageTokens(msg)
    }));
    
    totalTokens += messageTokens.reduce((sum, item) => sum + item.tokens, 0);
    
    // Add tokens from summarized segments
    const summarizedTokens = this.conversationSegments.reduce(
      (sum, segment) => sum + (segment.summary ? estimateTokens(segment.summary) : 0), 
      0
    );
    totalTokens += summarizedTokens;

    return {
      totalTokens,
      maxTokens: this.config.maxContextTokens,
      recentMessages: messages,
      summarizedSegments: this.conversationSegments,
      systemPromptTokens
    };
  }

  /**
   * Manage context by summarizing older segments if needed
   */
  async manageContext(
    messages: ModelMessage[], 
    systemPrompt: string
  ): Promise<ModelMessage[]> {
    const contextWindow = await this.analyzeContext(messages, systemPrompt);
    
    // If we're under the target, no action needed
    if (contextWindow.totalTokens <= this.config.targetContextTokens) {
      return messages;
    }
    
    // Keep recent messages (never summarize these)
    const recentMessages = messages.slice(-this.config.recentMessagesCount);
    const olderMessages = messages.slice(0, -this.config.recentMessagesCount);
    
    if (olderMessages.length === 0) {
      return messages;
    }

    // Group older messages into segments for summarization
    const segmentsToSummarize = this.groupMessagesIntoSegments(olderMessages);
    
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
    
    // Return summary + recent messages
    const managedMessages = [...summaryMessages, ...recentMessages];
    
    return managedMessages;
  }

  /**
   * Group messages into logical segments for summarization
   */
  private groupMessagesIntoSegments(messages: ModelMessage[]): ConversationSegment[] {
    const segments: ConversationSegment[] = [];
    const segmentSize = 8; // Messages per segment
    
    for (let i = 0; i < messages.length; i += segmentSize) {
      const segmentMessages = messages.slice(i, i + segmentSize);
      const tokenCount = segmentMessages.reduce(
        (sum, msg) => sum + estimateMessageTokens(msg), 
        0
      );
      
      segments.push({
        id: `segment_${++this.segmentCounter}_${Date.now()}`,
        timestamp: Date.now(),
        messages: segmentMessages,
        tokenCount,
        importance: this.assessSegmentImportance(segmentMessages)
      });
    }
    
    return segments;
  }

  /**
   * Assess the importance of a conversation segment
   */
  private assessSegmentImportance(messages: ModelMessage[]): 'low' | 'medium' | 'high' {
    const content = messages.map(m => 
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    ).join(' ').toLowerCase();
    
    // High importance indicators
    const highImportanceKeywords = [
      'error', 'critical', 'important', 'config', 'setup', 'install',
      'api key', 'authentication', 'database', 'security', 'deploy'
    ];
    
    // Medium importance indicators
    const mediumImportanceKeywords = [
      'create', 'build', 'implement', 'fix', 'update', 'modify',
      'function', 'class', 'method', 'variable'
    ];
    
    const highMatches = highImportanceKeywords.filter(keyword => 
      content.includes(keyword)
    ).length;
    
    const mediumMatches = mediumImportanceKeywords.filter(keyword => 
      content.includes(keyword)
    ).length;
    
    if (highMatches >= 2) return 'high';
    if (highMatches >= 1 || mediumMatches >= 3) return 'medium';
    return 'low';
  }

  /**
   * Summarize a conversation segment using AI
   */
  private async summarizeSegment(segment: ConversationSegment): Promise<void> {
    try {
      const model = openrouter(this.config.summaryModel);
      
      const conversationText = segment.messages.map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      }).join('\n\n');

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
        messages: [{ role: 'user', content: summaryPrompt }],
        system: 'You are a helpful assistant that creates concise but comprehensive summaries of technical conversations.'
      });

      // Parse the response
      const lines = result.text.split('\n');
      let summary = '';
      let keyPoints: string[] = [];
      let currentSection = '';

      for (const line of lines) {
        if (line.startsWith('SUMMARY:')) {
          currentSection = 'summary';
          summary = line.replace('SUMMARY:', '').trim();
        } else if (line.startsWith('KEY_POINTS:')) {
          currentSection = 'keyPoints';
        } else if (currentSection === 'summary' && line.trim()) {
          summary += ' ' + line.trim();
        } else if (currentSection === 'keyPoints' && line.trim()) {
          if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
            keyPoints.push(line.trim().substring(1).trim());
          } else if (line.trim()) {
            keyPoints.push(line.trim());
          }
        }
      }

      segment.summary = summary || result.text.substring(0, 500);
      segment.keyPoints = keyPoints.length > 0 ? keyPoints : [result.text.substring(0, 200)];
      
    } catch (error) {
      // Fallback: create a basic summary
      segment.summary = `Conversation segment with ${segment.messages.length} messages`;
      segment.keyPoints = ['Summary generation failed - raw messages preserved'];
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
    const highImportance = this.conversationSegments.filter(s => s.importance === 'high');
    const mediumImportance = this.conversationSegments.filter(s => s.importance === 'medium');
    const lowImportance = this.conversationSegments.filter(s => s.importance === 'low');

    let contextSummary = '## Previous Conversation Context\n\n';
    
    if (highImportance.length > 0) {
      contextSummary += '### Important Discussions:\n';
      for (const segment of highImportance) {
        contextSummary += `- ${segment.summary}\n`;
        if (segment.keyPoints) {
          contextSummary += segment.keyPoints.map(point => `  • ${point}`).join('\n') + '\n';
        }
      }
      contextSummary += '\n';
    }

    if (mediumImportance.length > 0) {
      contextSummary += '### Recent Work:\n';
      for (const segment of mediumImportance) {
        contextSummary += `- ${segment.summary}\n`;
      }
      contextSummary += '\n';
    }

    if (lowImportance.length > 0) {
      contextSummary += `### Earlier Discussion: ${lowImportance.length} segments covering general conversation\n\n`;
    }

    contextSummary += `*This summary represents ${this.conversationSegments.length} conversation segments to maintain context within token limits.*`;

    return [{
      role: 'system' as const,
      content: contextSummary
    }];
  }

  /**
   * Save context state to disk for persistence
   */
  async saveContext(sessionId: string): Promise<void> {
    try {
      const contextFile = path.join(this.config.contextDir, `${sessionId}.json`);
      const contextData = {
        segments: this.conversationSegments,
        timestamp: Date.now(),
        segmentCounter: this.segmentCounter
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
      const contextFile = path.join(this.config.contextDir, `${sessionId}.json`);
      const contextData = JSON.parse(await fs.readFile(contextFile, 'utf8'));
      
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
      high: this.conversationSegments.filter(s => s.importance === 'high').length,
      medium: this.conversationSegments.filter(s => s.importance === 'medium').length,
      low: this.conversationSegments.filter(s => s.importance === 'low').length
    };

    return {
      segmentCount: this.conversationSegments.length,
      totalSummarizedMessages: this.conversationSegments.reduce(
        (sum, segment) => sum + segment.messages.length, 
        0
      ),
      importanceBreakdown
    };
  }

  /**
   * Search through summarized context
   */
  searchContext(query: string): ConversationSegment[] {
    const queryLower = query.toLowerCase();
    
    return this.conversationSegments.filter(segment => {
      const summaryMatch = segment.summary?.toLowerCase().includes(queryLower);
      const keyPointsMatch = segment.keyPoints?.some(point => 
        point.toLowerCase().includes(queryLower)
      );
      
      return summaryMatch || keyPointsMatch;
    });
  }

  /**
   * Clear old context segments (cleanup)
   */
  clearOldSegments(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    const initialCount = this.conversationSegments.length;
    
    this.conversationSegments = this.conversationSegments.filter(
      segment => segment.timestamp > cutoff
    );
    
    const removedCount = initialCount - this.conversationSegments.length;
  }
}

// Global context manager instance
export const contextManager = new ContextManager();
