import fs from "node:fs/promises";
import path from "node:path";
import { getActiveSandbox } from "../sandbox";
import { generateText } from "ai";
import { getAIProvider } from "../agents/system.js";
import { isRelativePathIgnored } from "../utils/gitignore";

export interface WriteFileInput {
  relativePath: string; // relative to /workspace in the container and host volume
  content: string;
}

export interface ReadFileInput {
  relativePath: string;
  maxLines?: number; // If specified, limit the number of lines returned
  startLine?: number; // Starting line number (1-based)
  endLine?: number; // Ending line number (1-based)
}

export interface ReadFileChunkInput {
  relativePath: string;
  startLine: number; // 1-based line number
  endLine: number; // 1-based line number
}

export interface FileSummaryInput {
  relativePath: string;
}

export interface ListDirInput {
  relativePath?: string;
  recursive?: boolean;
}

export interface MakeDirInput {
  relativePath: string;
  recursive?: boolean;
}

export interface DeleteInput {
  relativePath: string;
  recursive?: boolean;
}

export interface CopyInput {
  sourcePath: string;
  destinationPath: string;
}

export interface MoveInput {
  sourcePath: string;
  destinationPath: string;
}

export interface FileStatsInput {
  relativePath: string;
}

export interface LineCountInput {
  relativePath: string;
}

async function toHostPath(relativePath = "") {
  const { hostVolumePath, containerVolumePath } = getActiveSandbox();

  // Normalize any container-style absolute path to a sandbox-relative path
  let rel = relativePath || "";
  const norm = rel.replace(/\\/g, "/");
  if (
    norm === containerVolumePath ||
    norm.startsWith(containerVolumePath + "/")
  ) {
    rel = norm.slice(containerVolumePath.length).replace(/^\/+/, "");
  }

  // Resolve against the host volume path
  const p = path.resolve(hostVolumePath, rel);
  if (!p.startsWith(hostVolumePath))
    throw new Error("Path escapes sandbox volume");

  // Check if the path is ignored by .gitignore
  const isIgnored = await isRelativePathIgnored(rel, hostVolumePath);
  if (isIgnored) {
    throw new Error(`Access denied: '${rel}' is ignored by .gitignore`);
  }

  return p;
}

// Helper function to check if a path should be accessible
async function checkPathAccess(relativePath: string): Promise<void> {
  const { hostVolumePath, containerVolumePath } = getActiveSandbox();
  let rel = relativePath || "";
  const norm = rel.replace(/\\/g, "/");
  if (
    norm === containerVolumePath ||
    norm.startsWith(containerVolumePath + "/")
  ) {
    rel = norm.slice(containerVolumePath.length).replace(/^\/+/, "");
  }
  const isIgnored = await isRelativePathIgnored(rel, hostVolumePath);
  if (isIgnored) {
    throw new Error(`Access denied: '${rel}' is ignored by .gitignore`);
  }
}

export async function fsWriteFile({ relativePath, content }: WriteFileInput) {
  const target = await toHostPath(relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return { ok: true } as const;
}

export async function fsReadFile({
  relativePath,
  maxLines,
  startLine,
  endLine,
}: ReadFileInput) {
  const target = await toHostPath(relativePath);
  const text = await fs.readFile(target, "utf8");
  const lines = text.split("\n");
  const totalLines = lines.length;

  // If file is large (>1000 lines) and no specific range requested, return summary
  if (totalLines > 1000 && !maxLines && !startLine && !endLine) {
    const summary = await summarizeFile({ relativePath });
    return {
      summary: summary.summary,
      totalLines,
      relativePath,
      path: relativePath,
      isLargeFile: true,
      message: `File is large (${totalLines} lines). Showing summary. Use fs.readFileChunk to read specific sections.`,
    };
  }

  // Handle line range requests
  let processedText = text;
  let actualStartLine = 1;
  let actualEndLine = totalLines;

  if (startLine || endLine || maxLines) {
    const start = Math.max(1, startLine || 1) - 1; // Convert to 0-based
    const end = endLine
      ? Math.min(totalLines, endLine)
      : maxLines
      ? Math.min(totalLines, start + maxLines)
      : totalLines;

    actualStartLine = start + 1;
    actualEndLine = end;
    processedText = lines.slice(start, end).join("\n");
  }

  return {
    text: processedText,
    relativePath,
    path: relativePath,
    totalLines,
    startLine: actualStartLine,
    endLine: actualEndLine,
    isLargeFile: totalLines > 1000,
  };
}

export async function fsListDir({
  relativePath = ".",
  recursive = false,
}: ListDirInput) {
  const target = await toHostPath(relativePath);
  const { hostVolumePath } = getActiveSandbox();

  // Directories to ignore
  const ignoredDirs = new Set([
    "node_modules",
    ".git",
    ".next",
    ".nuxt",
    "dist",
    "build",
    ".cache",
    ".vscode",
    ".idea",
    "__pycache__",
    ".pytest_cache",
    "venv",
    ".venv",
    "env",
    ".env",
  ]);

  if (!recursive) {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const filteredEntries = [];

    for (const e of entries) {
      if (ignoredDirs.has(e.name)) continue;

      const entryRelativePath = path.posix.join(relativePath, e.name);
      const isIgnored = await isRelativePathIgnored(
        entryRelativePath,
        hostVolumePath,
        e.isDirectory()
      );

      if (!isIgnored) {
        filteredEntries.push({
          name: e.name,
          type: e.isDirectory() ? "dir" : "file",
          path: entryRelativePath,
        });
      }
    }

    return filteredEntries;
  }

  // Recursive listing
  const results: Array<{ name: string; type: string; path: string }> = [];

  async function scanDirectory(dirPath: string, relativeBase: string) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        // Skip ignored directories
        if (ignoredDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.posix.join(relativeBase, entry.name);

        // Check if this entry is ignored by .gitignore
        const isIgnored = await isRelativePathIgnored(
          relativePath,
          hostVolumePath,
          entry.isDirectory()
        );
        if (isIgnored) {
          continue;
        }

        results.push({
          name: entry.name,
          type: entry.isDirectory() ? "dir" : "file",
          path: relativePath,
        });

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativePath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  await scanDirectory(target, relativePath);
  return results;
}

export async function fsMakeDir({
  relativePath,
  recursive = true,
}: MakeDirInput) {
  const target = await toHostPath(relativePath);
  await fs.mkdir(target, { recursive });
  return { ok: true, path: relativePath };
}

export async function fsDelete({
  relativePath,
  recursive = false,
}: DeleteInput) {
  const target = await toHostPath(relativePath);

  try {
    const stats = await fs.stat(target);
    if (stats.isDirectory()) {
      await fs.rmdir(target, { recursive });
    } else {
      await fs.unlink(target);
    }
    return { ok: true, deleted: relativePath };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to delete ${relativePath}: ${(error as Error).message}`,
    };
  }
}

export async function fsCopy({ sourcePath, destinationPath }: CopyInput) {
  const source = await toHostPath(sourcePath);
  const destination = await toHostPath(destinationPath);

  try {
    // Create destination directory if it doesn't exist
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const stats = await fs.stat(source);
    if (stats.isDirectory()) {
      // Copy directory recursively
      await fs.cp(source, destination, { recursive: true });
    } else {
      // Copy file
      await fs.copyFile(source, destination);
    }

    return { ok: true, copied: `${sourcePath} → ${destinationPath}` };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to copy ${sourcePath} to ${destinationPath}: ${
        (error as Error).message
      }`,
    };
  }
}

export async function fsMove({ sourcePath, destinationPath }: MoveInput) {
  const source = await toHostPath(sourcePath);
  const destination = await toHostPath(destinationPath);

  try {
    // Create destination directory if it doesn't exist
    await fs.mkdir(path.dirname(destination), { recursive: true });

    await fs.rename(source, destination);
    return { ok: true, moved: `${sourcePath} → ${destinationPath}` };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to move ${sourcePath} to ${destinationPath}: ${
        (error as Error).message
      }`,
    };
  }
}

export async function fsStats({ relativePath }: FileStatsInput) {
  const target = await toHostPath(relativePath);

  try {
    const stats = await fs.stat(target);
    return {
      ok: true,
      stats: {
        type: stats.isDirectory()
          ? "directory"
          : stats.isFile()
          ? "file"
          : "other",
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        permissions: stats.mode.toString(8),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to get stats for ${relativePath}: ${
        (error as Error).message
      }`,
    };
  }
}

// File summarization using AI sub-agent
export async function summarizeFile({ relativePath }: FileSummaryInput) {
  const target = await toHostPath(relativePath);
  const text = await fs.readFile(target, "utf8");
  const lines = text.split("\n");
  const totalLines = lines.length;

  // Get file extension for context
  const fileExt = path.extname(relativePath).toLowerCase();
  const fileName = path.basename(relativePath);

  // Create a sub-agent to analyze the file
  try {
    const aiProvider = getAIProvider();
    const aiProviderType = process.env.AI_PROVIDER || "openrouter";

    // For OpenRouter, check if API key is available
    if (aiProviderType === "openrouter" && !process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API key not configured");
    }

    let modelId: string;
    if (aiProviderType === "ollama") {
      modelId =
        process.env.OLLAMA_MODEL ||
        process.env.SUB_AGENT_MODEL_ID ||
        process.env.MODEL_ID ||
        "llama3.2";
    } else {
      modelId = process.env.SUB_AGENT_MODEL_ID || "openai/gpt-4o-mini";
    }

    const model = aiProvider.languageModel(modelId);

    const { text: summary } = await generateText({
      model,
      prompt: `Analyze this ${fileExt} file "${fileName}" (${totalLines} lines) and provide a comprehensive summary:

File content:
${text}

Please provide:
1. **Purpose**: What this file does/contains
2. **Structure**: Main sections, functions, classes, or components
3. **Key Features**: Important functionality or notable patterns
4. **Dependencies**: Imports, libraries, or external dependencies
5. **Notable Details**: Any important implementation details, configurations, or patterns

Keep the summary concise but informative. Focus on what a developer would need to know to understand and work with this file.`,
    });

    return {
      success: true,
      summary,
      totalLines,
      relativePath,
      fileName,
      fileType: fileExt,
    };
  } catch (error) {
    // Fallback to basic analysis if AI fails
    const basicSummary = createBasicSummary(
      text,
      fileName,
      fileExt,
      totalLines
    );
    return {
      success: false,
      summary: basicSummary,
      totalLines,
      relativePath,
      fileName,
      fileType: fileExt,
      error: (error as Error).message,
    };
  }
}

// Fallback basic file analysis
function createBasicSummary(
  content: string,
  fileName: string,
  fileExt: string,
  totalLines: number
): string {
  const lines = content.split("\n");
  let summary = `File: ${fileName} (${totalLines} lines, ${fileExt} file)\n\n`;

  // Basic analysis based on file type
  if (
    fileExt === ".ts" ||
    fileExt === ".js" ||
    fileExt === ".tsx" ||
    fileExt === ".jsx"
  ) {
    const imports = lines.filter((line) =>
      line.trim().startsWith("import")
    ).length;
    const functions = lines.filter(
      (line) =>
        line.includes("function ") ||
        (line.includes("const ") && line.includes("=>"))
    ).length;
    const classes = lines.filter((line) =>
      line.trim().startsWith("class ")
    ).length;
    const interfaces = lines.filter((line) =>
      line.trim().startsWith("interface ")
    ).length;

    summary += `JavaScript/TypeScript file with:\n`;
    summary += `- ${imports} import statements\n`;
    summary += `- ${functions} functions/methods\n`;
    if (classes > 0) summary += `- ${classes} classes\n`;
    if (interfaces > 0) summary += `- ${interfaces} interfaces\n`;
  } else if (fileExt === ".json") {
    summary += `JSON configuration file\n`;
    try {
      const parsed = JSON.parse(content);
      const keys = Object.keys(parsed);
      summary += `- ${keys.length} top-level keys: ${keys
        .slice(0, 5)
        .join(", ")}${keys.length > 5 ? "..." : ""}\n`;
    } catch {
      summary += `- Contains JSON data (parsing failed)\n`;
    }
  } else if (fileExt === ".md") {
    const headers = lines.filter((line) => line.trim().startsWith("#")).length;
    summary += `Markdown document with ${headers} headers\n`;
  } else {
    summary += `Text file with ${totalLines} lines\n`;
  }

  return summary;
}

// Read specific chunk of a large file
export async function fsReadFileChunk({
  relativePath,
  startLine,
  endLine,
}: ReadFileChunkInput) {
  const target = await toHostPath(relativePath);
  const text = await fs.readFile(target, "utf8");
  const lines = text.split("\n");
  const totalLines = lines.length;

  // Validate line numbers
  const actualStartLine = Math.max(1, Math.min(startLine, totalLines));
  const actualEndLine = Math.max(
    actualStartLine,
    Math.min(endLine, totalLines)
  );

  // Extract the requested chunk (convert to 0-based indexing)
  const chunkLines = lines.slice(actualStartLine - 1, actualEndLine);
  const chunkText = chunkLines.join("\n");

  return {
    text: chunkText,
    relativePath,
    path: relativePath,
    startLine: actualStartLine,
    endLine: actualEndLine,
    totalLines,
    chunkLines: chunkLines.length,
    isChunk: true,
  };
}

// Get line count for a file without reading full content
export async function fsLineCount({ relativePath }: LineCountInput) {
  const target = await toHostPath(relativePath);

  try {
    const text = await fs.readFile(target, "utf8");
    const lines = text.split("\n");
    const totalLines = lines.length;

    // Calculate file size info
    const stats = await fs.stat(target);
    const sizeKB = Math.round(stats.size / 1024);

    // Determine reading strategy recommendation
    let strategy = "direct";
    let recommendation = "Use fs.readFile directly";

    if (totalLines > 1000) {
      strategy = "summarize_then_chunk";
      recommendation =
        "Use fs.summarize first, then fs.readChunk for specific sections";
    } else if (totalLines > 100) {
      strategy = "summarize_then_read";
      recommendation =
        "Use fs.summarize first, then fs.readFile with line ranges";
    }

    return {
      ok: true,
      relativePath,
      totalLines,
      sizeKB,
      strategy,
      recommendation,
      isEmpty:
        totalLines === 0 ||
        (totalLines === 1 && (lines[0]?.trim() ?? "") === ""),
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to count lines in ${relativePath}: ${
        (error as Error).message
      }`,
    };
  }
}
