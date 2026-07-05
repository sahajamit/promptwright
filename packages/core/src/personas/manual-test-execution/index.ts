import path from "path";
import { fileURLToPath } from "url";
import type { Persona, MCPServerConfig } from "../types.js";
import { PLAYWRIGHT_MCP_CONFIG, getPlaywrightMCPConfig } from "./mcp-config.js";
import { MANUAL_TEST_EXECUTION_SYSTEM_PROMPT, buildCLISystemPrompt, buildSystemPrompt } from "./system-prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Manual Test Execution Persona
 * 
 * Executes manual test cases using browser automation with Playwright.
 * Accepts natural language or Gherkin/BDD format test cases.
 * 
 * This persona supports dynamic MCP server configuration - when additional
 * MCP servers are added (like Atlassian for Jira), the system prompt will
 * automatically include information about all available tools.
 */
export const MANUAL_TEST_EXECUTION_PERSONA: Persona = {
  id: "manual-test-execution",
  name: "AI QA Assistant",
  description: "Run manual web tests with AI assistance. Supports test scenarios written in plain English or Gherkin/BDD syntax.",
  icon: "🛡️", // Shield emoji representing QA protection
  systemPrompt: MANUAL_TEST_EXECUTION_SYSTEM_PROMPT,
  /**
   * Build system prompt dynamically based on configured MCP servers.
   * This allows the persona to adapt when new MCP servers are added
   * (e.g., Atlassian for Jira, GitHub, etc.)
   */
  buildSystemPrompt: (mcpServers: MCPServerConfig[]) => {
    return buildSystemPrompt(mcpServers.map(mcp => ({
      id: mcp.id,
      name: mcp.name,
      packageName: mcp.packageName,
    })));
  },
  requiredMCPs: [PLAYWRIGHT_MCP_CONFIG],
  skillPath: path.join(__dirname, "SKILL.md"),
  enabled: true,
};

// Export the config function for use in main process
export { getPlaywrightMCPConfig };

// Export CLI system prompt builder for use in main process
export { buildCLISystemPrompt };
