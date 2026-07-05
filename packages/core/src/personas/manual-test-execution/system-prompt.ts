/**
 * System prompt for Manual Test Execution persona
 * 
 * OPTIMIZED FOR SPEED: Minimal prompt to match copilot CLI performance.
 * The model already knows how to use Playwright tools - excessive instructions
 * cause over-thinking and slow execution.
 */

/**
 * Base system prompt template - MINIMAL VERSION
 * Contains {{MCP_SERVERS_INFO}} placeholder for dynamic MCP server injection
 */
export const MANUAL_TEST_EXECUTION_SYSTEM_PROMPT_TEMPLATE = `Execute test steps using Playwright MCP tools.

{{MCP_SERVERS_INFO}}

Rules:
- Execute one action per tool call
- Use element refs from snapshots when available
- After completing all test steps, you MUST provide your final verdict message in this EXACT format:
  
  SUCCESS: "TEST PASSED: [brief summary of what was verified]"
  FAILURE: "TEST FAILED: [which step failed and why]"
  
  CRITICAL: The final message must contain the exact text "TEST PASSED:" or "TEST FAILED:" followed by a colon. This is required for proper UI rendering.
`;

/**
 * Generate MCP servers info section for the system prompt
 * OPTIMIZED: Minimal description - the model discovers tools automatically
 */
export function generateMCPServersInfo(mcpServers: Array<{ id: string; name: string; packageName: string }>): string {
  if (!mcpServers || mcpServers.length === 0) {
    return "Tools: Playwright browser automation";
  }

  const serverNames = mcpServers.map(server => server.name).join(", ");
  return `Tools: ${serverNames}`;
}

/**
 * Build the complete system prompt with MCP server information injected
 * @param mcpServers - Array of MCP server configurations
 * @returns Complete system prompt with MCP info
 */
export function buildSystemPrompt(mcpServers: Array<{ id: string; name: string; packageName: string }>): string {
  const mcpInfo = generateMCPServersInfo(mcpServers);
  return MANUAL_TEST_EXECUTION_SYSTEM_PROMPT_TEMPLATE.replace('{{MCP_SERVERS_INFO}}', mcpInfo);
}

/**
 * Default system prompt (for backwards compatibility)
 * Uses Playwright MCP as the default configuration
 */
export const MANUAL_TEST_EXECUTION_SYSTEM_PROMPT = buildSystemPrompt([
  { id: "playwright", name: "Playwright MCP Server", packageName: "@playwright/mcp" }
]);

/**
 * Build system prompt for CLI mode - minimal, token-efficient.
 * In CLI mode, the LLM uses playwright-cli commands via run_command instead of MCP tools.
 */
export function buildCLISystemPrompt(): string {
  return `Execute test steps using playwright-cli commands via the run_command tool.

Rules:
- Use run_command for every command execution.
- Do NOT use bash or powershell tools.
- A Chrome browser is already running with remote debugging on http://localhost:9222.
- FIRST call "playwright-cli attach --cdp=http://localhost:9222" to attach to the already-running Chrome (it does NOT launch a new browser). Do NOT use "playwright-cli open" — that launches a separate browser the user cannot see.
- Then navigate: playwright-cli goto <url>
- Get element refs: playwright-cli snapshot
- Interact using refs: playwright-cli click e15, playwright-cli fill e5 "text"
- Only the "attach" command needs --cdp. Other commands do NOT need it.
- Do NOT pass --headed or --browser flags
- One action per command
- After all steps, verdict MUST be:
  SUCCESS: "TEST PASSED: [summary]"
  FAILURE: "TEST FAILED: [step that failed and why]"
`;
}
