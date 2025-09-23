import fs from "node:fs/promises";
import path from "node:path";

export interface GitignoreRule {
  pattern: string;
  isNegation: boolean;
  isDirectory: boolean;
  regex: RegExp;
}

export class GitignoreParser {
  private rules: GitignoreRule[] = [];
  private gitignoreCache = new Map<string, GitignoreRule[]>();

  /**
   * Parse a .gitignore file content and return rules
   */
  private parseGitignore(content: string): GitignoreRule[] {
    const rules: GitignoreRule[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      let pattern = trimmed;
      let isNegation = false;
      let isDirectory = false;

      // Handle negation patterns (starting with !)
      if (pattern.startsWith('!')) {
        isNegation = true;
        pattern = pattern.slice(1);
      }

      // Handle directory patterns (ending with /)
      if (pattern.endsWith('/')) {
        isDirectory = true;
        pattern = pattern.slice(0, -1);
      }

      // Convert gitignore pattern to regex
      const regex = this.patternToRegex(pattern);
      
      rules.push({
        pattern: trimmed,
        isNegation,
        isDirectory,
        regex
      });
    }

    return rules;
  }

  /**
   * Convert gitignore pattern to regular expression
   */
  private patternToRegex(pattern: string): RegExp {
    // Escape special regex characters except for gitignore wildcards
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\\\*/g, '.*') // Convert * to .*
      .replace(/\\\?/g, '.'); // Convert ? to .

    // Handle leading slash (absolute path from repo root)
    if (regexPattern.startsWith('/')) {
      regexPattern = '^' + regexPattern.slice(1);
    } else {
      // Pattern can match at any level
      regexPattern = '(^|/)' + regexPattern;
    }

    // Handle trailing patterns
    regexPattern += '($|/)';

    return new RegExp(regexPattern);
  }

  /**
   * Load and cache gitignore rules from a directory
   */
  private async loadGitignoreRules(dirPath: string): Promise<GitignoreRule[]> {
    if (this.gitignoreCache.has(dirPath)) {
      return this.gitignoreCache.get(dirPath)!;
    }

    const gitignorePath = path.join(dirPath, '.gitignore');
    let rules: GitignoreRule[] = [];

    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      rules = this.parseGitignore(content);
    } catch (error) {
      // .gitignore doesn't exist or can't be read, that's fine
      rules = [];
    }

    this.gitignoreCache.set(dirPath, rules);
    return rules;
  }

  /**
   * Get all applicable gitignore rules for a given file path
   * This walks up the directory tree to collect all .gitignore files
   */
  private async getAllApplicableRules(filePath: string, rootPath: string): Promise<GitignoreRule[]> {
    const allRules: GitignoreRule[] = [];
    let currentDir = path.dirname(filePath);

    // Walk up the directory tree until we reach the root
    while (currentDir.startsWith(rootPath) && currentDir !== rootPath) {
      const rules = await this.loadGitignoreRules(currentDir);
      allRules.unshift(...rules); // Add to beginning so parent rules take precedence
      currentDir = path.dirname(currentDir);
    }

    // Also check the root directory
    const rootRules = await this.loadGitignoreRules(rootPath);
    allRules.unshift(...rootRules);

    return allRules;
  }

  /**
   * Check if a file path should be ignored based on gitignore rules
   * @param filePath - Absolute path to the file/directory
   * @param rootPath - Root path of the repository
   * @param isDirectory - Whether the path is a directory
   */
  async isIgnored(filePath: string, rootPath: string, isDirectory: boolean = false): Promise<boolean> {
    // Normalize paths
    const normalizedFilePath = path.normalize(filePath);
    const normalizedRootPath = path.normalize(rootPath);

    // Get relative path from root
    const relativePath = path.relative(normalizedRootPath, normalizedFilePath);
    
    // Convert to forward slashes for consistent pattern matching
    const relativePathUnix = relativePath.replace(/\\/g, '/');

    // Get all applicable rules
    const rules = await this.getAllApplicableRules(normalizedFilePath, normalizedRootPath);

    let ignored = false;

    // Process rules in order
    for (const rule of rules) {
      // Skip directory-only rules for files and vice versa
      if (rule.isDirectory && !isDirectory) {
        continue;
      }

      // Test the pattern
      if (rule.regex.test(relativePathUnix) || rule.regex.test('/' + relativePathUnix)) {
        ignored = !rule.isNegation; // Negation rules un-ignore files
      }
    }

    return ignored;
  }

  /**
   * Clear the gitignore cache (useful when .gitignore files change)
   */
  clearCache(): void {
    this.gitignoreCache.clear();
  }

  /**
   * Check if a relative path should be ignored
   * @param relativePath - Path relative to the root
   * @param rootPath - Root path of the repository
   * @param isDirectory - Whether the path is a directory
   */
  async isRelativePathIgnored(relativePath: string, rootPath: string, isDirectory: boolean = false): Promise<boolean> {
    const fullPath = path.resolve(rootPath, relativePath);
    return this.isIgnored(fullPath, rootPath, isDirectory);
  }
}

// Global gitignore parser instance
export const gitignoreParser = new GitignoreParser();

/**
 * Convenience function to check if a path is ignored
 */
export async function isPathIgnored(filePath: string, rootPath: string, isDirectory: boolean = false): Promise<boolean> {
  return gitignoreParser.isIgnored(filePath, rootPath, isDirectory);
}

/**
 * Convenience function to check if a relative path is ignored
 */
export async function isRelativePathIgnored(relativePath: string, rootPath: string, isDirectory: boolean = false): Promise<boolean> {
  return gitignoreParser.isRelativePathIgnored(relativePath, rootPath, isDirectory);
}
