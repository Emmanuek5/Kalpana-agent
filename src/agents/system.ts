import "dotenv/config";
import {
  createOpenRouter,
  openrouter as defaultOpenRouter,
} from "@openrouter/ai-sdk-provider";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

export const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : defaultOpenRouter;

/**
 * Ensure the Kalpana config directory exists
 */
async function ensureKalpanaDir(): Promise<string> {
  const fs = await import("node:fs/promises");
  const kalpanaDir = path.join(os.homedir(), '.kalpana');
  
  try {
    await fs.mkdir(kalpanaDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
  
  return kalpanaDir;
}

/**
 * Fetch system prompt from GitHub and cache it locally
 */
async function fetchSystemPromptFromGitHub(): Promise<string | null> {
  try {
    const response = await fetch('https://raw.githubusercontent.com/Emmanuek5/Kalpana-agent/main/system.txt');
    
    if (!response.ok) {
      return null;
    }
    
    const systemPrompt = await response.text();
    
    // Cache it locally
    try {
      const fs = await import("node:fs/promises");
      const kalpanaDir = await ensureKalpanaDir();
      const cachedPath = path.join(kalpanaDir, 'system.txt');
      
      await fs.writeFile(cachedPath, systemPrompt, 'utf8');
    } catch (cacheError) {
      // Ignore cache errors
    }
    
    return systemPrompt;
  } catch (error) {
    return null;
  }
}

export async function buildSystemPrompt(): Promise<string> {
  let system: string | undefined = undefined;
  
  if (!system) {
    try {
      const fs = await import("node:fs/promises");
      
      // Get the directory where this module is located
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      
      // Get Kalpana config directory
      const kalpanaDir = await ensureKalpanaDir();
      const cachedSystemPath = path.join(kalpanaDir, 'system.txt');
      
      // Try multiple possible locations for system.txt
      const possiblePaths = [
        // For compiled JS: dist/src/agents/ -> package root
        path.resolve(__dirname, '..', '..', '..', 'system.txt'),
        // For TypeScript source: src/agents/ -> package root  
        path.resolve(__dirname, '..', '..', 'system.txt'),
        // Current working directory (development fallback)
        path.resolve(process.cwd(), 'system.txt'),
        // Cached version in ~/.kalpana/
        cachedSystemPath,
        // Relative to this file
        path.resolve(__dirname, 'system.txt')
      ];
      
      for (const systemPath of possiblePaths) {
        try {
          system = await fs.readFile(systemPath, "utf8");
          break;
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  // If still no system prompt, try fetching from GitHub
  if (!system) {
    const githubSystem = await fetchSystemPromptFromGitHub();
    if (githubSystem) {
      system = githubSystem;
    }
  }
  
  // Ultimate fallback
  if (!system) {
    system =
      "You are a helpful, concise AI agent with expert developer skills. Prefer step-by-step tool use and precise answers. If a tool fails, continue with alternative approaches and report the issue.";
  }
  
  system += `\n  Today's date is ${new Date().toLocaleDateString()}. \n  `;
  return system;
}
