/**
 * Promptwright Configuration Module
 *
 * Handles loading and saving configuration from YAML files.
 * Supports both development (project root) and production (userData) paths.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { parse, stringify } from "yaml";
import { DEFAULT_CONFIG, type JarvisConfig } from "./types.js";

// Cached configuration
let cachedConfig: JarvisConfig | null = null;

// App identifier for userData path (no spaces for cross-platform compatibility)
export const APP_NAME = "Promptwright";

/**
 * Get the default config file path in userData directory.
 * This is determined by the caller (Electron main process knows the userData path).
 */
export function getConfigPath(userDataPath: string): string {
    return path.join(userDataPath, "config.yaml");
}

/**
 * Find config file, checking multiple locations.
 * Priority: working directory > userData > default
 *
 * @param userDataPath - The Electron userData path (optional, for production)
 * @param workDir - Working directory to check (optional, for development)
 */
function findConfigPath(userDataPath?: string, workDir?: string): string | null {
    // 1. Check working directory (development override)
    if (workDir) {
        const workDirConfig = path.join(workDir, "promptwright.config.yaml");
        if (existsSync(workDirConfig)) {
            return workDirConfig;
        }
    }

    // 2. Check current working directory
    const cwdConfig = path.join(process.cwd(), "promptwright.config.yaml");
    if (existsSync(cwdConfig)) {
        return cwdConfig;
    }

    // 3. Check userData directory
    if (userDataPath) {
        const userConfig = getConfigPath(userDataPath);
        if (existsSync(userConfig)) {
            return userConfig;
        }
    }

    return null;
}

/**
 * Auto-migrate legacy personas config to agents config.
 * Maps old persona IDs to new agent names.
 */
function migratePersonasToAgents(config: Partial<JarvisConfig>): Partial<JarvisConfig> {
    if (!config.personas || config.agents) return config;

    const personaToAgent: Record<string, string> = {
        "manual-test-execution": "pw-mcp-agent",
        "record-and-repeat": "workflow-observer",
    };

    const agents: Record<string, { model?: string }> = {};
    for (const [personaId, personaConfig] of Object.entries(config.personas)) {
        const agentName = personaToAgent[personaId];
        if (agentName && personaConfig?.model) {
            agents[agentName] = { model: personaConfig.model };
        }
    }

    if (Object.keys(agents).length > 0) {
        config.agents = agents;
    }

    return config;
}

/**
 * Deep merge two config objects, with source overriding target
 */
function mergeConfig(target: JarvisConfig, source: Partial<JarvisConfig>): JarvisConfig {
    // Auto-migrate legacy persona config
    source = migratePersonasToAgents(source);

    const result = { ...target };

    if (source.browser) {
        result.browser = {
            ...target.browser,
            ...source.browser,
        };
    }

    if (source.personas) {
        result.personas = {
            ...target.personas,
        };
        if (source.personas["manual-test-execution"]) {
            result.personas["manual-test-execution"] = {
                ...target.personas?.["manual-test-execution"],
                ...source.personas["manual-test-execution"],
            };
        }
        if (source.personas["record-and-repeat"]) {
            result.personas["record-and-repeat"] = {
                ...target.personas?.["record-and-repeat"],
                ...source.personas["record-and-repeat"],
            };
        }
    }

    // Handle lastUsedPersona (legacy)
    if (source.lastUsedPersona !== undefined) {
        result.lastUsedPersona = source.lastUsedPersona;
    }

    // Handle copilotCliPath
    if (source.copilotCliPath !== undefined) {
        result.copilotCliPath = source.copilotCliPath;
    }

    // Handle orchestrator config
    if (source.orchestrator) {
        result.orchestrator = {
            ...target.orchestrator,
            ...source.orchestrator,
        };
    }

    // Handle agents config
    if (source.agents) {
        result.agents = {
            ...target.agents,
        };
        for (const [name, override] of Object.entries(source.agents)) {
            result.agents[name] = {
                ...target.agents?.[name],
                ...override,
            };
        }
    }

    // Handle skills config
    if (source.skills) {
        result.skills = {
            ...target.skills,
            ...source.skills,
        };
    }

    // Handle provider config (BYOK)
    if (source.provider !== undefined) {
        result.provider = source.provider ?? undefined;
    }

    return result;
}


/**
 * Load configuration from file.
 * Falls back to defaults if no config file exists.
 *
 * @param userDataPath - The Electron userData path (optional)
 * @param workDir - Working directory to check first (optional)
 * @param forceReload - Force reload from disk, ignoring cache
 */
export function loadConfig(
    userDataPath?: string,
    workDir?: string,
    forceReload = false
): JarvisConfig {
    // Return cached config if available and not forcing reload
    if (cachedConfig && !forceReload) {
        return cachedConfig;
    }

    // Find config file
    const configPath = findConfigPath(userDataPath, workDir);

    if (configPath) {
        try {
            const content = readFileSync(configPath, "utf-8");
            const parsed = parse(content) as Partial<JarvisConfig>;

            // Merge with defaults to ensure all fields exist
            cachedConfig = mergeConfig(DEFAULT_CONFIG, parsed);
            return cachedConfig;
        } catch (error) {
            console.error(`[Config] Failed to parse config at ${configPath}:`, error);
            // Fall through to defaults
        }
    }

    // Use defaults
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
}

/**
 * Get the current cached configuration.
 * If not loaded yet, loads with defaults.
 */
export function getConfig(): JarvisConfig {
    if (!cachedConfig) {
        return loadConfig();
    }
    return cachedConfig;
}

/**
 * Save configuration to the userData directory.
 *
 * @param config - Partial config to merge and save
 * @param userDataPath - The Electron userData path
 */
export function saveConfig(
    config: Partial<JarvisConfig>,
    userDataPath: string
): void {
    // Ensure userData directory exists
    if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true });
    }

    // Merge with current config
    const currentConfig = getConfig();
    const newConfig = mergeConfig(currentConfig, config);

    // Write to file
    const configPath = getConfigPath(userDataPath);
    const content = stringify(newConfig, { indent: 2 });

    // Add header comment
    const header = `# Promptwright Configuration
# This file controls runtime settings for the application
# Edit this file or use the app settings to customize behavior

`;

    writeFileSync(configPath, header + content, "utf-8");

    // Update cache
    cachedConfig = newConfig;
}

/**
 * Reset configuration to defaults.
 * Clears the cache but does not delete the config file.
 */
export function resetConfig(): void {
    cachedConfig = null;
}

/**
 * Initialize config (for use in Electron main process).
 * Loads config and ensures userData directory exists.
 *
 * @param userDataPath - The Electron userData path
 * @param workDir - Optional working directory for dev override
 */
export function initConfig(userDataPath: string, workDir?: string): JarvisConfig {
    // Ensure userData directory exists
    if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true });
    }

    return loadConfig(userDataPath, workDir, true);
}

// Re-export types
export { DEFAULT_CONFIG } from "./types.js";
export type {
    AgentConfigOverride,
    AgentsConfig,
    BrowserConfig,
    CustomProviderConfig,
    JarvisConfig,
    OrchestratorConfig,
    PersonaModelConfig,
    PersonasConfig,
    SkillsConfig,
} from "./types.js";

// Re-export provider helpers
export { resolveProviderConfig, toSDKProviderConfig } from "./provider.js";
export type { SDKProviderConfig } from "./provider.js";
