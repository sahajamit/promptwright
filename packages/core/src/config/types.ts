/**
 * Promptwright Configuration Types
 */

/**
 * Browser configuration options
 */
export interface BrowserConfig {
    /**
     * Whether to run browser in headless mode.
     * - true: headless mode (no visible browser window, faster)
     * - false: headed mode (visible browser window for debugging/watching)
     * @default true
     */
    headless: boolean;
    /**
     * Browser automation backend.
     * - 'playwright-mcp': Rich tool integration via MCP protocol (default)
     * - 'playwright-cli': Token-efficient CLI commands via bash
     * @default 'playwright-mcp'
     */
    automationMode?: 'playwright-mcp' | 'playwright-cli';
}

/**
 * Model configuration for a persona
 */
export interface PersonaModelConfig {
    /**
     * Model ID to use for this persona (e.g., "claude-sonnet-4-5-20250514")
     * Leave undefined to use Copilot's default model
     */
    model?: string;
}

/**
 * Personas configuration (legacy, auto-migrated to agents)
 */
export interface PersonasConfig {
    /** Model settings for Manual Test Execution persona */
    "manual-test-execution"?: PersonaModelConfig;
    /** Model settings for Workflow Observer persona */
    "record-and-repeat"?: PersonaModelConfig;
}

/**
 * Per-agent configuration overrides
 */
export interface AgentConfigOverride {
    /** Model ID to use for this agent */
    model?: string;
    /** Whether this agent is enabled */
    enabled?: boolean;
}

/**
 * Agents configuration
 */
export interface AgentsConfig {
    [agentName: string]: AgentConfigOverride;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
    /** Model for the orchestrator agent */
    model?: string;
    /** Reasoning effort level for models that support it (e.g. "low" | "medium" | "high" | "xhigh") */
    reasoningEffort?: string;
    /** Whether to auto-route requests (default: true) */
    autoRoute?: boolean;
}

/**
 * Skills configuration
 */
export interface SkillsConfig {
    /** Additional directories to load skills from */
    directories?: string[];
}

/** Custom model provider configuration (BYOK) */
export interface CustomProviderConfig {
    /** Provider type. Defaults to "openai" for generic OpenAI-compatible APIs. */
    type: "azure" | "openai" | "anthropic";
    /** API endpoint URL (e.g. https://my-resource.openai.azure.com, http://localhost:11434/v1 for Ollama) */
    baseUrl: string;
    /** API key (leave empty if using env var PROMPTWRIGHT_PROVIDER_API_KEY; optional for local providers like Ollama) */
    apiKey?: string;
    /**
     * Bearer token for auth. Sets the Authorization header directly and takes
     * precedence over apiKey. Use for services requiring bearer-token auth.
     */
    bearerToken?: string;
    /** API wire format (openai/azure only). Defaults to "completions". */
    wireApi?: "completions" | "responses";
    /** Azure-specific: API version (default: "2024-10-21") */
    azureApiVersion?: string;
    /** Custom HTTP headers to include in outbound provider requests. */
    headers?: Record<string, string>;
    /** Model ID to use with this provider (e.g. "gpt-4o") */
    model: string;
    /**
     * Wire model name sent to the provider API when it differs from `model`
     * (e.g. an Azure deployment name or a custom fine-tune name).
     */
    wireModel?: string;
    /** Override the model's default max prompt tokens (triggers compaction). */
    maxPromptTokens?: number;
    /** Override the model's default max output tokens. */
    maxOutputTokens?: number;
    /** Display name for the UI */
    displayName?: string;
}

/**
 * Root configuration schema
 */
export interface JarvisConfig {
    browser: BrowserConfig;
    /** Per-persona settings (legacy, auto-migrated to agents) */
    personas?: PersonasConfig;
    /** Last used persona ID for auto-selection on app launch (legacy) */
    lastUsedPersona?: string;
    /** Orchestrator configuration */
    orchestrator?: OrchestratorConfig;
    /** Per-agent configuration overrides */
    agents?: AgentsConfig;
    /** Skills configuration */
    skills?: SkillsConfig;
    /**
     * Optional override path to Copilot CLI executable.
     */
    copilotCliPath?: string;
    /** Custom model provider (BYOK - Azure, OpenAI-compatible, Anthropic) */
    provider?: CustomProviderConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: JarvisConfig = {
    browser: {
        headless: true,
        automationMode: 'playwright-cli',
    },
    personas: {
        "manual-test-execution": {
            model: undefined, // Use Copilot default
        },
        "record-and-repeat": {
            model: undefined, // Use Copilot default
        },
    },
};
