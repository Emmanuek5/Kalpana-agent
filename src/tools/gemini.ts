import "dotenv/config";
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import fs from "node:fs/promises";
import path from "node:path";
import { getActiveSandbox } from "../sandbox";

// Initialize Gemini AI client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({ apiKey });
}

// Get default Gemini model from environment or use fallback
function getDefaultModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
}

// Supported file types and their MIME types
const SUPPORTED_MIME_TYPES = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  
  // Documents
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  
  // Audio
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.m4a': 'audio/m4a',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  
  // Video
  '.mp4': 'video/mp4',
  '.avi': 'video/avi',
  '.mov': 'video/mov',
  '.wmv': 'video/wmv',
  '.flv': 'video/flv',
  '.webm': 'video/webm',
  '.mkv': 'video/mkv',
  '.m4v': 'video/m4v'
} as const;

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = SUPPORTED_MIME_TYPES[ext as keyof typeof SUPPORTED_MIME_TYPES];
  if (!mimeType) {
    throw new Error(`Unsupported file type: ${ext}. Supported types: ${Object.keys(SUPPORTED_MIME_TYPES).join(', ')}`);
  }
  return mimeType;
}

function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

function isAudioFile(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

function isPdfFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function isTextFile(mimeType: string): boolean {
  return mimeType.startsWith('text/') || 
         mimeType === 'application/json' || 
         mimeType === 'application/xml';
}

// Get absolute file path within sandbox
function getAbsoluteFilePath(relativePath: string): string {
  const sandbox = getActiveSandbox();
  return path.join(sandbox.hostVolumePath, relativePath);
}

// Analyze image file
export async function analyzeImage(options: {
  relativePath: string;
  prompt?: string;
  model?: string;
  structuredOutput?: any;
}): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
  fileInfo?: {
    name: string;
    size: number;
    mimeType: string;
  };
}> {
  try {
    const ai = getGeminiClient();
    const absolutePath = getAbsoluteFilePath(options.relativePath);
    
    // Check if file exists
    const stats = await fs.stat(absolutePath);
    const mimeType = getMimeType(absolutePath);
    
    if (!isImageFile(mimeType)) {
      return {
        success: false,
        error: `File is not an image. Detected type: ${mimeType}`
      };
    }

    // Read file as base64
    const imageData = await fs.readFile(absolutePath, { encoding: 'base64' });
    
    const contents = [
      {
        inlineData: {
          mimeType,
          data: imageData,
        },
      },
      { text: options.prompt || "Analyze this image in detail. Describe what you see, including objects, people, text, colors, composition, and any other relevant details." },
    ];

    const generateConfig: any = {
      model: options.model || getDefaultModel(),
      contents: contents,
    };

    // Add structured output if specified
    if (options.structuredOutput) {
      generateConfig.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: options.structuredOutput
      };
    }

    const response = await ai.models.generateContent(generateConfig);
    
    return {
      success: true,
      analysis: response.text,
      fileInfo: {
        name: path.basename(absolutePath),
        size: stats.size,
        mimeType
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to analyze image: ${(error as Error).message}`
    };
  }
}

// Analyze PDF file
export async function analyzePdf(options: {
  relativePath: string;
  prompt?: string;
  model?: string;
  structuredOutput?: any;
}): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
  fileInfo?: {
    name: string;
    size: number;
    mimeType: string;
  };
}> {
  try {
    const ai = getGeminiClient();
    const absolutePath = getAbsoluteFilePath(options.relativePath);
    
    // Check if file exists
    const stats = await fs.stat(absolutePath);
    const mimeType = getMimeType(absolutePath);
    
    if (!isPdfFile(mimeType)) {
      return {
        success: false,
        error: `File is not a PDF. Detected type: ${mimeType}`
      };
    }

    // Read PDF file as buffer and convert to base64
    const pdfBuffer = await fs.readFile(absolutePath);
    const pdfData = pdfBuffer.toString('base64');
    
    const contents = [
      { text: options.prompt || "Analyze this PDF document. Provide a comprehensive summary including main topics, key points, structure, and any important information contained within." },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfData
        }
      }
    ];

    const generateConfig: any = {
      model: options.model || getDefaultModel(),
      contents: contents,
    };

    // Add structured output if specified
    if (options.structuredOutput) {
      generateConfig.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: options.structuredOutput
      };
    }

    const response = await ai.models.generateContent(generateConfig);
    
    return {
      success: true,
      analysis: response.text,
      fileInfo: {
        name: path.basename(absolutePath),
        size: stats.size,
        mimeType
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to analyze PDF: ${(error as Error).message}`
    };
  }
}

// Analyze video file (requires file upload to Gemini)
export async function analyzeVideo(options: {
  relativePath: string;
  prompt?: string;
  model?: string;
  structuredOutput?: any;
}): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
  fileInfo?: {
    name: string;
    size: number;
    mimeType: string;
  };
  uploadedFileUri?: string;
}> {
  try {
    const ai = getGeminiClient();
    const absolutePath = getAbsoluteFilePath(options.relativePath);
    
    // Check if file exists
    const stats = await fs.stat(absolutePath);
    const mimeType = getMimeType(absolutePath);
    
    if (!isVideoFile(mimeType)) {
      return {
        success: false,
        error: `File is not a video. Detected type: ${mimeType}`
      };
    }

    // Upload video file to Gemini
    const uploadedFile = await ai.files.upload({
      file: absolutePath,
      config: { mimeType }
    });

    if (!uploadedFile.name) {
      return {
        success: false,
        error: "Failed to upload video file - no file name returned"
      };
    }

    // Wait for file processing
    let file = await ai.files.get({ name: uploadedFile.name });
    while (file.state === "PROCESSING") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      file = await ai.files.get({ name: uploadedFile.name });
    }

    if (file.state === "FAILED") {
      return {
        success: false,
        error: "Video file processing failed"
      };
    }

    if (!file.uri || !file.mimeType) {
      return {
        success: false,
        error: "File processing completed but missing URI or MIME type"
      };
    }

    const generateConfig: any = {
      model: options.model || getDefaultModel(),
      contents: createUserContent([
        createPartFromUri(file.uri, file.mimeType),
        options.prompt || "Analyze this video in detail. Describe the content, scenes, actions, audio, key moments, and provide a comprehensive summary. If applicable, identify any text, objects, or people in the video."
      ]),
    };

    // Add structured output if specified
    if (options.structuredOutput) {
      generateConfig.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: options.structuredOutput
      };
    }

    const response = await ai.models.generateContent(generateConfig);
    
    // Clean up uploaded file
    await ai.files.delete({ name: uploadedFile.name });
    
    return {
      success: true,
      analysis: response.text,
      fileInfo: {
        name: path.basename(absolutePath),
        size: stats.size,
        mimeType
      },
      uploadedFileUri: file.uri
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to analyze video: ${(error as Error).message}`
    };
  }
}

// Analyze audio file (requires file upload to Gemini)
export async function analyzeAudio(options: {
  relativePath: string;
  prompt?: string;
  model?: string;
  structuredOutput?: any;
}): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
  fileInfo?: {
    name: string;
    size: number;
    mimeType: string;
  };
  uploadedFileUri?: string;
}> {
  try {
    const ai = getGeminiClient();
    const absolutePath = getAbsoluteFilePath(options.relativePath);
    
    // Check if file exists
    const stats = await fs.stat(absolutePath);
    const mimeType = getMimeType(absolutePath);
    
    if (!isAudioFile(mimeType)) {
      return {
        success: false,
        error: `File is not an audio file. Detected type: ${mimeType}`
      };
    }

    // Upload audio file to Gemini
    const uploadedFile = await ai.files.upload({
      file: absolutePath,
      config: { mimeType }
    });

    if (!uploadedFile.name) {
      return {
        success: false,
        error: "Failed to upload audio file - no file name returned"
      };
    }

    // Wait for file processing
    let file = await ai.files.get({ name: uploadedFile.name });
    while (file.state === "PROCESSING") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      file = await ai.files.get({ name: uploadedFile.name });
    }

    if (file.state === "FAILED") {
      return {
        success: false,
        error: "Audio file processing failed"
      };
    }

    if (!file.uri || !file.mimeType) {
      return {
        success: false,
        error: "File processing completed but missing URI or MIME type"
      };
    }

    const generateConfig: any = {
      model: options.model || getDefaultModel(),
      contents: createUserContent([
        createPartFromUri(file.uri, file.mimeType),
        options.prompt || "Analyze this audio clip in detail. Describe the content, including speech (transcribe if possible), music, sound effects, tone, quality, and any other relevant audio characteristics. Provide a comprehensive summary of what you hear."
      ]),
    };

    // Add structured output if specified
    if (options.structuredOutput) {
      generateConfig.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: options.structuredOutput
      };
    }

    const response = await ai.models.generateContent(generateConfig);
    
    // Clean up uploaded file
    await ai.files.delete({ name: uploadedFile.name });
    
    return {
      success: true,
      analysis: response.text,
      fileInfo: {
        name: path.basename(absolutePath),
        size: stats.size,
        mimeType
      },
      uploadedFileUri: file.uri
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to analyze audio: ${(error as Error).message}`
    };
  }
}

// Universal file analyzer - automatically detects file type and uses appropriate method
export async function analyzeFile(options: {
  relativePath: string;
  prompt?: string;
  model?: string;
  structuredOutput?: any;
}): Promise<{
  success: boolean;
  analysis?: string;
  error?: string;
  fileType?: 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'unsupported';
  fileInfo?: {
    name: string;
    size: number;
    mimeType: string;
  };
  uploadedFileUri?: string;
}> {
  try {
    const absolutePath = getAbsoluteFilePath(options.relativePath);
    const mimeType = getMimeType(absolutePath);
    
    let result: any;
    let fileType: string;
    
    if (isImageFile(mimeType)) {
      fileType = 'image';
      result = await analyzeImage(options);
    } else if (isPdfFile(mimeType)) {
      fileType = 'pdf';
      result = await analyzePdf(options);
    } else if (isVideoFile(mimeType)) {
      fileType = 'video';
      result = await analyzeVideo(options);
    } else if (isAudioFile(mimeType)) {
      fileType = 'audio';
      result = await analyzeAudio(options);
    } else if (isTextFile(mimeType)) {
      fileType = 'text';
      // For text files, just read and analyze the content
      const textContent = await fs.readFile(absolutePath, 'utf-8');
      const ai = getGeminiClient();
      
      const generateConfig: any = {
        model: options.model || getDefaultModel(),
        contents: [
          { text: `${options.prompt || "Analyze this text content:"}\n\n${textContent}` }
        ],
      };

      if (options.structuredOutput) {
        generateConfig.generationConfig = {
          responseMimeType: "application/json",
          responseSchema: options.structuredOutput
        };
      }

      const response = await ai.models.generateContent(generateConfig);
      const stats = await fs.stat(absolutePath);
      
      result = {
        success: true,
        analysis: response.text,
        fileInfo: {
          name: path.basename(absolutePath),
          size: stats.size,
          mimeType
        }
      };
    } else {
      return {
        success: false,
        error: `Unsupported file type: ${mimeType}`,
        fileType: 'unsupported'
      };
    }
    
    return {
      ...result,
      fileType: fileType as any
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to analyze file: ${(error as Error).message}`
    };
  }
}

// Get supported file types
export function getSupportedFileTypes(): {
  images: string[];
  documents: string[];
  audio: string[];
  video: string[];
  all: string[];
} {
  const images: string[] = [];
  const documents: string[] = [];
  const audio: string[] = [];
  const video: string[] = [];
  
  for (const [ext, mimeType] of Object.entries(SUPPORTED_MIME_TYPES)) {
    if (isImageFile(mimeType)) {
      images.push(ext);
    } else if (isPdfFile(mimeType) || isTextFile(mimeType)) {
      documents.push(ext);
    } else if (isAudioFile(mimeType)) {
      audio.push(ext);
    } else if (isVideoFile(mimeType)) {
      video.push(ext);
    }
  }
  
  return {
    images,
    documents,
    audio,
    video,
    all: Object.keys(SUPPORTED_MIME_TYPES)
  };
}
