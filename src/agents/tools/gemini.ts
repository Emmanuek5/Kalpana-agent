import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  analyzeImage,
  analyzePdf,
  analyzeVideo,
  analyzeAudio,
  analyzeFile,
  getSupportedFileTypes
} from "../../tools/gemini";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildGeminiTools() {
  return {
    "gemini.analyzeImage": tool<
      {
        relativePath: string;
        prompt?: string;
        model?: string;
        structuredOutput?: boolean;
      },
      any
    >({
      description: "Analyze images using Google Gemini AI. Supports various image formats (JPEG, PNG, GIF, WebP, etc.) and provides detailed visual analysis including object detection, text recognition, color analysis, and composition assessment.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string().describe("Path to the image file relative to sandbox workspace"),
          prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
          //model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
          structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
        })
      ),
      execute: createSafeToolWrapper("gemini.analyzeImage", async (args: any) => {
        return await analyzeImage(args);
      }),
    }),

    "gemini.analyzePdf": tool<
      {
        relativePath: string;
        prompt?: string;
        model?: string;
        structuredOutput?: boolean;
      },
      any
    >({
      description: "Analyze PDF documents using Google Gemini AI. Extracts and analyzes text content, structure, key information, and provides comprehensive document summaries with entity extraction.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string().describe("Path to the PDF file relative to sandbox workspace"),
          prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
         // model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
          structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
        })
      ),
      execute: createSafeToolWrapper("gemini.analyzePdf", async (args: any) => {
        return await analyzePdf(args);
      }),
    }),

    "gemini.analyzeVideo": tool<
      {
        relativePath: string;
        prompt?: string;
        model?: string;
        structuredOutput?: boolean;
      },
      any
    >({
      description: "Analyze video files using Google Gemini AI. Uploads video to Gemini for processing and provides comprehensive analysis including scene detection, audio analysis, visual assessment, and content summarization. Supports MP4, AVI, MOV, and other video formats.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string().describe("Path to the video file relative to sandbox workspace"),
          prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
          //model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
          structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
        })
      ),
      execute: createSafeToolWrapper("gemini.analyzeVideo", async (args: any) => {
        return await analyzeVideo(args);
      }),
    }),

    "gemini.analyzeAudio": tool<
      {
        relativePath: string;
        prompt?: string;
        model?: string;
        structuredOutput?: boolean;
      },
      any
    >({
      description: "Analyze audio files using Google Gemini AI. Uploads audio to Gemini for processing and provides comprehensive analysis including speech transcription, music analysis, speaker detection, and audio quality assessment. Supports MP3, WAV, M4A, and other audio formats.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string().describe("Path to the audio file relative to sandbox workspace"),
          prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
          //model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
          structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
        })
      ),
      execute: createSafeToolWrapper("gemini.analyzeAudio", async (args: any) => {
        return await analyzeAudio(args);
      }),
    }),

    "gemini.analyzeFile": tool<
      {
        relativePath: string;
        prompt?: string;
        model?: string;
        structuredOutput?: boolean;
      },
      any
    >({
      description: "Universal file analyzer using Google Gemini AI. Automatically detects file type and uses the appropriate analysis method. Supports images, PDFs, videos, audio files, and text documents. Provides intelligent analysis based on file content and type.",
      inputSchema: zodSchema(
        z.object({
          relativePath: z.string().describe("Path to the file relative to sandbox workspace"),
          prompt: z.string().optional().describe("Custom analysis prompt (optional)"),
          //model: z.string().optional().describe("Gemini model to use (default: from GEMINI_MODEL env var or gemini-2.0-flash-exp)"),
          structuredOutput: z.boolean().optional().describe("Return structured JSON output instead of text")
        })
      ),
      execute: createSafeToolWrapper("gemini.analyzeFile", async (args: any) => {
        return await analyzeFile(args);
      }),
    }),

    "gemini.getSupportedTypes": tool<{}, any>({
      description: "Get list of file types supported by Gemini analysis tools. Returns categorized lists of supported extensions for images, documents, audio, and video files.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gemini.getSupportedTypes", async () => {
        return {
          success: true,
          supportedTypes: getSupportedFileTypes()
        };
      }),
    }),
  } as const;
}
