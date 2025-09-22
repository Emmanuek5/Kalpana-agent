import { marked } from "marked";
import markedTerminal from "marked-terminal";
import chalk from "chalk";

/**
 * Markdown Terminal Formatter
 *
 * This module provides Markdown parsing and terminal-friendly formatting for CLI output.
 * It automatically detects Markdown content and renders it with appropriate styling:
 *
 * - Headers: Cyan and magenta colors
 * - Bold/Italic: Chalk styling
 * - Code blocks: Yellow inline code, cyan code blocks with language labels
 * - Lists: Proper indentation with bullet points
 * - Tables: ASCII art tables with borders
 * - Links: Blue underlined text with URL
 * - Blockquotes: Gray italic text with indentation
 *
 * Usage:
 * ```typescript
 * import { formatResponse } from "./markdown";
 *
 * const response = "# Hello\n\nThis is **bold** text.";
 * console.log(formatResponse(response)); // Renders with colors and formatting
 * ```
 */

// Configure marked for terminal output
marked.setOptions({
  renderer: new markedTerminal({
    // Customize styling for terminal output
    heading: chalk.cyan.bold,
    firstHeading: chalk.magenta.bold,
    showSectionPrefix: false,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow,
    blockquote: chalk.gray.italic,
    tab: 2,
    tableOptions: {
      compact: false,
      delimiterTop: false,
      delimiterBottom: false,
    },
    // Code block styling
    code: (code: string, lang?: string) => {
      const langLabel = lang ? chalk.gray(`[${lang}]`) : "";
      const codeContent = chalk.cyan(code);
      return `${langLabel}\n${codeContent}`;
    },
    // List styling
    list: (body: string, ordered?: boolean) => {
      return body;
    },
    listitem: (text: string) => {
      return `  • ${text}`;
    },
    // Link styling - using simplified version
    link: chalk.blue.underline,
  }) as any, // Type assertion to work around complex type issues
});

/**
 * Check if text contains Markdown formatting
 */
export function isMarkdown(text: string): boolean {
  // Common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m, // Headers
    /\*\*.*?\*\*/, // Bold
    /\*.*?\*/, // Italic
    /`.*?`/, // Inline code
    /```[\s\S]*?```/, // Code blocks
    /^\s*[-*+]\s+/m, // Lists
    /^\s*\d+\.\s+/m, // Numbered lists
    /^\s*>\s+/m, // Blockquotes
    /\[.*?\]\(.*?\)/, // Links
    /!\[.*?\]\(.*?\)/, // Images
    /\|.*\|/, // Tables
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}

/**
 * Format text as Markdown for terminal display
 */
export function formatMarkdown(text: string): string {
  try {
    // If it doesn't look like markdown, return as-is with basic styling
    if (!isMarkdown(text)) {
      return text;
    }

    // Parse and render markdown
    return marked(text) as string;
  } catch (error) {
    // If parsing fails, return original text
    console.error(
      chalk.gray("Markdown parsing failed, displaying as plain text")
    );
    return text;
  }
}

/**
 * Format response text with proper styling
 */
export function formatResponse(text: string): string {
  // Always try to format as markdown first
  return formatMarkdown(text);
}

/**
 * Simple text styling utilities for non-markdown content
 */
export const textStyles = {
  success: (text: string) => chalk.green(text),
  error: (text: string) => chalk.red(text),
  warning: (text: string) => chalk.yellow(text),
  info: (text: string) => chalk.blue(text),
  dim: (text: string) => chalk.gray(text),
  bold: (text: string) => chalk.bold(text),
  underline: (text: string) => chalk.underline(text),
} as const;
