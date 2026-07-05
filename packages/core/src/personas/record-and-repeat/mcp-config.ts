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
 * MCP Server configuration for Workflow Observer persona.
 * Uses Playwright MCP for replay functionality.
 * Note: This is a getter function to ensure config is loaded dynamically.
 */
export function getPlaywrightMCPConfig(): MCPServerConfig {
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
 * Static config for backward compatibility.
 * Prefer using getPlaywrightMCPConfig() for dynamic config.
 */
export const PLAYWRIGHT_MCP_CONFIG: MCPServerConfig = {
  id: "playwright-mcp",
  name: "Playwright MCP Server",
  packageName: "@playwright/mcp",
  command: "npx",
  args: ["@playwright/mcp"],
  env: {
    // Default to headless mode; will be overridden at runtime
    PLAYWRIGHT_HEADLESS: "true",
  },
};
