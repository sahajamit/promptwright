import {
  CopilotClient,
  RuntimeConnection,
  type CopilotSession,
  type ModelInfo as SDKModelInfo,
} from "@github/copilot-sdk";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { AgentRegistry } from "./agents/registry.js";
import { OrchestratorAgent } from "./agents/orchestrator.js";
import { AgentSessionManager } from "./agents/session-manager.js";
import { SkillManager } from "./skills/manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { toSDKProviderConfig } from "./config/provider.js";
import type { CustomProviderConfig } from "./config/types.js";
import type {
    JarvisEvent,
    JarvisEventHandler,
    JarvisOptions,
    ModelInfo,
    SessionState,
} from "./types.js";

/**
 * Build a minimal SDK ModelInfo for the user's BYOK model so that
 * `client.listModels()` returns it without contacting the Copilot catalog
 * (which requires a logged-in Copilot account).
 */
function buildByokModelInfo(provider: CustomProviderConfig): SDKModelInfo {
  return {
    id: provider.model,
    name: provider.displayName || provider.model,
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 0 },
    },
  };
}

/**
 * JarvisClient - Wrapper around GitHub Copilot SDK
 *
 * Supports two modes:
 * 1. **Orchestrator mode** (default): Creates an OrchestratorAgent that
 *    classifies intent and routes to specialized sub-agents.
 * 2. **Legacy mode**: Single Copilot session with direct system prompt
 *    (backward compatible with persona-based usage).
 */
export class JarvisClient extends EventEmitter {
  private client: CopilotClient;
  private session: CopilotSession | null = null;
  private options: JarvisOptions;
  private state: SessionState = "disconnected";
  private activeModel: string | null = null;
  private copilotSessionId: string | null = null;

  // Agent orchestration
  private orchestrator: OrchestratorAgent | null = null;
  private agentRegistry: AgentRegistry | null = null;
  private sessionManager: AgentSessionManager | null = null;
  private skillManager: SkillManager | null = null;

  constructor(options: JarvisOptions = {}) {
    super();
    this.options = options;

    // BYOK is login-less: when the user supplies their own provider, we do NOT
    // need a GitHub Copilot license or `copilot auth login`. Copilot is just the
    // harness; the model comes from the user's own cloud key. Fall back to the
    // logged-in Copilot user only when no BYOK provider is configured.
    const byok = options.provider;

    this.client = new CopilotClient({
      workingDirectory: options.workDir,
      logLevel: options.verbose ? "debug" : "none",
      // SDK 1.0 bundles the Copilot runtime and spawns it over stdio by default,
      // so no global `copilot` install is required. Only build an explicit
      // connection when the caller overrides the runtime executable path.
      ...(options.cliPath
        ? { connection: RuntimeConnection.forStdio({ path: options.cliPath }) }
        : {}),
      ...(options.cliEnv ? { env: options.cliEnv } : {}),
      // Pure BYOK: skip GitHub OAuth / gh-CLI auth entirely.
      ...(byok ? { useLoggedInUser: false } : {}),
      // In BYOK mode, list the user's configured model instead of querying the
      // Copilot model catalog (which would require a logged-in Copilot account).
      ...(byok ? { onListModels: () => [buildByokModelInfo(byok)] } : {}),
    });
  }

  /**
   * Get current session state
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get the active model name
   */
  getActiveModel(): string | null {
    return this.activeModel;
  }

  /**
   * List available models
   */
  async listModels(): Promise<ModelInfo[]> {
    // BYOK mode: return only the user's configured model. The Copilot-only
    // default (claude-sonnet-4.6) does not apply when the user brings their own
    // provider, and the catalog RPC would require a logged-in Copilot account.
    if (this.options.provider) {
      const p = this.options.provider;
      return [
        {
          id: p.model,
          name: p.displayName || p.model,
          isDefault: true,
          supportsReasoningEffort: false,
          supportedReasoningEfforts: [],
        },
      ];
    }

    // Models known to exist in Copilot but not returned by the models.list RPC.
    // claude-sonnet-4.6 is Copilot's current default model and supports reasoning effort,
    // but is absent from the SDK's models.list API response.
    const KNOWN_MISSING_MODELS: ModelInfo[] = [
      {
        id: "claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        isDefault: true,
        supportsReasoningEffort: true,
        supportedReasoningEfforts: ["low", "medium", "high"],
      },
    ];

    try {
      const models = await this.client.listModels();
      if (this.options.verbose && models.length > 0) {
        this.log("debug", `Raw model data sample: ${JSON.stringify(models[0])}`);
      }
      const mapped: ModelInfo[] = models.map((m: any) => ({
        id: m.id || m.name || m.modelId,
        name: m.name || m.displayName || m.id,
        isDefault: m.isDefault || m.default || false,
        supportsReasoningEffort: m.capabilities?.supports?.reasoningEffort || false,
        supportedReasoningEfforts: m.supportedReasoningEfforts || [],
      }));

      // Inject known missing models at the top if not already returned by the API
      const ids = new Set(mapped.map(m => m.id));
      const injected = KNOWN_MISSING_MODELS.filter(m => !ids.has(m.id));
      return [...injected, ...mapped];
    } catch (error) {
      this.log("debug", `Failed to list models: ${error}`);
      return KNOWN_MISSING_MODELS;
    }
  }

  /**
   * Get the status/info from Copilot CLI
   */
  async getStatus(): Promise<any> {
    try {
      return await this.client.getStatus();
    } catch (error) {
      this.log("debug", `Failed to get status: ${error}`);
      return null;
    }
  }

  /**
   * Start the Copilot client and create session(s).
   * Uses orchestrator mode if useOrchestrator is true (default).
   */
  async start(): Promise<void> {
    this.setState("connecting");
    this.emitEvent({ type: "connecting" });

    try {
      this.log("debug", "Starting Copilot client...");
      await this.client.start();
      this.log("debug", "Copilot client started");

      const status = await this.getStatus();
      if (status) {
        const statusKeys = Object.keys(status as Record<string, unknown>);
        this.log("debug", `Copilot status received (keys: ${statusKeys.join(", ")})`);
      }

      const models = await this.listModels();
      let defaultModelName: string | null = null;
      if (models.length > 0) {
        console.log(`[JARVIS SDK] Available models (${models.length}):`, JSON.stringify(models, null, 2));
        this.log("debug", `Available models: ${models.map(m => m.id).join(", ")}`);
        const defaultModel = models.find(m => m.isDefault);
        if (defaultModel) {
          defaultModelName = defaultModel.id;
          this.log("debug", `Default model (from isDefault): ${defaultModelName}`);
        }
      } else {
        console.log("[JARVIS SDK] No models available from listModels()");
      }

      // Always load agent registry and skill manager for UI listing,
      // regardless of whether we use orchestrator or legacy mode.
      await this.loadRegistryAndSkills();

      const useOrchestrator = this.options.useOrchestrator !== false;

      if (useOrchestrator) {
        await this.startOrchestratorMode(defaultModelName);
      } else {
        await this.startLegacyMode(defaultModelName);
      }

      this.setState("connected");
      this.emitEvent({ type: "connected" });
    } catch (error) {
      this.setState("error");
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("[JARVIS SDK] Failed to start:", errorMsg);
      if (errorStack) console.error("[JARVIS SDK] Stack:", errorStack);

      this.log("debug", `Connection failed: ${errorMsg}`);
      this.emitEvent({ type: "session_error", error: errorMsg });
      throw error;
    }
  }

  /**
   * Start in orchestrator mode: session manager + orchestrator agent.
   * Uses the already-loaded agent registry from loadRegistryAndSkills().
   */
  private async startOrchestratorMode(defaultModelName: string | null): Promise<void> {
    this.log("debug", "Starting in orchestrator mode");

    // Create session manager
    this.sessionManager = new AgentSessionManager(this.client, this.options.verbose);

    // Create orchestrator (registry is guaranteed loaded by loadRegistryAndSkills)
    this.orchestrator = new OrchestratorAgent(
      this.agentRegistry!,
      this.sessionManager,
      {
        model: this.options.provider?.model || this.options.orchestratorModel || this.options.model,
        reasoningEffort: this.options.reasoningEffort,
        autoRoute: true,
        getMCPOverrides: this.options.getMCPOverrides,
        getAgentRuntimeContext: this.options.getAgentRuntimeContext,
        automationMode: this.options.automationMode,
        verbose: this.options.verbose,
        provider: this.options.provider,
      },
    );

    // Forward orchestrator events to this client
    this.orchestrator.onEvent((event) => {
      this.emitEvent(event);
    });

    // Initialize orchestrator session
    await this.orchestrator.initialize();

    this.activeModel = this.options.orchestratorModel || this.options.model || defaultModelName || "default";
    console.log(`[JARVIS SDK] Orchestrator initialized with model: ${this.activeModel}`);
  }

  /**
   * Start in legacy mode: single Copilot session (backward compatible).
   */
  private async startLegacyMode(defaultModelName: string | null): Promise<void> {
    this.log("debug", "Starting in legacy (single-session) mode");

    const sessionConfig: any = { streaming: true };

    if (this.options.model) {
      sessionConfig.model = this.options.model;
      this.activeModel = this.options.model;
    } else {
      this.activeModel = defaultModelName || "default";
    }

    if (this.options.systemPrompt) {
      sessionConfig.systemMessage = { type: "replace", content: this.options.systemPrompt };
    }

    if (this.options.agentSkill) {
      const combinedPrompt = this.options.systemPrompt
        ? `${this.options.systemPrompt}\n\n## Agent Skill\n${this.options.agentSkill}`
        : `## Agent Skill\n${this.options.agentSkill}`;
      sessionConfig.systemMessage = { type: "replace", content: combinedPrompt };
    }

    if (this.options.skillDirectories?.length) {
      sessionConfig.skillDirectories = this.options.skillDirectories;
    }

    if (this.options.mcpServers) {
      sessionConfig.mcpServers = this.options.mcpServers;
      const serverNames = Object.keys(this.options.mcpServers);
      this.log("debug", `Configuring ${serverNames.length} MCP server(s): ${serverNames.join(", ")}`);
    }

    // BYOK provider
    if (this.options.provider) {
      sessionConfig.provider = toSDKProviderConfig(this.options.provider);
      sessionConfig.model = this.options.provider.model;
      this.activeModel = this.options.provider.model;
      this.log("debug", `Using custom provider: ${this.options.provider.type} @ ${this.options.provider.baseUrl}`);
    }

    console.log("[JARVIS SDK] Creating session with config:");
    console.log(JSON.stringify({
      streaming: sessionConfig.streaming,
      model: sessionConfig.model ?? "default",
      hasSystemMessage: Boolean(sessionConfig.systemMessage),
      mcpServers: sessionConfig.mcpServers ? Object.keys(sessionConfig.mcpServers) : [],
    }, null, 2));

    if (this.options.copilotSessionId) {
      this.log("debug", `Resuming Copilot session: ${this.options.copilotSessionId}`);
      try {
        this.session = await this.client.resumeSession(this.options.copilotSessionId, sessionConfig);
        this.copilotSessionId = this.options.copilotSessionId;
      } catch (resumeError) {
        console.warn(`[JARVIS SDK] Failed to resume session, creating new one`);
        this.session = await this.client.createSession(sessionConfig);
        this.copilotSessionId = this.session.sessionId;
      }
    } else {
      this.session = await this.client.createSession(sessionConfig);
      this.copilotSessionId = this.session.sessionId;
    }

    console.log(`[JARVIS SDK] Session created: ${this.copilotSessionId}`);
    this.setupLegacyEventHandlers();
  }

  /**
   * Load agent registry and skill manager (for UI listing).
   * Called once during start(), before branching into orchestrator or legacy mode.
   */
  private async loadRegistryAndSkills(): Promise<void> {
    // Agent registry
    this.agentRegistry = new AgentRegistry();
    await this.agentRegistry.loadBuiltInAgents();

    if (this.options.externalAgentsDir) {
      await this.agentRegistry.loadExternalAgents(this.options.externalAgentsDir);
    }

    if (this.options.agentOverrides) {
      this.agentRegistry.applyConfigOverrides(this.options.agentOverrides);
    }

    const enabledAgents = this.agentRegistry.getEnabled();
    console.log(`[JARVIS SDK] Loaded ${enabledAgents.length} agents: ${enabledAgents.map(a => a.name).join(", ")}`);

    // Skill manager — load skills from built-in persona directories
    this.skillManager = new SkillManager();
    const personasDir = path.join(__dirname, "personas");
    await this.skillManager.loadSkills([personasDir]);

    const skills = this.skillManager.getMetadata();
    if (skills.length > 0) {
      console.log(`[JARVIS SDK] Loaded ${skills.length} skills: ${skills.map(s => s.name).join(", ")}`);
    }

    // Also load from user-configured skill directories
    if (this.options.skillDirectories?.length) {
      await this.skillManager.loadSkills(this.options.skillDirectories);
    }
  }

  /**
   * Log a debug message (emits as event if verbose)
   */
  private log(level: "debug" | "info" | "error", message: string): void {
    if (this.options.verbose) {
      this.emitEvent({ type: "debug_log", level, message });
    }
  }

  /**
   * Set up event handlers for legacy single-session mode.
   */
  private setupLegacyEventHandlers(): void {
    if (!this.session) return;

    this.session.on((event) => {
      if (event.type === 'assistant.usage') {
        this.emitEvent({
          type: 'usage_update',
          data: {
            model: (event as any).data.model,
            inputTokens: (event as any).data.inputTokens || 0,
            outputTokens: (event as any).data.outputTokens || 0,
            cacheReadTokens: (event as any).data.cacheReadTokens || 0,
            cacheWriteTokens: (event as any).data.cacheWriteTokens || 0,
            cost: (event as any).data.cost,
            duration: (event as any).data.duration,
            quotaSnapshots: (event as any).data.quotaSnapshots,
          },
        });
      }

      const jarvisEvent = this.transformEvent(event);
      if (jarvisEvent) {
        this.emitEvent(jarvisEvent);
      }
    });
  }

  /**
   * Transform Copilot SDK events to JarvisEvents (legacy mode)
   */
  private transformEvent(event: any): JarvisEvent | null {
    switch (event.type) {
      case "assistant.message_delta":
        return { type: "message_delta", content: event.data.deltaContent || "" };
      case "assistant.message":
        return {
          type: "message_complete",
          content: event.data.content || "",
          id: event.data.id || crypto.randomUUID(),
        };
      case "assistant.reasoning_delta":
        return { type: "reasoning_delta", content: event.data.deltaContent || "" };
      case "assistant.reasoning":
        return { type: "reasoning_complete", content: event.data.content || "" };
      case "tool.execution_start":
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
      case "session.idle":
        return { type: "session_idle" };
      case "session.error":
        return { type: "session_error", error: event.data.message || "Unknown error" };
      default:
        return null;
    }
  }

  /**
   * Update the working directory
   */
  setWorkDir(workDir: string): void {
    this.options.workDir = workDir;
  }

  /**
   * Update the system prompt (requires session restart)
   */
  setSystemPrompt(systemPrompt: string): void {
    this.options.systemPrompt = systemPrompt;
  }

  /**
   * Update the agent skill (requires session restart)
   */
  setAgentSkill(agentSkill: string): void {
    this.options.agentSkill = agentSkill;
  }

  /**
   * Send a message. Routes through orchestrator or direct session.
   */
  async sendMessage(prompt: string): Promise<string> {
    // Orchestrator mode
    if (this.orchestrator) {
      if (this.options.directAgent) {
        return this.orchestrator.processDirectAgentQuery(this.options.directAgent, prompt);
      }
      return this.orchestrator.processQuery(prompt);
    }

    // Legacy mode
    if (!this.session) {
      throw new Error("Session not started. Call start() first.");
    }

    try {
      return await this.session.send({ prompt });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitEvent({ type: "session_error", error: errorMsg });
      throw error;
    }
  }

  /**
   * Send a message and wait for completion
   */
  async sendAndWait(prompt: string, timeout?: number): Promise<string | null> {
    // Orchestrator mode
    if (this.orchestrator) {
      if (this.options.directAgent) {
        return this.orchestrator.processDirectAgentQuery(this.options.directAgent, prompt);
      }
      return this.orchestrator.processQuery(prompt);
    }

    // Legacy mode
    if (!this.session) {
      throw new Error("Session not started. Call start() first.");
    }

    const response = await this.session.sendAndWait({ prompt }, timeout);
    return response?.data.content || null;
  }

  /**
   * Abort the current message processing
   */
  async abort(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.abort();
      return;
    }
    if (this.session) {
      await this.session.abort();
    }
  }

  /**
   * Get the current Copilot session ID
   */
  getCopilotSessionId(): string | null {
    return this.copilotSessionId;
  }

  /**
   * Delete a Copilot session from the CLI
   */
  async deleteCopilotSession(sessionId: string): Promise<void> {
    try {
      await this.client.deleteSession(sessionId);
      this.log("debug", `Deleted Copilot session: ${sessionId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log("error", `Failed to delete Copilot session ${sessionId}: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Stop the client and cleanup
   */
  async stop(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.destroy();
      this.orchestrator = null;
      this.sessionManager = null;
      this.agentRegistry = null;
    }

    if (this.session) {
      await this.session.disconnect();
      this.session = null;
    }

    this.copilotSessionId = null;
    // SDK 1.0: stop() resolves with any cleanup errors instead of throwing.
    const stopErrors = await this.client.stop();
    if (stopErrors.length > 0) {
      this.log("debug", `Copilot client stop reported ${stopErrors.length} error(s): ${stopErrors.map(e => e.message).join("; ")}`);
    }
    this.setState("disconnected");
    this.emitEvent({ type: "disconnected" });
  }

  /**
   * Subscribe to events with typed handler
   */
  onEvent(handler: JarvisEventHandler): () => void {
    this.on("jarvis-event", handler);
    return () => this.off("jarvis-event", handler);
  }

  // --- Agent orchestration accessors ---

  /**
   * Get the agent registry (only in orchestrator mode).
   */
  getRegistry(): AgentRegistry | null {
    return this.agentRegistry;
  }

  /**
   * Get the skill manager (if loaded).
   */
  getSkillManager(): SkillManager | null {
    return this.skillManager ?? null;
  }

  /**
   * Get the currently active sub-agent name.
   */
  getActiveAgent(): string | null {
    return this.orchestrator?.getActiveAgentName() ?? null;
  }

  /**
   * Check if running in orchestrator mode.
   */
  isOrchestratorMode(): boolean {
    return this.orchestrator !== null;
  }

  /**
   * Internal: emit a JarvisEvent
   */
  private emitEvent(event: JarvisEvent): void {
    this.emit("jarvis-event", event);
  }

  /**
   * Internal: update state
   */
  private setState(state: SessionState): void {
    this.state = state;
  }
}
