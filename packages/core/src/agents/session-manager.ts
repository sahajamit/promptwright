/**
 * Agent Session Manager
 *
 * Manages multiple Copilot SDK sessions (orchestrator + sub-agent)
 * and proxies events through a unified "jarvis-event" channel.
 */

import { approveAll, CopilotClient, type CopilotSession, type SessionConfig, type SessionEvent } from "@github/copilot-sdk";
import { EventEmitter } from "events";
import type { JarvisEvent } from "../types.js";
import type { AgentDefinition } from "./types.js";
import { createRunCommandTool } from "./tools/run-command.js";

export interface AgentSessionInfo {
  session: CopilotSession;
  agentName: string;
  agentDisplayName: string;
  agentTag?: string;
  unsubscribe: () => void;
}

export interface AgentRuntimeContext {
  workDir?: string;
  env?: Record<string, string | undefined>;
  useCommandTool?: boolean;
  fallbackModel?: string;
}

export class AgentSessionManager extends EventEmitter {
  private client: CopilotClient;
  private orchestratorSession: CopilotSession | null = null;
  private activeAgent: AgentSessionInfo | null = null;
  private verbose: boolean;

  constructor(client: CopilotClient, verbose = false) {
    super();
    this.client = client;
    this.verbose = verbose;
  }

  /**
   * Create the orchestrator session (persistent for the lifetime of the app).
   */
  async createOrchestratorSession(config: SessionConfig): Promise<CopilotSession> {
    this.orchestratorSession = await this.client.createSession(config);
    this.log("debug", `Orchestrator session created: ${this.orchestratorSession.sessionId}`);
    return this.orchestratorSession;
  }

  /**
   * Get the orchestrator session.
   */
  getOrchestratorSession(): CopilotSession | null {
    return this.orchestratorSession;
  }

  /**
   * Spawn a sub-agent session for a specific agent definition.
   * Destroys any existing active agent session first.
   */
  async spawnAgentSession(
    agent: AgentDefinition,
    configOverrides?: Partial<SessionConfig>,
    runtimeContext?: AgentRuntimeContext,
  ): Promise<CopilotSession> {
    // Destroy any existing active agent session
    await this.destroyAgentSession();

    const effectiveModel = agent.model || runtimeContext?.fallbackModel;

    const sessionConfig: SessionConfig = {
      streaming: true,
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: "replace",
        content: agent.prompt,
      },
      ...(effectiveModel ? { model: effectiveModel } : {}),
      ...(agent.mcpServers ? { mcpServers: agent.mcpServers as SessionConfig["mcpServers"] } : {}),
      ...(configOverrides as Partial<SessionConfig>),
    };

    const shouldAttachRunCommandTool =
      runtimeContext?.useCommandTool === true ||
      agent.name === "pw-cli-agent" ||
      agent.name === "api-test-agent";

    if (shouldAttachRunCommandTool) {
      const existingTools = (sessionConfig as any).tools as any[] | undefined;
      sessionConfig.tools = [
        ...(existingTools || []),
        createRunCommandTool({
          defaultCwd: runtimeContext?.workDir,
          env: runtimeContext?.env,
        }),
      ] as any;
    }

    const session = await this.client.createSession(sessionConfig);

    // Subscribe to events and proxy them with agent metadata
    const unsubscribe = session.on((event: SessionEvent) => {
      this.proxyEvent(event, agent.name, agent.displayName, agent.tag);
    });

    this.activeAgent = {
      session,
      agentName: agent.name,
      agentDisplayName: agent.displayName,
      agentTag: agent.tag,
      unsubscribe,
    };

    this.log("debug", `Agent session spawned: ${agent.name} (${session.sessionId})`);
    this.emitJarvisEvent({
      type: "agent:executing",
      agent: agent.name,
      agentDisplayName: agent.displayName,
    } as any);

    return session;
  }

  /**
   * Destroy the active sub-agent session.
   */
  async destroyAgentSession(): Promise<void> {
    if (!this.activeAgent) return;

    const { session, unsubscribe, agentName } = this.activeAgent;
    unsubscribe();

    try {
      await session.disconnect();
    } catch (err) {
      this.log("debug", `Failed to destroy agent session ${agentName}: ${err}`);
    }

    this.activeAgent = null;
    this.log("debug", `Agent session destroyed: ${agentName}`);
  }

  /**
   * Get the currently active agent name.
   */
  getActiveAgentName(): string | null {
    return this.activeAgent?.agentName ?? null;
  }

  /**
   * Get the active agent session.
   */
  getActiveAgentSession(): CopilotSession | null {
    return this.activeAgent?.session ?? null;
  }

  /**
   * Proxy a Copilot SDK event to JarvisEvent, tagging it with agent metadata.
   */
  private proxyEvent(event: SessionEvent, agentName: string, agentDisplayName: string, agentTag?: string): void {
    const jarvisEvent = this.transformEvent(event);
    if (jarvisEvent) {
      // Add agent metadata to the event
      (jarvisEvent as any)._agentName = agentName;
      (jarvisEvent as any)._agentDisplayName = agentDisplayName;
      (jarvisEvent as any)._agentTag = agentTag;
      this.emitJarvisEvent(jarvisEvent);
    }
  }

  /**
   * Transform Copilot SDK events to JarvisEvents.
   */
  private transformEvent(event: SessionEvent): JarvisEvent | null {
    const e = event as any;
    switch (event.type) {
      case "assistant.message_delta":
        return { type: "message_delta", content: e.data.deltaContent || "" };
      case "assistant.message":
        return {
          type: "message_complete",
          content: e.data.content || "",
          id: e.data.id || crypto.randomUUID(),
        };
      case "assistant.reasoning_delta":
        return { type: "reasoning_delta", content: e.data.deltaContent || "" };
      case "assistant.reasoning":
        return { type: "reasoning_complete", content: e.data.content || "" };
      case "tool.execution_start":
        return {
          type: "tool_start",
          toolName: e.data.toolName || "unknown",
          toolCallId: e.data.toolCallId || "",
          args: e.data.arguments,
        };
      case "tool.execution_complete":
        return {
          type: "tool_complete",
          toolCallId: e.data.toolCallId || "",
          result: e.data.result || "",
        };
      case "assistant.usage":
        return {
          type: "usage_update",
          data: {
            model: e.data.model,
            inputTokens: e.data.inputTokens || 0,
            outputTokens: e.data.outputTokens || 0,
            cacheReadTokens: e.data.cacheReadTokens || 0,
            cacheWriteTokens: e.data.cacheWriteTokens || 0,
            cost: e.data.cost,
            duration: e.data.duration,
            quotaSnapshots: e.data.quotaSnapshots,
          },
        };
      case "session.idle":
        return { type: "session_idle" };
      case "session.error":
        return { type: "session_error", error: e.data.message || "Unknown error" };
      default:
        return null;
    }
  }

  /**
   * Emit a JarvisEvent through the unified channel.
   */
  private emitJarvisEvent(event: JarvisEvent): void {
    this.emit("jarvis-event", event);
  }

  /**
   * Cleanup all sessions.
   */
  async destroy(): Promise<void> {
    await this.destroyAgentSession();
    if (this.orchestratorSession) {
      try {
        await this.orchestratorSession.disconnect();
      } catch (err) {
        this.log("debug", `Failed to destroy orchestrator session: ${err}`);
      }
      this.orchestratorSession = null;
    }
  }

  private log(level: "debug" | "info" | "error", message: string): void {
    if (this.verbose) {
      this.emitJarvisEvent({ type: "debug_log", level, message: `[SessionManager] ${message}` });
    }
  }
}
