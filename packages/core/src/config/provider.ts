/**
 * Provider config mapping helpers.
 *
 * Maps JARVIS CustomProviderConfig to the Copilot SDK ProviderConfig shape.
 */

import type { CustomProviderConfig } from "./types.js";

/**
 * Resolve the effective BYOK provider config by layering environment variables
 * over the config-file provider block. This enables a **pure env-var launch**
 * (no YAML required) — ideal for zero-cost local models like Ollama:
 *
 *   export PROMPTWRIGHT_PROVIDER_TYPE=openai
 *   export PROMPTWRIGHT_PROVIDER_BASE_URL=http://localhost:11434/v1
 *   export PROMPTWRIGHT_PROVIDER_MODEL=gemma4:12b
 *   # no API key needed for local Ollama
 *
 * Config-file values take precedence; env vars fill any gaps. Returns undefined
 * when neither source supplies the minimum (baseUrl + model). The API key is
 * intentionally optional so local providers work key-less.
 *
 * @param configProvider - The provider block from the loaded config (optional)
 * @param env - Environment source (defaults to process.env; injectable for tests)
 */
export function resolveProviderConfig(
  configProvider?: Partial<CustomProviderConfig>,
  env: NodeJS.ProcessEnv = process.env
): CustomProviderConfig | undefined {
  const baseUrl = configProvider?.baseUrl ?? env.PROMPTWRIGHT_PROVIDER_BASE_URL;
  const model = configProvider?.model ?? env.PROMPTWRIGHT_PROVIDER_MODEL;

  // BYOK needs at least an endpoint and a model. Key is optional (local/Ollama).
  if (!baseUrl || !model) {
    return undefined;
  }

  const envType = env.PROMPTWRIGHT_PROVIDER_TYPE as
    | CustomProviderConfig["type"]
    | undefined;

  return {
    ...configProvider,
    // Default to "openai" — the generic OpenAI-compatible type that covers
    // OpenAI, gateways, and local Ollama.
    type: configProvider?.type ?? envType ?? "openai",
    baseUrl,
    model,
    apiKey: configProvider?.apiKey ?? env.PROMPTWRIGHT_PROVIDER_API_KEY,
    bearerToken:
      configProvider?.bearerToken ?? env.PROMPTWRIGHT_PROVIDER_BEARER_TOKEN,
  };
}

/**
 * SDK ProviderConfig shape (from @github/copilot-sdk SessionConfig.provider).
 */
export interface SDKProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
  headers?: Record<string, string>;
  wireModel?: string;
  maxPromptTokens?: number;
  maxOutputTokens?: number;
}

/**
 * Convert a Promptwright CustomProviderConfig to the SDK ProviderConfig.
 * Resolves the API key / bearer token from config or environment variables
 * (PROMPTWRIGHT_PROVIDER_API_KEY / PROMPTWRIGHT_PROVIDER_BEARER_TOKEN), so the
 * app can run login-less from env alone.
 */
export function toSDKProviderConfig(config: CustomProviderConfig): SDKProviderConfig {
  const apiKey = config.apiKey || process.env.PROMPTWRIGHT_PROVIDER_API_KEY;
  const bearerToken =
    config.bearerToken || process.env.PROMPTWRIGHT_PROVIDER_BEARER_TOKEN;

  return {
    type: config.type,
    baseUrl: config.baseUrl,
    // bearerToken takes precedence over apiKey when both are set.
    ...(bearerToken ? { bearerToken } : apiKey ? { apiKey } : {}),
    ...(config.wireApi ? { wireApi: config.wireApi } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.wireModel ? { wireModel: config.wireModel } : {}),
    ...(config.maxPromptTokens ? { maxPromptTokens: config.maxPromptTokens } : {}),
    ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
    ...(config.type === "azure"
      ? { azure: { apiVersion: config.azureApiVersion || "2024-10-21" } }
      : {}),
  };
}
