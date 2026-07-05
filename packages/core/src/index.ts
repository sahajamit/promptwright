// Main exports
export { JarvisClient } from "./client.js";

// Type exports
export type {
  JarvisEvent,
  JarvisEventHandler, JarvisOptions, Message, ModelInfo, SessionState, ToolCall
} from "./types.js";

// Configuration exports
export {
  APP_NAME,
  DEFAULT_CONFIG, getConfig, getConfigPath, initConfig, loadConfig, resetConfig, saveConfig,
  resolveProviderConfig, toSDKProviderConfig,
} from "./config/index.js";
export type {
  AgentConfigOverride,
  AgentsConfig,
  BrowserConfig,
  CustomProviderConfig,
  JarvisConfig,
  OrchestratorConfig,
  PersonaModelConfig,
  PersonasConfig,
  SDKProviderConfig,
  SkillsConfig,
} from "./config/index.js";

// Agent system exports
export { AgentRegistry } from "./agents/registry.js";
export { AgentSessionManager } from "./agents/session-manager.js";
export { OrchestratorAgent } from "./agents/orchestrator.js";
export type { OrchestratorOptions } from "./agents/orchestrator.js";
export { parseAgentFile, parseAgentContent } from "./agents/parser.js";
export type { AgentDefinition, AgentMetadata } from "./agents/types.js";
export { toAgentMetadata } from "./agents/types.js";
export { createRouteToAgentTool } from "./agents/tools/route-to-agent.js";
export { createListAgentsTool } from "./agents/tools/list-agents.js";

// Skill system exports
export { SkillManager } from "./skills/manager.js";
export { parseSkillFile } from "./skills/parser.js";
export type { SkillDefinition, SkillMetadata } from "./skills/types.js";
export { toSkillMetadata } from "./skills/types.js";

// Persona system exports (legacy, kept for backward compatibility)
export { PersonaManager } from "./personas/manager.js";
export type {
  MCPServerConfig, Persona, PersonaManagerEvent,
  PersonaManagerEventHandler
} from "./personas/types.js";

// Persona implementations (legacy)
export { MANUAL_TEST_EXECUTION_PERSONA, buildCLISystemPrompt, getPlaywrightMCPConfig } from "./personas/manual-test-execution/index.js";
export { RECORD_AND_REPEAT_PERSONA, buildCLISystemPromptForObserver } from "./personas/record-and-repeat/index.js";
export { API_TEST_EXECUTION_SYSTEM_PROMPT, API_TEST_EXECUTION_SKILL_PATH } from "./personas/api-test-execution/index.js";

// MCP manager exports
export { PlaywrightMCPManager } from "./mcp/playwright-manager.js";
export type {
  PlaywrightMCPEvent, PlaywrightMCPStatus
} from "./mcp/playwright-manager.js";

// MCP configuration exports
export {
  configurePlaywrightMCP, getMCPConfig, isPlaywrightMCPConfigured
} from "./mcp/copilot-config.js";

// Playwright CLI skill manager exports
export {
  ensurePlaywrightCLICommandInWorkDir,
  fetchCDPWebSocketUrl,
  getGlobalSkillsDir,
  getPlaywrightCLIEnvVars,
  installPlaywrightCLISkill,
  isPlaywrightCLISkillInstalled,
  killPlaywrightCLIDaemons,
  resolvePlaywrightCLIEntry,
  writePlaywrightCLIConfig
} from "./mcp/playwright-cli-manager.js";

// CDP exports
export { ChromeLauncher, getChromeLauncher } from "./cdp/chrome-launcher.js";
export { CDPClient } from "./cdp/client.js";
export { ScreencastRecorder } from "./cdp/screencast-recorder.js";
export type {
  ScreencastRecorderOptions,
  ScreencastRecorderState
} from "./cdp/screencast-recorder.js";
export type {
  CDPClientEvent, CDPClientState, CDPConnectionOptions, CDPTarget
} from "./cdp/types.js";

// Recording exports
export { AIEnhancer, createAIEnhancer } from "./recording/ai-enhancer.js";
export { RecordingManager } from "./recording/manager.js";
export {
  DETAILED_MODE_CONFIG,
  RECORDING_MODES, STANDARD_MODE_CONFIG, getAvailableModes,
  getDefaultMode,
  getModeConfig,
  getModeInfo
} from "./recording/mode-config.js";
export { Recorder } from "./recording/recorder.js";
export {
  ReplayExecutor,
  createPlaywrightStepExecutor
} from "./recording/replay-executor.js";
export type {
  ReplayEvent, ReplayOptions, StepContext, StepExecutor
} from "./recording/replay-executor.js";
export { RecordingTempStorage } from "./recording/temp-storage.js";
export type {
  ElementTarget, GherkinResult,
  LocatorSet, RecordedAction,
  RecordedSession, RecordingEvent, RecordingMode,
  RecordingModeConfig,
  RecordingModeInfo, RecordingState,
  RecordingStatus
} from "./recording/types.js";

// Gherkin exports
export { GherkinGenerator, createGherkinGenerator } from "./gherkin/generator.js";
export { GherkinParser, expandScenarioOutline, parseGherkin } from "./gherkin/parser.js";
export type {
  FeatureExecutionResult, GherkinExamples, GherkinFeature, GherkinParseResult, GherkinScenario,
  GherkinStep, ScenarioExecutionResult, StepExecutionResult
} from "./gherkin/types.js";
