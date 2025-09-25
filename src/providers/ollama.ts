import {
  type LanguageModelV2,
  type LanguageModelV2CallOptions,
  type LanguageModelV2CallWarning,
  type LanguageModelV2Content,
  type LanguageModelV2Prompt,
  type LanguageModelV2StreamPart,
  APICallError,
  InvalidResponseDataError,
} from "@ai-sdk/provider";

export interface OllamaConfig {
  baseURL: string;
  headers?: () => Record<string, string>;
}

export interface OllamaSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  seed?: number;
  numPredict?: number;
  numCtx?: number;
  stop?: string[];
}

/**
 * Ollama Language Model Implementation
 * Following AI SDK Language Model Specification V2
 */
export class OllamaLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2";
  readonly provider = "ollama";
  readonly modelId: string;

  private config: OllamaConfig;
  private settings: OllamaSettings;

  constructor(
    modelId: string,
    settings: OllamaSettings = {},
    config: OllamaConfig
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get supportedUrls() {
    return {};
  }

  private getRequestArgs(options: LanguageModelV2CallOptions) {
    const warnings: LanguageModelV2CallWarning[] = [];

    // Convert AI SDK prompt to Ollama format
    const messages = this.convertToOllamaMessages(options.prompt);

    // Handle tools if provided
    let tools: any[] | undefined;
    if (options.tools && Object.keys(options.tools).length > 0) {
      tools = this.prepareTools(options.tools);
    }

    // Build request body for Ollama
    const body = {
      model: this.modelId,
      messages,
      options: {
        temperature: options.temperature ?? this.settings.temperature,
        top_p: options.topP ?? this.settings.topP,
        top_k: options.topK ?? this.settings.topK,
        repeat_penalty: this.settings.repeatPenalty,
        seed: this.settings.seed,
        num_predict: options.maxOutputTokens ?? this.settings.numPredict,
        num_ctx: this.settings.numCtx,
        stop: options.stopSequences ?? this.settings.stop,
      },
      tools,
      stream: false,
    };

    return { args: body, warnings };
  }

  private convertToOllamaMessages(prompt: LanguageModelV2Prompt) {
    return prompt.map((message) => {
      switch (message.role) {
        case "system":
          return {
            role: "system",
            content: message.content,
          };

        case "user":
          const userContent = message.content
            .map((part) => {
              switch (part.type) {
                case "text":
                  return part.text;
                case "file":
                  // Ollama supports images in base64 format
                  if (part.mediaType?.startsWith("image/")) {
                    const base64Data =
                      typeof part.data === "string"
                        ? part.data
                        : Buffer.from(part.data as Uint8Array).toString(
                            "base64"
                          );
                    return `[Image: ${base64Data.substring(0, 50)}...]`;
                  }
                  return `[File: ${part.mediaType || "unknown"}]`;
                default:
                  return "";
              }
            })
            .join(" ");

          return {
            role: "user",
            content: userContent,
          };

        case "assistant":
          let textContent = "";

          for (const part of message.content) {
            switch (part.type) {
              case "text":
                textContent += part.text;
                break;
              case "tool-call":
                textContent += `[Tool Call: ${part.toolName}]`;
                break;
              default:
                // Skip unsupported content types
                break;
            }
          }

          return {
            role: "assistant",
            content: textContent,
          };

        case "tool":
          const toolContent = message.content
            .map((part) => {
              if (part.type === "tool-result") {
                return `[Tool Result: Available]`;
              }
              return "";
            })
            .join("");

          return {
            role: "system",
            content: `Tool Results: ${toolContent}`,
          };

        default:
          throw new Error(`Unsupported message role: ${(message as any).role}`);
      }
    });
  }

  private prepareTools(tools: Record<string, any>) {
    return Object.entries(tools).map(([name, tool]) => ({
      type: "function",
      function: {
        name,
        description: tool.description || `Execute ${name}`,
        parameters: tool.parameters || {},
      },
    }));
  }

  private mapFinishReason(
    reason: string | undefined
  ):
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "error"
    | "other"
    | "unknown" {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
        return "tool-calls";
      default:
        return "unknown";
    }
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const { args, warnings } = this.getRequestArgs(options);

    try {
      const response = await fetch(`${this.config.baseURL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers?.(),
        },
        body: JSON.stringify(args),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        throw await this.handleError(response);
      }

      const data = await response.json();

      // Extract content from Ollama response
      const content: LanguageModelV2Content[] = [];

      if (data.message?.content) {
        content.push({
          type: "text",
          text: data.message.content,
        });
      }

      return {
        content,
        finishReason: this.mapFinishReason(data.done_reason),
        usage: {
          inputTokens: data.prompt_eval_count,
          outputTokens: data.eval_count,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        request: { body: args },
        response: { body: data },
        warnings,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const { args, warnings } = this.getRequestArgs(options);
    args.stream = true;

    try {
      const response = await fetch(`${this.config.baseURL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers?.(),
        },
        body: JSON.stringify(args),
        signal: options.abortSignal,
      });

      if (!response.ok) {
        throw await this.handleError(response);
      }

      const stream = response
        .body!.pipeThrough(new TextDecoderStream())
        .pipeThrough(this.createStreamParser())
        .pipeThrough(this.createStreamTransformer(warnings));

      return { stream, warnings };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  private createStreamParser() {
    let buffer = "";

    return new TransformStream<string, any>({
      transform(chunk, controller) {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              controller.enqueue(data);
            } catch (error) {
              // Skip malformed JSON lines
            }
          }
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            controller.enqueue(data);
          } catch (error) {
            // Skip malformed JSON
          }
        }
      },
    });
  }

  private createStreamTransformer(warnings: LanguageModelV2CallWarning[]) {
    let isFirstChunk = true;

    // Bind the method to preserve context
    const mapFinishReason = this.mapFinishReason.bind(this);

    return new TransformStream<any, LanguageModelV2StreamPart>({
      transform(chunk, controller) {
        // Send warnings with first chunk
        if (isFirstChunk) {
          controller.enqueue({ type: "stream-start", warnings });
          isFirstChunk = false;
        }

        // Handle text content
        if (chunk.message?.content) {
          controller.enqueue({
            type: "text-delta",
            id: "text-1",
            delta: chunk.message.content,
          });
        }

        // Handle completion
        if (chunk.done) {
          const finishReason = mapFinishReason(chunk.done_reason);
          controller.enqueue({
            type: "finish",
            finishReason,
            usage: {
              inputTokens: chunk.prompt_eval_count,
              outputTokens: chunk.eval_count,
              totalTokens:
                (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
            },
          });
        }
      },
    });
  }

  private async handleError(error: unknown): Promise<never> {
    if (error instanceof Response) {
      const status = error.status;

      let errorBody: any;
      try {
        errorBody = await error.json();
      } catch {
        errorBody = { error: error.statusText };
      }

      throw new APICallError({
        message: errorBody.error || error.statusText,
        url: this.config.baseURL,
        requestBodyValues: {},
        statusCode: status,
        cause: error,
        isRetryable: status >= 500 && status < 600,
      });
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unknown error occurred");
  }
}

/**
 * Create an Ollama provider
 */
export function createOllama(
  config: {
    baseURL?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const baseURL =
    config.baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  return {
    languageModel: (modelId: string, settings: OllamaSettings = {}) =>
      new OllamaLanguageModel(modelId, settings, {
        baseURL,
        headers: () => config.headers || {},
      }),
  };
}

// Default Ollama provider instance
export const ollama = createOllama();
