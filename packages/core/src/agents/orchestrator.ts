/**
 * Orchestrator Agent
 *
 * High-level agent that classifies user intent and routes to specialized
 * sub-agents via the route_to_agent tool. Manages the orchestrator
 * Copilot session and coordinates with AgentSessionManager.
 */

import { approveAll, type CopilotSession, type SessionConfig, type Tool } from "@github/copilot-sdk";
import { EventEmitter } from "events";
import { toSDKProviderConfig } from "../config/provider.js";
import type { JarvisEvent, JarvisEventHandler } from "../types.js";
import type { AgentRegistry } from "./registry.js";
import type { AgentSessionManager } from "./session-manager.js";
import type { AgentRuntimeContext } from "./session-manager.js";
import { createListAgentsTool } from "./tools/list-agents.js";
import { createRouteToAgentTool } from "./tools/route-to-agent.js";

export interface OrchestratorOptions {
  /** Model for the orchestrator (default: claude-sonnet-4-5-20250514) */
  model?: string;
  /** Reasoning effort level for models that support it (e.g. "medium") */
  reasoningEffort?: string;
  /** Whether to auto-route (vs requiring explicit agent selection) */
  autoRoute?: boolean;
  /** Additional MCP servers config override callback */
  getMCPOverrides?: () => Record<string, any> | undefined;
  /** Runtime context override callback for sub-agent sessions */
  getAgentRuntimeContext?: (agentName: string) => AgentRuntimeContext | undefined;
  /** Preferred browser automation mode ("playwright-mcp" | "playwright-cli") */
  automationMode?: "playwright-mcp" | "playwright-cli";
  /** Verbose logging */
  verbose?: boolean;
  /** Permission handler for sub-agent sessions */
  permissionHandler?: SessionConfig["onPermissionRequest"];
  /** Custom provider config for BYOK */
  provider?: {
    type: "azure" | "openai" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    azureApiVersion?: string;
    model: string;
  };
}

export class OrchestratorAgent extends EventEmitter {
  private registry: AgentRegistry;
  private sessionManager: AgentSessionManager;
  private options: OrchestratorOptions;
  private orchestratorSession: CopilotSession | null = null;
  private initialized = false;

  constructor(
    registry: AgentRegistry,
    sessionManager: AgentSessionManager,
    options: OrchestratorOptions = {},
  ) {
    super();
    this.registry = registry;
    this.sessionManager = sessionManager;
    this.options = options;

    // Forward events from session manager
    this.sessionManager.on("jarvis-event", (event: JarvisEvent) => {
      this.emit("jarvis-event", event);
    });
  }

  /**
   * Initialize the orchestrator session.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Build orchestrator tools
    const tools: Tool<any>[] = [
      createRouteToAgentTool(
        this.registry,
        this.sessionManager,
        this.options.getMCPOverrides,
        (agentName: string) => {
          const userContext = this.options.getAgentRuntimeContext?.(agentName);
          return {
            ...userContext,
            fallbackModel: userContext?.fallbackModel ?? this.options.model,
          };
        },
        this.options.provider
          ? () => toSDKProviderConfig(this.options.provider!)
          : undefined,
      ),
      createListAgentsTool(this.registry),
    ];

    // Build the orchestrator system prompt with agent listing
    const agentListing = this.registry.getEnabled().map((a) =>
      `- **${a.name}** (${a.displayName}): ${a.description} [category: ${a.category}]`
    ).join("\n");

    const orchestratorDef = this.registry.get("orchestrator");
    const basePrompt = orchestratorDef?.prompt ?? this.getDefaultOrchestratorPrompt();

    // Inject automation mode preference if configured
    const automationHint = this.options.automationMode
      ? `\n\n## Web Automation Preference\n\nThe user has configured **${this.options.automationMode}** as the preferred browser automation mode. When routing web UI testing tasks, prefer the **${this.options.automationMode === "playwright-mcp" ? "pw-mcp-agent" : "pw-cli-agent"}** agent.`
      : "";

    const systemPrompt = `${basePrompt}\n\n## Currently Registered Agents\n\n${agentListing}${automationHint}`;

    const sessionConfig: SessionConfig = {
      streaming: true,
      tools,
      systemMessage: {
        mode: "replace",
        content: systemPrompt,
      },
      onPermissionRequest: this.options.permissionHandler ?? approveAll,
      ...(this.options.model ? { model: this.options.model } : {}),
      ...(this.options.reasoningEffort ? { reasoningEffort: this.options.reasoningEffort as any } : {}),
      ...(this.options.provider ? { provider: toSDKProviderConfig(this.options.provider) } : {}),
    };

    try {
      this.orchestratorSession = await this.sessionManager.createOrchestratorSession(sessionConfig);
    } catch (err: any) {
      // If the model doesn't support reasoningEffort, retry without it
      if (this.options.reasoningEffort && err?.message?.includes("does not support reasoning effort")) {
        console.warn(`[Orchestrator] Model does not support reasoningEffort, retrying without it`);
        const { reasoningEffort: _, ...configWithoutEffort } = sessionConfig as any;
        this.orchestratorSession = await this.sessionManager.createOrchestratorSession(configWithoutEffort as SessionConfig);
      } else {
        throw err;
      }
    }

    const orchestratorTag = orchestratorDef?.tag ?? "Orca";

    // Subscribe to orchestrator session events (for the orchestrator's own output)
    this.orchestratorSession.on((event) => {
      const jarvisEvent = this.transformOrchestratorEvent(event);
      if (jarvisEvent) {
        (jarvisEvent as any)._agentName = "orchestrator";
        (jarvisEvent as any)._agentDisplayName = orchestratorDef?.displayName ?? "Orchestrator";
        (jarvisEvent as any)._agentTag = orchestratorTag;
        this.emit("jarvis-event", jarvisEvent);
      }
    });

    this.initialized = true;
    this.log("debug", "Orchestrator initialized");
  }

  /**
   * Process a user query through the orchestrator.
   * The orchestrator classifies intent and routes to the appropriate sub-agent.
   */
  async processQuery(prompt: string): Promise<string> {
    if (!this.orchestratorSession) {
      throw new Error("Orchestrator not initialized. Call initialize() first.");
    }

    this.emit("jarvis-event", { type: "orchestrator:classifying" } as any);

    try {
      const response = await this.orchestratorSession.sendAndWait(
        { prompt },
        600000, // 10 minute timeout
      );

      return response?.data.content || "";
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit("jarvis-event", {
        type: "session_error",
        error: `Orchestrator error: ${errorMsg}`,
      });
      throw error;
    }
  }

  /**
   * Send a message directly to a specific agent (bypasses orchestrator).
   */
  async processDirectAgentQuery(agentName: string, prompt: string): Promise<string> {
    const agent = this.registry.get(agentName);
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    const runtimeContext = this.options.getAgentRuntimeContext?.(agentName);
    // Command-tool agents (pw-cli, api-test) drive the browser via run_command and
    // must NOT get the Playwright MCP server injected — doing so confuses the model
    // with redundant tools and breaks the tool permission flow ("Unhandled permission
    // result kind"). Only MCP-based agents receive MCP overrides.
    const mcpOverrides = runtimeContext?.useCommandTool ? undefined : this.options.getMCPOverrides?.();
    const providerConfig = this.options.provider ? toSDKProviderConfig(this.options.provider) : undefined;
    const configOverrides: Record<string, any> = {};
    if (mcpOverrides) configOverrides.mcpServers = mcpOverrides;
    if (providerConfig) configOverrides.provider = providerConfig;
    const contextWithFallback = {
      ...runtimeContext,
      fallbackModel: runtimeContext?.fallbackModel ?? this.options.model,
    };

    const hasOverrides = Object.keys(configOverrides).length > 0;
    const session = await this.sessionManager.spawnAgentSession(
      agent,
      hasOverrides ? configOverrides : undefined,
      contextWithFallback,
    );

    const response = await session.sendAndWait(
      { prompt },
      300000, // 5 minute timeout
    );

    // In direct-agent mode there is no orchestrator turn that goes idle — the
    // sub-agent's completion IS the end of execution. The UI ignores session_idle
    // tagged with a sub-agent name (sub-agents finish their own turns mid-
    // orchestration), so emit a top-level idle tagged as the orchestrator to
    // signal the whole run is done. Without this the UI stays stuck on "Thinking".
    this.emit("jarvis-event", { type: "session_idle", _agentName: "orchestrator" } as any);

    return response?.data.content || "";
  }

  /**
   * Abort current execution.
   */
  async abort(): Promise<void> {
    // Abort active agent session first
    const agentSession = this.sessionManager.getActiveAgentSession();
    if (agentSession) {
      try { await agentSession.abort(); } catch { /* ignore */ }
    }

    // Then abort orchestrator
    if (this.orchestratorSession) {
      try { await this.orchestratorSession.abort(); } catch { /* ignore */ }
    }
  }

  /**
   * Cleanup orchestrator and all sub-agent sessions.
   */
  async destroy(): Promise<void> {
    await this.sessionManager.destroy();
    this.orchestratorSession = null;
    this.initialized = false;
  }

  /**
   * Subscribe to events.
   */
  onEvent(handler: JarvisEventHandler): () => void {
    this.on("jarvis-event", handler);
    return () => this.off("jarvis-event", handler);
  }

  /**
   * Get current active agent name.
   */
  getActiveAgentName(): string | null {
    return this.sessionManager.getActiveAgentName();
  }

  /**
   * Get the registry.
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  private transformOrchestratorEvent(event: any): JarvisEvent | null {
    switch (event.type) {
      case "assistant.message_delta":
        return { type: "message_delta", content: event.data.deltaContent || "" };
      case "assistant.message":
        return {
          type: "message_complete",
          content: event.data.content || "",
          id: event.data.id || crypto.randomUUID(),
        };
      case "tool.execution_start":
        // Check if it's routing to an agent
        if (event.data.toolName === "route_to_agent") {
          try {
            const args = typeof event.data.arguments === "string"
              ? JSON.parse(event.data.arguments)
              : event.data.arguments;
            this.emit("jarvis-event", {
              type: "orchestrator:agent_selected",
              agent: args.agentName,
              reason: args.taskDescription?.substring(0, 100) || "",
              model: this.registry.get(args.agentName)?.model || "default",
            } as any);
          } catch { /* ignore parse errors */ }
        }
        return {
          type: "tool_start",
          toolName: event.data.toolName || "unknown",
          toolCallId: event.data.toolCallId || "",
          args: event.data.arguments,
        };
      case "tool.execution_complete":
        return {
          type: "tool_complete",
          toolCallId: event.data.toolCallId || "",
          result: event.data.result || "",
        };
      case "assistant.usage":
        return {
          type: "usage_update",
          data: {
            model: event.data.model,
            inputTokens: event.data.inputTokens || 0,
            outputTokens: event.data.outputTokens || 0,
            cacheReadTokens: event.data.cacheReadTokens || 0,
            cacheWriteTokens: event.data.cacheWriteTokens || 0,
            cost: event.data.cost,
            duration: event.data.duration,
            quotaSnapshots: event.data.quotaSnapshots,
          },
        };
      case "session.idle":
        return { type: "session_idle" };
      case "session.error":
        return { type: "session_error", error: event.data.message || "Unknown error" };
      default:
        return null;
    }
  }

  private getDefaultOrchestratorPrompt(): string {
    return `You are the Promptwright orchestrator. Route user requests to the best specialized agent using the route_to_agent tool.`;
  }

  private log(level: "debug" | "info" | "error", message: string): void {
    if (this.options.verbose) {
      this.emit("jarvis-event", {
        type: "debug_log",
        level,
        message: `[Orchestrator] ${message}`,
      });
    }
  }
}
