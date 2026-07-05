/**
 * Agent Definition Types
 *
 * Agents replace the old persona system. Each agent is defined by an .agent.md
 * file (YAML frontmatter + markdown body) and encapsulates a system prompt,
 * model preference, MCP server requirements, and tool access.
 */

import type { MCPServerConfig } from "../types.js";

/**
 * Full agent definition parsed from an .agent.md file.
 */
export interface AgentDefinition {
  /** Unique identifier (e.g. "pw-mcp-agent") */
  name: string;
  /** Human-readable name (e.g. "Playwright MCP Agent") */
  displayName: string;
  /** Short badge label shown in execution logs (e.g. "PW MCP", "Orca") */
  tag?: string;
  /** Short description of what this agent does */
  description: string;
  /** Preferred model (e.g. "claude-sonnet-4") */
  model?: string;
  /** Tool names this agent can use, or ["*"] for all */
  tools?: string[];
  /** Category for grouping (e.g. "web-ui-testing") */
  category: string;
  /** MCP servers this agent requires */
  mcpServers?: Record<string, MCPServerConfig>;
  /** Skill names to inject into the agent's session */
  skills?: string[];
  /** Full system prompt (markdown body from .agent.md) */
  prompt: string;
  /** Whether this agent is enabled */
  enabled: boolean;
  /** True for built-in agents, false for user-provided */
  builtIn: boolean;
  /** Source .agent.md file path */
  filePath?: string;
}

/**
 * Lightweight metadata for listing agents (no prompt body).
 */
export interface AgentMetadata {
  name: string;
  displayName: string;
  tag?: string;
  description: string;
  category: string;
  model?: string;
  enabled: boolean;
  builtIn: boolean;
}

/**
 * Extract metadata from a full agent definition.
 */
export function toAgentMetadata(agent: AgentDefinition): AgentMetadata {
  return {
    name: agent.name,
    displayName: agent.displayName,
    tag: agent.tag,
    description: agent.description,
    category: agent.category,
    model: agent.model,
    enabled: agent.enabled,
    builtIn: agent.builtIn,
  };
}
