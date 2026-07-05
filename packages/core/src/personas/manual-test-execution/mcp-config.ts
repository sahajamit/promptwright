import { getConfig } from "../../config/index.js";
import type { MCPServerConfig } from "../types.js";

/**
 * Get the PLAYWRIGHT_HEADLESS environment value based on config.
 * Note: PLAYWRIGHT_HEADLESS="false" means headed mode (visible browser).
 */
function getHeadlessEnvValue(): string {
  const config = getConfig();
  // PLAYWRIGHT_HEADLESS env var is inverted: "false" = headed, "true" = headless
  return config.browser.headless ? "true" : "false";
}

/**
 * MCP Server configuration for Manual Test Execution persona.
 * Note: This is a getter function to ensure config is loaded dynamically.
 */
export function getPlaywrightMCPBaseConfig(): MCPServerConfig {
  return {
    id: "playwright-mcp",
    name: "Playwright MCP Server",
    packageName: "@playwright/mcp",
    command: "npx",
    args: ["@playwright/mcp"],
    env: {
      PLAYWRIGHT_HEADLESS: getHeadlessEnvValue(),
    },
  };
}

/**
 * Static config for backward compatibility (uses current config at import time).
 * Prefer using getPlaywrightMCPBaseConfig() for dynamic config.
 */
export const PLAYWRIGHT_MCP_CONFIG: MCPServerConfig = {
  id: "playwright-mcp",
  name: "Playwright MCP Server",
  packageName: "@playwright/mcp",
  command: "npx",
  args: ["@playwright/mcp"],
  env: {
    // Default to headless mode; will be overridden by getPlaywrightMCPConfig
    PLAYWRIGHT_HEADLESS: "true",
  },
};

/**
 * Get Playwright MCP configuration with optional CDP endpoint.
 * This is the preferred way to get MCP config as it reads from the config file.
 */
export function getPlaywrightMCPConfig(cdpEndpoint?: string): MCPServerConfig {
  const args = ["@playwright/mcp"];

  if (cdpEndpoint) {
    args.push("--cdp-endpoint", cdpEndpoint);
  }

  return {
    ...getPlaywrightMCPBaseConfig(),
    args,
  };
}
