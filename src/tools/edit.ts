import fs from "node:fs/promises";
import path from "node:path";
import { getActiveSandbox } from "../sandbox";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : undefined;

export interface SearchReplaceInput {
  relativePath: string;
  searchText: string;
  replaceText: string;
  replaceAll?: boolean;
}

export interface SubAgentWriteInput {
  relativePath: string;
  instruction: string;
  createIfNotExists?: boolean;
}

function toHostPath(relativePath: string) {
  const { hostVolumePath } = getActiveSandbox();
  const p = path.resolve(hostVolumePath, relativePath);
  if (!p.startsWith(hostVolumePath))
    throw new Error("Path escapes sandbox volume");
  return p;
}

// Search and replace tool
export async function searchReplace({
  relativePath,
  searchText,
  replaceText,
  replaceAll = false,
}: SearchReplaceInput) {
  const target = toHostPath(relativePath);

  try {
    const content = await fs.readFile(target, "utf8");
    let newContent: string;
    let occurrences = 0;

    if (replaceAll) {
      // Replace all occurrences
      const regex = new RegExp(escapeRegExp(searchText), "g");
      newContent = content.replace(regex, (match) => {
        occurrences++;
        return replaceText;
      });
    } else {
      // Replace only first occurrence
      const index = content.indexOf(searchText);
      if (index !== -1) {
        newContent =
          content.substring(0, index) +
          replaceText +
          content.substring(index + searchText.length);
        occurrences = 1;
      } else {
        newContent = content;
      }
    }

    if (occurrences > 0) {
      await fs.writeFile(target, newContent, "utf8");
    }

    return {
      success: true,
      occurrences,
      message: `Replaced ${occurrences} occurrence(s) of "${searchText}" with "${replaceText}"`,
    };
  } catch (error) {
    return {
      success: false,
      occurrences: 0,
      message: `Error: ${(error as Error).message}`,
    };
  }
}

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sub-agent file writer with structured outputs
const SUB_AGENT_SYSTEM_PROMPT = `You are a specialized file editing sub-agent. Your sole purpose is to write or modify files based on specific instructions while maintaining high code quality and following best practices.

## Core Responsibilities
- Write clean, well-structured, and maintainable code
- Follow language-specific conventions and best practices  
- Implement the exact functionality requested in the instruction
- Preserve existing code structure when modifying files
- Add appropriate comments and documentation
- Ensure code is production-ready and error-free

## Editing Guidelines
- **For new files**: Create complete, functional code from scratch
- **For existing files**: Make precise modifications while preserving the existing structure
- **Always preserve**: Imports, existing functions/classes that aren't being modified
- **Code quality**: Use proper indentation, naming conventions, and organize code logically
- **Error handling**: Include appropriate error handling where needed
- **Dependencies**: Only use dependencies that are available or commonly installed

## Output Requirements
- Return the COMPLETE file content (not just changes)
- Provide a clear summary of what was implemented or modified
- If the instruction is unclear or impossible, explain why in the summary
- Ensure the output is immediately usable without further editing

## Language-Specific Rules
- **JavaScript/TypeScript**: Use modern ES6+ syntax, proper typing for TS
- **Python**: Follow PEP 8 conventions, use type hints where appropriate
- **JSON**: Ensure valid JSON structure with proper formatting
- **Configuration files**: Maintain proper format and structure

You must ALWAYS return both the complete file content and a summary of changes.`;

const FileWriteSchema = z.object({
  content: z.string().describe("The complete file content"),
  summary: z
    .string()
    .describe("A clear summary of what was implemented or modified"),
  success: z.boolean().describe("Whether the task was completed successfully"),
  warnings: z
    .array(z.string())
    .optional()
    .describe("Any warnings or concerns about the implementation"),
});

export async function subAgentWrite({
  relativePath,
  instruction,
  createIfNotExists = true,
}: SubAgentWriteInput) {
  if (!openrouter) {
    throw new Error(
      "OpenRouter API key is required for sub-agent functionality"
    );
  }

  const target = toHostPath(relativePath);
  let existingContent = "";
  let fileExists = false;

  try {
    existingContent = await fs.readFile(target, "utf8");
    fileExists = true;
  } catch (error) {
    if (!createIfNotExists) {
      return {
        success: false,
        message: `File does not exist: ${relativePath}`,
        summary: "File not found and createIfNotExists is false",
      };
    }
  }

  // Determine file extension for context
  const ext = path.extname(relativePath).toLowerCase();
  const fileType = getFileType(ext);

  // Prepare the prompt for the sub-agent
  const prompt = fileExists
    ? `File: ${relativePath} (${fileType})
Existing content:
\`\`\`
${existingContent}
\`\`\`

Instruction: ${instruction}

Please modify the existing file according to the instruction. Return the complete modified file content and a summary of changes.`
    : `Create new file: ${relativePath} (${fileType})

Instruction: ${instruction}

Please create a new file according to the instruction. Return the complete file content and a summary of what was created.`;

  try {
    const model = openrouter(
      process.env.SUB_AGENT_MODEL_ID || "openai/gpt-4o-mini"
    );

    const result = await generateObject({
      model,
      system: SUB_AGENT_SYSTEM_PROMPT,
      prompt,
      schema: FileWriteSchema,
    });

    if (result.object.success) {
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(target), { recursive: true });

      // Calculate diff information
      const newLines = result.object.content.split("\n");
      const newLinesCount = newLines.length;
      let linesAdded = 0;
      let linesRemoved = 0;

      if (fileExists) {
        const oldLines = existingContent.split("\n");
        linesAdded = Math.max(0, newLinesCount - oldLines.length);
        linesRemoved = Math.max(0, oldLines.length - newLinesCount);
      } else {
        linesAdded = newLinesCount;
      }

      // Write the file
      await fs.writeFile(target, result.object.content, "utf8");

      return {
        success: true,
        message: `File ${fileExists ? "modified" : "created"} successfully`,
        summary: result.object.summary,
        warnings: result.object.warnings || [],
        linesWritten: newLinesCount,
        linesAdded,
        linesRemoved,
        diffSummary: fileExists
          ? `+${linesAdded} -${linesRemoved}`
          : `${newLinesCount} lines created`,
      };
    } else {
      return {
        success: false,
        message: "Sub-agent could not complete the task",
        summary: result.object.summary,
        warnings: result.object.warnings || [],
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Sub-agent error: ${(error as Error).message}`,
      summary: "Failed to process file editing request",
    };
  }
}

function getFileType(extension: string): string {
  const typeMap: Record<string, string> = {
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "React JSX",
    ".tsx": "React TSX",
    ".py": "Python",
    ".json": "JSON",
    ".md": "Markdown",
    ".txt": "Text",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".xml": "XML",
    ".sh": "Shell Script",
    ".sql": "SQL",
  };

  return typeMap[extension] || "Unknown";
}
