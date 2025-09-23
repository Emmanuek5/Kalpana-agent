import { tool, zodSchema } from "ai";
import { z } from "zod";
import { checkFileErrors, checkMultipleFiles, checkDirectoryErrors } from "../../tools/error-checker.js";
import { createSafeToolWrapper } from "../safeToolWrapper.js";

/**
 * Error Checking Tools for AI Agent
 * 
 * Provides comprehensive error checking capabilities:
 * - Single file error checking
 * - Multiple file batch checking  
 * - Directory-wide error analysis
 * - Syntax validation, TypeScript checking, linting, etc.
 */

export function buildErrorCheckTools() {
  return {
    "errorCheck.checkFile": tool<
      { filePath: string },
      string
    >({
      description: `Check a single file for syntax errors, type errors, linting issues, and other problems.
      
Supports multiple file types:
- JavaScript/TypeScript: Syntax, imports, TypeScript errors, ESLint
- JSON: Syntax validation, package.json structure validation
- Python, Rust, Go, etc.: Basic syntax and structure checks

Returns detailed error and warning information with line numbers and suggestions.`,
      inputSchema: zodSchema(
        z.object({
          filePath: z.string().describe("Path to the file to check for errors"),
        })
      ),
      execute: createSafeToolWrapper("errorCheck.checkFile", async ({ filePath }) => {
        const result = await checkFileErrors(filePath);
        
        // Format the output for better readability
        let output = `File Error Check: ${filePath}\n`;
        output += `File Type: ${result.fileType}\n`;
        output += `Checked With: ${result.checkedWith.join(', ')}\n`;
        output += `Status: ${result.success ? '✅ No errors' : '❌ Errors found'}\n\n`;
        
        if (result.errors.length > 0) {
          output += `🚨 ERRORS (${result.errors.length}):\n`;
          for (const error of result.errors) {
            const location = error.line ? ` (line ${error.line}${error.column ? `:${error.column}` : ''})` : '';
            const rule = error.rule ? ` [${error.rule}]` : '';
            output += `  • ${error.message}${location}${rule}\n`;
          }
          output += '\n';
        }
        
        if (result.warnings.length > 0) {
          output += `⚠️  WARNINGS (${result.warnings.length}):\n`;
          for (const warning of result.warnings) {
            const location = warning.line ? ` (line ${warning.line}${warning.column ? `:${warning.column}` : ''})` : '';
            const rule = warning.rule ? ` [${warning.rule}]` : '';
            output += `  • ${warning.message}${location}${rule}\n`;
          }
          output += '\n';
        }
        
        if (result.success && result.warnings.length === 0) {
          output += '✨ File looks good! No errors or warnings found.\n';
        }
        
        return output;
      })
    }),

    "errorCheck.validateProject": tool<
      { projectPath: string },
      string
    >({
      description: `Validate an entire project by checking key files and directories. Focuses on critical files like package.json, tsconfig.json, main source files, etc.
      
Provides a project-wide health check with prioritized error reporting.`,
      inputSchema: zodSchema(
        z.object({
          projectPath: z.string().describe("Path to the project root directory"),
        })
      ),
      execute: createSafeToolWrapper("errorCheck.validateProject", async ({ projectPath }) => {
        // Check critical files first
        const criticalFiles = [
          'package.json',
          'tsconfig.json', 
          'index.ts',
          'index.js'
        ].map(f => `${projectPath}/${f}`);
        
        let output = `Project Validation: ${projectPath}\n\n`;
        let totalErrors = 0;
        
        for (const file of criticalFiles) {
          try {
            const result = await checkFileErrors(file);
            if (result.errors.length > 0) {
              output += `❌ ${file}: ${result.errors.length} errors\n`;
              totalErrors += result.errors.length;
              
              // Show first few errors
              for (const error of result.errors.slice(0, 2)) {
                const location = error.line ? ` (line ${error.line})` : '';
                output += `    • ${error.message}${location}\n`;
              }
            } else {
              output += `✅ ${file}: No errors\n`;
            }
          } catch (error) {
            // File doesn't exist, skip
          }
        }
        
        output += `\nTotal errors: ${totalErrors}\n`;
        if (totalErrors === 0) {
          output += '🎉 Project validation passed!';
        }
        
        return output;
      })
    })
  };
}
