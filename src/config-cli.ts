#!/usr/bin/env node

/**
 * Kalpana Config CLI - Configuration management tool
 */

import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  removeConfigValue,
  displayConfig,
  setupConfig,
  getConfigPath,
  configExists,
  validateConfig,
  type KalpanaConfig
} from "./config.js";

const USAGE = `
${chalk.cyan('Kalpana Configuration Tool')}

${chalk.yellow('Usage:')}
  kalpana config <command> [options]

${chalk.yellow('Commands:')}
  setup                     Interactive configuration setup
  show                      Display current configuration
  get <key>                 Get a configuration value
  set <key> <value>         Set a configuration value
  unset <key>               Remove a configuration value
  path                      Show configuration file path
  validate                  Validate configuration
  reset                     Reset configuration (remove all settings)
  mcp                       Open MCP servers configuration file

${chalk.yellow('Examples:')}
  kalpana config setup
  kalpana config show
  kalpana config set OPENROUTER_API_KEY sk-or-v1-xxx
  kalpana config get OPENROUTER_API_KEY
  kalpana config unset CONTEXT7_API_KEY
  kalpana config mcp

${chalk.yellow('Available Configuration Keys:')}
  OPENROUTER_API_KEY        OpenRouter API key (required)
  HYPERBROWSER_API_KEY      HyperBrowser API key for web automation
  CONTEXT7_API_KEY          Context7 API key for documentation
  GEMINI_API_KEY            Google Gemini API key for analysis
  GOOGLE_CLIENT_ID          Google OAuth client ID
  GOOGLE_CLIENT_SECRET      Google OAuth client secret
  MODEL_ID                  Default AI model
  SUB_AGENT_MODEL_ID        Sub-agent AI model
  GEMINI_MODEL              Default Gemini model
  AI_SYSTEM                 Custom system prompt file
  SANDBOX_VOLUME_PATH       Default sandbox directory
  DOCKER_HOST               Docker host connection
  HISTORY_FILE              Conversation history file
`;

/**
 * Open the MCP configuration file in the user's default editor
 */
async function openMcpConfig() {
  const mcpConfigPath = join(homedir(), 'mcp.json');
  
  console.log(chalk.cyan('🔧 MCP Configuration'));
  console.log(`File location: ${chalk.yellow(mcpConfigPath)}`);
  
  // Check if file exists
  if (!existsSync(mcpConfigPath)) {
    console.log(chalk.yellow('⚠️  MCP configuration file does not exist.'));
    console.log('Creating a new mcp.json file...');
    
    // Create a basic mcp.json template
    const fs = await import('node:fs/promises');
    const template = {
      "mcpServers": {
        "example-server": {
          "command": "node",
          "args": ["path/to/your/mcp-server.js"],
          "env": {
            "API_KEY": "your-api-key-here"
          }
        }
      }
    };
    
    try {
      await fs.writeFile(mcpConfigPath, JSON.stringify(template, null, 2), 'utf8');
      console.log(chalk.green('✅ Created new mcp.json file with example configuration'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to create mcp.json:'), (error as Error).message);
      return;
    }
  }
  
  // Try to open the file in the default editor
  console.log('Opening MCP configuration file...');
  
  try {
    // Determine the appropriate command based on platform
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = isWindows ? ['', mcpConfigPath] : [mcpConfigPath];
    
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      shell: isWindows
    });
    
    child.unref();
    console.log(chalk.green('✅ MCP configuration file opened in default editor'));
    console.log('');
    console.log(chalk.cyan('💡 Tips:'));
    console.log('  • Add your MCP servers to the "mcpServers" object');
    console.log('  • Each server needs a "command" and "args" array');
    console.log('  • Use "env" to set environment variables for the server');
    console.log('  • Restart Kalpana after making changes');
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to open file:'), (error as Error).message);
    console.log('');
    console.log(chalk.yellow('You can manually edit the file at:'));
    console.log(chalk.cyan(mcpConfigPath));
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }
  
  const command = args[0];
  
  try {
    switch (command) {
      case 'setup':
        await setupConfig();
        break;
        
      case 'show':
        await displayConfig();
        break;
        
      case 'get':
        if (args.length < 2) {
          console.error(chalk.red('❌ Error: Missing key argument'));
          console.log('Usage: kalpana config get <key>');
          process.exit(1);
        }
        const value = await getConfigValue(args[1] as keyof KalpanaConfig);
        if (value) {
          console.log(value);
        } else {
          console.log(chalk.yellow(`Key '${args[1]}' not found`));
          process.exit(1);
        }
        break;
        
      case 'set':
        if (args.length < 3) {
          console.error(chalk.red('❌ Error: Missing key or value argument'));
          console.log('Usage: kalpana config set <key> <value>');
          process.exit(1);
        }
        await setConfigValue(args[1] as keyof KalpanaConfig, args[2] || '');
        console.log(chalk.green(`✅ Set ${args[1]} = ${args[2]}`));
        break;
        
      case 'unset':
        if (args.length < 2) {
          console.error(chalk.red('❌ Error: Missing key argument'));
          console.log('Usage: kalpana config unset <key>');
          process.exit(1);
        }
        await removeConfigValue(args[1] as keyof KalpanaConfig);
        console.log(chalk.green(`✅ Removed ${args[1]}`));
        break;
        
      case 'path':
        console.log(getConfigPath());
        break;
        
      case 'validate':
        const validation = await validateConfig();
        if (validation.valid) {
          console.log(chalk.green('✅ Configuration is valid'));
        } else {
          console.log(chalk.red('❌ Configuration is invalid'));
          console.log(chalk.yellow('Missing required keys:'));
          validation.missing.forEach(key => {
            console.log(`  - ${key}`);
          });
          process.exit(1);
        }
        break;
        
      case 'reset':
        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.yellow('⚠️  Are you sure you want to reset all configuration? (y/N): '), resolve);
        });
        
        rl.close();
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await saveConfig({});
          console.log(chalk.green('✅ Configuration reset successfully'));
        } else {
          console.log('Reset cancelled');
        }
        break;
        
      case 'mcp':
        await openMcpConfig();
        break;
        
      default:
        console.error(chalk.red(`❌ Unknown command: ${command}`));
        console.log(USAGE);
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ Error:'), (error as Error).message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});
