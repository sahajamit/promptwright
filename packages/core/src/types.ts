import type { CustomProviderConfig } from "./config/types.js";

/**
 * MCP Server configuration for Copilot SDK
 */
export interface MCPServerConfig {
  type?: "local" | "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  tools?: string[];  // ["*"] means all tools
  timeout?: number;
}

/**
 * Configuration options for JarvisClient
 */
export interface JarvisOptions {
  /** Working directory for Copilot operations */
  workDir?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Model to use (omit to use default) */
  model?: string;
  /** System prompt to configure AI behavior */
  systemPrompt?: string;
  /** Agent skill content (additional instructions) */
  agentSkill?: string;
  /** MCP servers to enable for this session */
  mcpServers?: Record<string, MCPServerConfig>;
  /** Copilot session ID to resume existing session */
  copilotSessionId?: string;
  /** Directories to load skills from (passed to Copilot SDK SessionConfig) */
  skillDirectories?: string[];
  /** Path to the Copilot CLI binary (used in packaged Electron mode) */
  cliPath?: string;
  /** Environment variables for the Copilot CLI process (e.g. ELECTRON_RUN_AS_NODE) */
  cliEnv?: Record<string, string | undefined>;

  // --- Agent orchestration options ---

  /** Use orchestrator mode (default: true). When false, use legacy single-session mode. */
  useOrchestrator?: boolean;
  /** Orchestrator model override */
  orchestratorModel?: string;
  /** Direct agent name (bypasses orchestrator routing) */
  directAgent?: string;
  /** Directory for external user agents (e.g. ~/.promptwright/agents/) */
  externalAgentsDir?: string;
  /** Per-agent config overrides */
  agentOverrides?: Record<string, { model?: string; enabled?: boolean }>;
  /** Callback to get MCP server config overrides (for packaged Electron mode) */
  getMCPOverrides?: () => Record<string, any> | undefined;
  /** Callback to get runtime context overrides for sub-agent sessions */
  getAgentRuntimeContext?: (agentName: string) => {
    workDir?: string;
    env?: Record<string, string | undefined>;
    useCommandTool?: boolean;
  } | undefined;
  /** Preferred browser automation mode — passed to orchestrator for agent routing */
  automationMode?: "playwright-mcp" | "playwright-cli";
  /** Reasoning effort level for models that support it (e.g. "low" | "medium" | "high" | "xhigh") */
  reasoningEffort?: string;
  /** Custom provider config for BYOK (Azure, OpenAI-compatible, Anthropic) */
  provider?: CustomProviderConfig;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  isDefault: boolean;
  supportsReasoningEffort?: boolean;
  supportedReasoningEfforts?: string[];
}

/**
 * Message structure for chat history
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status: "pending" | "running" | "completed" | "failed";
}

/**
 * Usage data from assistant.usage events
 */
export interface UsageData {
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost?: number;
  duration?: number;
  quotaSnapshots?: Record<string, {
    isUnlimitedEntitlement: boolean;
    entitlementRequests: number;
    usedRequests: number;
    usageAllowedWithExhaustedQuota: boolean;
    overage: number;
    overageAllowedWithExhaustedQuota: boolean;
    remainingPercentage: number;
    resetDate?: string;
  }>;
}

/**
 * Events emitted by JarvisClient
 */
export type JarvisEvent =
  | { type: "message_delta"; content: string }
  | { type: "message_complete"; content: string; id: string }
  | { type: "tool_start"; toolName: string; toolCallId: string; args?: string }
  | { type: "tool_complete"; toolCallId: string; result: string }
  | { type: "reasoning_delta"; content: string }
  | { type: "reasoning_complete"; content: string }
  | { type: "session_idle" }
  | { type: "session_error"; error: string }
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "debug_log"; level: "debug" | "info" | "error"; message: string }
  | { type: "usage_update"; data: UsageData }
  | { type: "intent_classified"; intent: "web" | "api" }
  // Agent orchestration events
  | { type: "orchestrator:classifying" }
  | { type: "orchestrator:agent_selected"; agent: string; reason: string; model: string }
  | { type: "orchestrator:handoff"; from: string; to: string }
  | { type: "agent:executing"; agent: string; agentDisplayName: string }
  | { type: "agent:complete"; agent: string; result: any };

/**
 * Event handler function type
 */
export type JarvisEventHandler = (event: JarvisEvent) => void;

/**
 * Session state
 */
export type SessionState = "disconnected" | "connecting" | "connected" | "error";
