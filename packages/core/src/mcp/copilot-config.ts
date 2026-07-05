import { existsSync } from "fs";
import fs from "fs/promises";
import { homedir } from "os";
import path from "path";
import { getConfig } from "../config/index.js";

/**
 * GitHub Copilot configuration directory
 */
function getCopilotConfigDir(): string {
  return path.join(homedir(), ".copilot");
}

/**
 * Path to Copilot MCP configuration file
 */
function getMCPConfigPath(): string {
  return path.join(getCopilotConfigDir(), "mcp.json");
}

/**
 * MCP Server configuration for Copilot CLI
 */
interface CopilotMCPConfig {
  mcpServers?: {
    [key: string]: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
  };
}

/**
 * Configure Copilot CLI to use Playwright MCP server.
 * Uses headless setting from config.
 */
export async function configurePlaywrightMCP(): Promise<void> {
  try {
    const configDir = getCopilotConfigDir();
    const configPath = getMCPConfigPath();

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      await fs.mkdir(configDir, { recursive: true });
    }

    // Read existing config or create new one
    let config: CopilotMCPConfig = {};
    if (existsSync(configPath)) {
      const content = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(content);
    }

    // Get headless setting from JARVIS config
    const jarvisConfig = getConfig();
    const headlessValue = jarvisConfig.browser.headless ? "true" : "false";

    // Add Playwright MCP server configuration
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers["playwright"] = {
      command: "npx",
      args: ["@playwright/mcp"],
      env: {
        PLAYWRIGHT_HEADLESS: headlessValue,
      },
    };

    // Write updated config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`[MCP Config] Playwright MCP configured at: ${configPath}`);
  } catch (error) {
    console.error("[MCP Config] Failed to configure Playwright MCP:", error);
    throw error;
  }
}

/**
 * Check if Playwright MCP is configured in Copilot CLI
 */
export async function isPlaywrightMCPConfigured(): Promise<boolean> {
  try {
    const configPath = getMCPConfigPath();
    if (!existsSync(configPath)) {
      return false;
    }

    const content = await fs.readFile(configPath, "utf-8");
    const config: CopilotMCPConfig = JSON.parse(content);

    return !!(config.mcpServers && config.mcpServers["playwright"]);
  } catch (error) {
    console.error("[MCP Config] Failed to check MCP configuration:", error);
    return false;
  }
}

/**
 * Get the current MCP configuration
 */
export async function getMCPConfig(): Promise<CopilotMCPConfig | null> {
  try {
    const configPath = getMCPConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }

    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("[MCP Config] Failed to read MCP configuration:", error);
    return null;
  }
}
