/**
 * route_to_agent Tool
 *
 * Called by the orchestrator LLM to delegate work to a specialized sub-agent.
 * Spawns a sub-agent session, sends the task, and returns the result.
 */

import type { Tool, ToolInvocation } from "@github/copilot-sdk";
import type { AgentRegistry } from "../registry.js";
import type { AgentSessionManager } from "../session-manager.js";
import type { AgentRuntimeContext } from "../session-manager.js";

interface RouteToAgentArgs {
  agentName: string;
  taskDescription: string;
}

/**
 * Create the route_to_agent tool wired to the given registry and session manager.
 */
export function createRouteToAgentTool(
  registry: AgentRegistry,
  sessionManager: AgentSessionManager,
  getMCPOverrides?: () => Record<string, any> | undefined,
  getAgentRuntimeContext?: (agentName: string) => AgentRuntimeContext | undefined,
  getProviderOverrides?: () => Record<string, any> | undefined,
): Tool<RouteToAgentArgs> {
  return {
    name: "route_to_agent",
    description: "Route the current task to a specialized agent for execution. The agent will perform the task and return its result.",
    parameters: {
      type: "object",
      properties: {
        agentName: {
          type: "string",
          description: "Name of the agent to route to (e.g. 'pw-mcp-agent', 'api-test-agent')",
        },
        taskDescription: {
          type: "string",
          description: "Detailed description of what the agent should do, including all context from the user's request",
        },
      },
      required: ["agentName", "taskDescription"],
    } as any,
    handler: async (args: RouteToAgentArgs, _invocation: ToolInvocation): Promise<string> => {
      const { agentName, taskDescription } = args;

      const agent = registry.get(agentName);
      if (!agent) {
        const available = registry.getEnabled().map((a) => a.name).join(", ");
        return `Error: Agent '${agentName}' not found. Available agents: ${available}`;
      }

      if (!agent.enabled) {
        return `Error: Agent '${agentName}' is disabled.`;
      }

      try {
        // Get MCP overrides (e.g., from desktop main process for packaged mode)
        // Spawn the sub-agent session
        const runtimeContext = getAgentRuntimeContext?.(agentName);
        // Command-tool agents (pw-cli, api-test) drive the browser via run_command
        // and must NOT get the Playwright MCP server injected (redundant tools +
        // broken permission flow). Only MCP-based agents receive MCP overrides.
        const mcpOverrides = runtimeContext?.useCommandTool ? undefined : getMCPOverrides?.();
        const providerOverrides = getProviderOverrides?.();
        const configOverrides: Record<string, any> = {};
        if (mcpOverrides) configOverrides.mcpServers = mcpOverrides;
        if (providerOverrides) configOverrides.provider = providerOverrides;
        const hasOverrides = Object.keys(configOverrides).length > 0;
        const session = await sessionManager.spawnAgentSession(
          agent,
          hasOverrides ? configOverrides : undefined,
          runtimeContext
        );

        // Send the task to the sub-agent and wait for completion
        const response = await session.sendAndWait(
          { prompt: taskDescription },
          300000, // 5 minute timeout for test execution
        );

        const result = response?.data.content || "Agent completed without a response.";

        // Emit completion event
        sessionManager.emit("jarvis-event", {
          type: "agent:complete",
          agent: agentName,
          result,
        });

        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `Error executing agent '${agentName}': ${errorMsg}`;
      }
    },
  };
}
