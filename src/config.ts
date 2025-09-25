import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";

export interface KalpanaConfig {
  OPENROUTER_API_KEY?: string;
  HYPERBROWSER_API_KEY?: string;
  CONTEXT7_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MODEL_ID?: string;
  SUB_AGENT_MODEL_ID?: string;
  GEMINI_MODEL?: string;
  AI_SYSTEM?: string;
  SANDBOX_VOLUME_PATH?: string;
  DOCKER_HOST?: string;
  HISTORY_FILE?: string;
  // Ollama Configuration
  AI_PROVIDER?: string; // 'openrouter' | 'ollama'
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".kalpana");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

/**
 * Load configuration from global config file
 */
export async function loadConfig(): Promise<KalpanaConfig> {
  try {
    await ensureConfigDir();
    const configData = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(configData);
  } catch (error) {
    // Config file doesn't exist or is invalid, return empty config
    return {};
  }
}

/**
 * Save configuration to global config file
 */
export async function saveConfig(config: KalpanaConfig): Promise<void> {
  try {
    await ensureConfigDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    throw new Error(`Failed to save config: ${(error as Error).message}`);
  }
}

/**
 * Get a specific config value
 */
export async function getConfigValue(
  key: keyof KalpanaConfig
): Promise<string | undefined> {
  const config = await loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 */
export async function setConfigValue(
  key: keyof KalpanaConfig,
  value: string
): Promise<void> {
  const config = await loadConfig();
  config[key] = value;
  await saveConfig(config);
}

/**
 * Remove a specific config value
 */
export async function removeConfigValue(
  key: keyof KalpanaConfig
): Promise<void> {
  const config = await loadConfig();
  delete config[key];
  await saveConfig(config);
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Check if config file exists
 */
export async function configExists(): Promise<boolean> {
  try {
    await fs.access(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load environment variables from both process.env and global config
 * Global config takes precedence over process.env
 */
export async function loadEnvironment(): Promise<void> {
  const config = await loadConfig();

  // Apply config values to process.env if they exist
  Object.entries(config).forEach(([key, value]) => {
    if (value && typeof value === "string") {
      process.env[key] = value;
    }
  });
}

/**
 * Validate required configuration
 */
export async function validateConfig(): Promise<{
  valid: boolean;
  missing: string[];
}> {
  const config = await loadConfig();
  const missing: string[] = [];

  // Check AI provider configuration
  const aiProvider =
    config.AI_PROVIDER || process.env.AI_PROVIDER || "openrouter";

  if (aiProvider === "ollama") {
    // For Ollama, we need base URL and model
    if (!config.OLLAMA_BASE_URL && !process.env.OLLAMA_BASE_URL) {
      missing.push("OLLAMA_BASE_URL");
    }
    if (
      !config.OLLAMA_MODEL &&
      !process.env.OLLAMA_MODEL &&
      !config.MODEL_ID &&
      !process.env.MODEL_ID
    ) {
      missing.push("OLLAMA_MODEL or MODEL_ID");
    }
  } else {
    // For OpenRouter, we need API key
    if (!config.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY) {
      missing.push("OPENROUTER_API_KEY");
    }
    if (!config.MODEL_ID && !process.env.MODEL_ID) {
      missing.push("MODEL_ID");
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Display current configuration (with sensitive values masked)
 */
export async function displayConfig(): Promise<void> {
  const config = await loadConfig();
  const configPath = getConfigPath();

  console.log(chalk.cyan("📋 Kalpana Configuration"));
  console.log(chalk.gray(`Config file: ${configPath}`));
  console.log("");

  if (Object.keys(config).length === 0) {
    console.log(
      chalk.yellow(
        '⚠️  No configuration found. Run "kalpana config setup" to get started.'
      )
    );
    return;
  }

  const sensitiveKeys = ["API_KEY", "SECRET", "TOKEN"];

  Object.entries(config).forEach(([key, value]) => {
    if (value) {
      const isSensitive = sensitiveKeys.some((sensitive) =>
        key.includes(sensitive)
      );
      const displayValue = isSensitive ? "***" + value.slice(-4) : value;
      const status = chalk.green("✓");
      console.log(`${status} ${chalk.bold(key)}: ${displayValue}`);
    }
  });
}

/**
 * Interactive configuration setup
 */
export async function setupConfig(): Promise<void> {
  console.log(chalk.cyan("🚀 Kalpana Configuration Setup"));
  console.log("");
  console.log(
    "This wizard will help you configure Kalpana with your API keys and preferences."
  );
  console.log("You can skip any optional settings by pressing Enter.");
  console.log("");

  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  try {
    const config: KalpanaConfig = {};

    // AI Provider selection
    console.log(chalk.yellow("🤖 AI Provider Configuration:"));
    const aiProvider = await question(
      "Choose AI provider (openrouter/ollama) [openrouter]: "
    );
    config.AI_PROVIDER = aiProvider.trim() || "openrouter";

    if (config.AI_PROVIDER === "ollama") {
      console.log(chalk.cyan("🦙 Configuring Ollama (local AI models)"));

      const ollamaUrl = await question(
        "Ollama Base URL [http://localhost:11434]: "
      );
      config.OLLAMA_BASE_URL = ollamaUrl.trim() || "http://localhost:11434";

      const ollamaModel = await question(
        "Default Ollama model (e.g., llama3.2, mistral, etc.): "
      );
      if (!ollamaModel.trim()) {
        console.log(
          chalk.red(
            "❌ Ollama model is required for Ollama provider. Setup cancelled."
          )
        );
        rl.close();
        return;
      }
      config.OLLAMA_MODEL = ollamaModel.trim();
      config.MODEL_ID = ollamaModel.trim(); // Set as default model ID
    } else {
      console.log(chalk.cyan("🌐 Configuring OpenRouter (cloud AI models)"));
      config.OPENROUTER_API_KEY = await question(
        "OpenRouter API Key (required): "
      );

      if (!config.OPENROUTER_API_KEY?.trim()) {
        console.log(
          chalk.red("❌ OpenRouter API Key is required. Setup cancelled.")
        );
        rl.close();
        return;
      }
    }

    console.log("");
    console.log(chalk.yellow("🌐 Web Automation (Optional):"));
    const hyperBrowserKey = await question(
      "HyperBrowser API Key (for web automation): "
    );
    if (hyperBrowserKey.trim()) config.HYPERBROWSER_API_KEY = hyperBrowserKey;

    console.log("");
    console.log(chalk.yellow("🔍 Documentation & Analysis (Optional):"));
    const context7Key = await question(
      "Context7 API Key (for documentation search): "
    );
    if (context7Key.trim()) config.CONTEXT7_API_KEY = context7Key;

    const geminiKey = await question(
      "Google Gemini API Key (for multi-modal analysis): "
    );
    if (geminiKey.trim()) config.GEMINI_API_KEY = geminiKey;

    console.log("");
    console.log(chalk.yellow("☁️  Google Drive Integration (Optional):"));
    const googleClientId = await question("Google OAuth Client ID: ");
    if (googleClientId.trim()) config.GOOGLE_CLIENT_ID = googleClientId;

    const googleClientSecret = await question("Google OAuth Client Secret: ");
    if (googleClientSecret.trim())
      config.GOOGLE_CLIENT_SECRET = googleClientSecret;

    console.log("");
    console.log(chalk.yellow("⚙️  Advanced Settings (Optional):"));
    const dockerHost = await question(
      "Docker Host (leave empty for auto-detection): "
    );
    if (dockerHost.trim()) config.DOCKER_HOST = dockerHost;

    const sandboxPath = await question(
      "Default Sandbox Path (leave empty for ./.sandbox): "
    );
    if (sandboxPath.trim()) config.SANDBOX_VOLUME_PATH = sandboxPath;

    await saveConfig(config);

    console.log("");
    console.log(chalk.green("✅ Configuration saved successfully!"));
    console.log(chalk.gray(`Config file: ${getConfigPath()}`));
    console.log("");
    console.log("You can now run:");
    console.log(chalk.cyan("  kalpana") + " - Start Kalpana");
    console.log(
      chalk.cyan("  kalpana config show") + " - View current configuration"
    );
    console.log(
      chalk.cyan("  kalpana config set <key> <value>") +
        " - Update specific settings"
    );
  } catch (error) {
    console.error(chalk.red("❌ Setup failed:"), (error as Error).message);
  } finally {
    rl.close();
  }
}
