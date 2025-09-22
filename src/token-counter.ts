import { type ModelMessage } from "ai";

/**
 * Token Counting Utilities for Kalpana Context Management
 * 
 * Provides accurate token estimation for different model families
 * without requiring external dependencies like tiktoken
 */

export interface TokenEstimate {
  tokens: number;
  characters: number;
  method: 'gpt' | 'claude' | 'generic';
}

/**
 * Model-specific token estimation patterns
 */
const MODEL_PATTERNS = {
  gpt: {
    // OpenAI GPT models (GPT-3.5, GPT-4, etc.)
    baseRatio: 4, // ~4 chars per token
    jsonOverhead: 0.1, // 10% overhead for JSON structure
    toolCallOverhead: 0.15, // 15% overhead for tool calls
    systemPromptMultiplier: 1.05 // System prompts are slightly more token-dense
  },
  claude: {
    // Anthropic Claude models
    baseRatio: 3.8, // Slightly more efficient tokenization
    jsonOverhead: 0.08,
    toolCallOverhead: 0.12,
    systemPromptMultiplier: 1.03
  },
  generic: {
    // Generic estimation for unknown models
    baseRatio: 4.2, // Conservative estimate
    jsonOverhead: 0.12,
    toolCallOverhead: 0.18,
    systemPromptMultiplier: 1.1
  }
};

/**
 * Detect model family from model ID
 */
function detectModelFamily(modelId: string): keyof typeof MODEL_PATTERNS {
  const id = modelId.toLowerCase();
  
  if (id.includes('gpt') || id.includes('openai')) {
    return 'gpt';
  }
  
  if (id.includes('claude') || id.includes('anthropic')) {
    return 'claude';
  }
  
  return 'generic';
}

/**
 * Count special tokens in text that affect tokenization
 */
function countSpecialTokens(text: string): {
  jsonTokens: number;
  codeTokens: number;
  markdownTokens: number;
  unicodeTokens: number;
} {
  const codeBlocks: string[] = text.match(/```[\s\S]*?```/g) || [];
  const codeTokenCount: number = codeBlocks.reduce((sum: number, block: string) => sum + block.length, 0);

  return {
    // JSON structure tokens
    jsonTokens: (text.match(/[{}[\]",:]/g) || []).length,
    
    // Code block tokens (often tokenized differently)
    codeTokens: codeTokenCount,
    
    // Markdown formatting tokens
    markdownTokens: (text.match(/[*_`#\-+>|]/g) || []).length,
    
    // Unicode characters (may use more tokens)
    unicodeTokens: (text.match(/[^\x00-\x7F]/g) || []).length
  };
}

/**
 * Estimate tokens for a text string
 */
export function estimateTokens(
  text: string, 
  modelId: string = 'generic',
  isSystemPrompt: boolean = false
): TokenEstimate {
  const family = detectModelFamily(modelId);
  const patterns = MODEL_PATTERNS[family];
  
  // Base token estimation
  let tokens = Math.ceil(text.length / patterns.baseRatio);
  
  // Adjust for special tokens
  const specialTokens = countSpecialTokens(text);
  
  // JSON overhead
  tokens += Math.ceil(specialTokens.jsonTokens * patterns.jsonOverhead);
  
  // Code blocks are often more token-dense
  if (specialTokens.codeTokens > 0) {
    tokens += Math.ceil(specialTokens.codeTokens / 3); // Code is ~3 chars per token
  }
  
  // Markdown formatting
  tokens += Math.ceil(specialTokens.markdownTokens * 0.5);
  
  // Unicode characters often use more tokens
  tokens += Math.ceil(specialTokens.unicodeTokens * 0.3);
  
  // System prompt adjustment
  if (isSystemPrompt) {
    tokens = Math.ceil(tokens * patterns.systemPromptMultiplier);
  }
  
  return {
    tokens,
    characters: text.length,
    method: family
  };
}

/**
 * Estimate tokens for a ModelMessage
 */
export function estimateMessageTokens(
  message: ModelMessage, 
  modelId: string = 'generic'
): TokenEstimate {
  const family = detectModelFamily(modelId);
  const patterns = MODEL_PATTERNS[family];
  
  let totalTokens = 0;
  let totalChars = 0;
  
  // Role token (always 1 token)
  totalTokens += 1;
  
  // Content tokens
  if (typeof message.content === 'string') {
    const estimate = estimateTokens(message.content, modelId, message.role === 'system');
    totalTokens += estimate.tokens;
    totalChars += estimate.characters;
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (typeof part === 'string') {
        const estimate = estimateTokens(part, modelId);
        totalTokens += estimate.tokens;
        totalChars += estimate.characters;
      } else if (part && typeof part === 'object') {
        const partStr = JSON.stringify(part);
        const estimate = estimateTokens(partStr, modelId);
        totalTokens += estimate.tokens;
        totalChars += estimate.characters;
      }
    }
  }
  
  // Tool invocations (if present)
  if ('toolInvocations' in message && message.toolInvocations) {
    const toolStr = JSON.stringify(message.toolInvocations);
    const toolEstimate = estimateTokens(toolStr, modelId);
    
    // Apply tool call overhead
    const toolTokens = Math.ceil(toolEstimate.tokens * (1 + patterns.toolCallOverhead));
    totalTokens += toolTokens;
    totalChars += toolEstimate.characters;
  }
  
  return {
    tokens: totalTokens,
    characters: totalChars,
    method: family
  };
}

/**
 * Estimate tokens for an array of messages
 */
export function estimateConversationTokens(
  messages: ModelMessage[], 
  modelId: string = 'generic'
): TokenEstimate {
  let totalTokens = 0;
  let totalChars = 0;
  
  for (const message of messages) {
    const estimate = estimateMessageTokens(message, modelId);
    totalTokens += estimate.tokens;
    totalChars += estimate.characters;
  }
  
  // Add conversation overhead (message boundaries, etc.)
  const conversationOverhead = Math.ceil(messages.length * 2); // ~2 tokens per message boundary
  totalTokens += conversationOverhead;
  
  return {
    tokens: totalTokens,
    characters: totalChars,
    method: detectModelFamily(modelId)
  };
}

/**
 * Calculate remaining context window space
 */
export function calculateRemainingContext(
  messages: ModelMessage[],
  systemPrompt: string,
  maxTokens: number,
  modelId: string = 'generic'
): {
  used: number;
  remaining: number;
  percentage: number;
  systemTokens: number;
  messageTokens: number;
} {
  const systemEstimate = estimateTokens(systemPrompt, modelId, true);
  const messageEstimate = estimateConversationTokens(messages, modelId);
  
  const used = systemEstimate.tokens + messageEstimate.tokens;
  const remaining = Math.max(0, maxTokens - used);
  const percentage = (used / maxTokens) * 100;
  
  return {
    used,
    remaining,
    percentage,
    systemTokens: systemEstimate.tokens,
    messageTokens: messageEstimate.tokens
  };
}

/**
 * Predict if adding a new message would exceed context limit
 */
export function wouldExceedContext(
  currentMessages: ModelMessage[],
  newMessage: string,
  systemPrompt: string,
  maxTokens: number,
  modelId: string = 'generic',
  safetyMargin: number = 1000 // Reserve tokens for response
): boolean {
  const current = calculateRemainingContext(
    currentMessages, 
    systemPrompt, 
    maxTokens, 
    modelId
  );
  
  const newMessageTokens = estimateTokens(newMessage, modelId).tokens;
  const projectedUsage = current.used + newMessageTokens + safetyMargin;
  
  return projectedUsage > maxTokens;
}

/**
 * Find optimal truncation point to fit within token limit
 */
export function findTruncationPoint(
  messages: ModelMessage[],
  systemPrompt: string,
  maxTokens: number,
  modelId: string = 'generic',
  safetyMargin: number = 1000
): {
  keepFromIndex: number;
  truncatedMessages: ModelMessage[];
  tokensSaved: number;
} {
  const systemTokens = estimateTokens(systemPrompt, modelId, true).tokens;
  const targetTokens = maxTokens - systemTokens - safetyMargin;
  
  let currentTokens = 0;
  let keepFromIndex = messages.length;
  
  // Work backwards from the most recent messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const messageTokens = estimateMessageTokens(message, modelId).tokens;
    
    if (currentTokens + messageTokens > targetTokens) {
      keepFromIndex = i + 1;
      break;
    }
    
    currentTokens += messageTokens;
    keepFromIndex = i;
  }
  
  const truncatedMessages = messages.slice(keepFromIndex);
  const originalTokens = estimateConversationTokens(messages, modelId).tokens;
  const newTokens = estimateConversationTokens(truncatedMessages, modelId).tokens;
  
  return {
    keepFromIndex,
    truncatedMessages,
    tokensSaved: originalTokens - newTokens
  };
}

/**
 * Get token usage statistics for debugging
 */
export function getTokenStats(
  messages: ModelMessage[],
  systemPrompt: string,
  modelId: string = 'generic'
): {
  total: TokenEstimate;
  system: TokenEstimate;
  messages: TokenEstimate;
  breakdown: Array<{
    role: string;
    tokens: number;
    characters: number;
    index: number;
  }>;
} {
  const systemEstimate = estimateTokens(systemPrompt, modelId, true);
  const messageEstimate = estimateConversationTokens(messages, modelId);
  
  const breakdown = messages.map((message, index) => {
    if (!message) {
      return {
        role: 'unknown',
        tokens: 0,
        characters: 0,
        index
      };
    }
    const estimate = estimateMessageTokens(message, modelId);
    return {
      role: message.role,
      tokens: estimate.tokens,
      characters: estimate.characters,
      index
    };
  });
  
  return {
    total: {
      tokens: systemEstimate.tokens + messageEstimate.tokens,
      characters: systemEstimate.characters + messageEstimate.characters,
      method: detectModelFamily(modelId)
    },
    system: systemEstimate,
    messages: messageEstimate,
    breakdown
  };
}
