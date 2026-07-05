/**
 * list_available_agents Tool
 *
 * Lets the orchestrator LLM see what specialized agents are available.
 */

import type { Tool, ToolInvocation } from "@github/copilot-sdk";
import type { AgentRegistry } from "../registry.js";

/**
 * Create the list_available_agents tool wired to the given registry.
 */
export function createListAgentsTool(registry: AgentRegistry): Tool {
  return {
    name: "list_available_agents",
    description: "List all available specialized agents with their names, descriptions, and categories.",
    parameters: {
      type: "object",
      properties: {},
    } as any,
    handler: async (_args: unknown, _invocation: ToolInvocation): Promise<string> => {
      const agents = registry.getEnabledMetadata();
      if (agents.length === 0) {
        return "No agents are currently available.";
      }

      const listing = agents.map((a) =>
        `- ${a.name} (${a.displayName}): ${a.description} [category: ${a.category}]${a.model ? ` [model: ${a.model}]` : ""}`
      ).join("\n");

      return `Available agents:\n${listing}`;
    },
  };
}
