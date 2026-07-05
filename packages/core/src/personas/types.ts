/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  /** Unique identifier for the MCP server */
  id: string;
  /** Display name */
  name: string;
  /** Server package name (e.g., '@playwright/mcp') */
  packageName: string;
  /** Command to run the server */
  command: string;
  /** Optional arguments for the server */
  args?: string[];
  /** Optional environment variables */
  env?: Record<string, string>;
}

/**
 * Persona Definition
 * 
 * Each persona represents a specialized testing assistant with its own
 * system prompt, MCP servers, and agent skills.
 */
export interface Persona {
  /** Unique identifier (e.g., 'manual-test-execution') */
  id: string;
  /** Display name */
  name: string;
  /** Short description of what this persona does */
  description: string;
  /** Icon identifier for UI display */
  icon: string;
  /** 
   * System prompt that defines AI behavior.
   * This is the default/static prompt. For dynamic prompts, use buildSystemPrompt.
   */
  systemPrompt: string;
  /** 
   * Optional function to build system prompt dynamically based on MCP servers.
   * If provided, this will be called with the configured MCP servers to generate
   * a context-aware system prompt.
   */
  buildSystemPrompt?: (mcpServers: MCPServerConfig[]) => string;
  /** Required MCP servers for this persona */
  requiredMCPs: MCPServerConfig[];
  /** Path to agent skill markdown file (optional) */
  skillPath?: string;
  /** Whether this persona is enabled */
  enabled: boolean;
}

/**
 * Persona Manager Events
 */
export type PersonaManagerEvent =
  | { type: "persona_selected"; persona: Persona }
  | { type: "persona_changed"; from: string; to: string }
  | { type: "mcp_installing"; mcpId: string }
  | { type: "mcp_installed"; mcpId: string }
  | { type: "mcp_install_failed"; mcpId: string; error: string }
  | { type: "mcp_started"; mcpId: string }
  | { type: "mcp_stopped"; mcpId: string };

/**
 * Event handler function type
 */
export type PersonaManagerEventHandler = (event: PersonaManagerEvent) => void;
