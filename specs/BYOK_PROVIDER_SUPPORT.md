# BYOK Provider Support (Azure AI Foundry, OpenAI, Anthropic)

## Overview

JARVIS-AI supports **Bring Your Own Key (BYOK)** provider configuration, allowing you to connect to your own Azure AI Foundry, OpenAI-compatible, or Anthropic API endpoints instead of relying on GitHub Copilot's default model routing. This is useful when you need to use specific model deployments, corporate Azure endpoints, or any OpenAI-compatible API.

When a custom provider is configured, **all** sessions (orchestrator, sub-agents, and legacy single-session mode) route through the custom endpoint.

---

## User Guide

### Configuration via Settings UI (Desktop App)

1. Open **Settings** (gear icon in the sidebar)
2. Toggle **"Use custom provider instead of Copilot"** in the **Custom Provider (BYOK)** section
3. Fill in the fields:
   - **Provider Type**: Azure OpenAI, OpenAI-compatible, or Anthropic
   - **Base URL**: Your API endpoint (e.g. `https://my-resource.openai.azure.com`)
   - **API Key**: Your key (or leave blank to use the `JARVIS_PROVIDER_API_KEY` env var)
   - **Model ID**: The deployment/model name (e.g. `gpt-4o`)
   - **Azure API Version**: (Azure only) defaults to `2024-10-21`
   - **Display Name**: Optional friendly name shown in the UI
4. Click **Save Changes** — the app reinitializes automatically

When BYOK is enabled, the Copilot model dropdown is hidden since the custom provider's model is used instead.

### Configuration via Config File

Add a `provider` section to `jarvis.config.yaml` (or `~/.jarvis/config.yaml` for the desktop app):

```yaml
provider:
  type: azure                          # azure | openai | anthropic
  baseUrl: https://my-resource.openai.azure.com
  apiKey: sk-...                       # Or set JARVIS_PROVIDER_API_KEY env var
  azureApiVersion: "2024-10-21"        # Azure only
  model: gpt-4o                        # Model deployment name
  displayName: "Azure GPT-4o"          # Optional UI label
```

Remove the `provider` key (or leave it empty) to revert to Copilot's default models.

### Configuration via CLI Flags

```bash
jarvis \
  --provider-type azure \
  --provider-url https://my-resource.openai.azure.com \
  --provider-key sk-... \
  --provider-model gpt-4o
```

All four flags (`--provider-type`, `--provider-url`, `--provider-model`) are required to activate BYOK in CLI mode. `--provider-key` is optional if the env var is set.

### API Key Resolution

The API key is resolved in this order:

1. `apiKey` field in config / `--provider-key` CLI flag
2. `JARVIS_PROVIDER_API_KEY` environment variable

---

## Implementation Details

### Architecture

The BYOK provider feature threads a `CustomProviderConfig` from the config layer through the entire session creation pipeline:

```
Config (YAML / Settings UI)
  -> JarvisOptions.provider
    -> OrchestratorOptions.provider
      -> SDK SessionConfig.provider  (orchestrator session)
      -> SDK SessionConfig.provider  (sub-agent sessions via route_to_agent tool)
    -> SDK SessionConfig.provider  (legacy single-session mode)
```

The Copilot SDK already supports a `ProviderConfig` on `SessionConfig.provider`. Our implementation maps JARVIS's config shape to the SDK's expected shape via a helper function.

### Key Files

| File | Role |
|------|------|
| `packages/core/src/config/types.ts` | `CustomProviderConfig` interface definition |
| `packages/core/src/config/provider.ts` | `toSDKProviderConfig()` — maps JARVIS config to SDK `ProviderConfig`, resolves API key from env var |
| `packages/core/src/config/index.ts` | Merges `provider` field in config loading, re-exports types |
| `packages/core/src/types.ts` | `provider?` on `JarvisOptions` |
| `packages/core/src/client.ts` | Passes provider to orchestrator and legacy session creation |
| `packages/core/src/agents/orchestrator.ts` | Passes provider to orchestrator `SessionConfig` and forwards to sub-agents |
| `packages/core/src/agents/tools/route-to-agent.ts` | Passes provider config through `configOverrides` when spawning sub-agent sessions |
| `packages/desktop/src/main/index.ts` | Reads provider from config, builds `providerOption`, detects provider changes for reinit |
| `packages/desktop/src/renderer/components/Settings.tsx` | BYOK toggle, provider form fields, conditionally hides Copilot model dropdown |
| `packages/cli/src/index.ts` | `--provider-type`, `--provider-url`, `--provider-key`, `--provider-model` flags |

### Config Type

```typescript
export interface CustomProviderConfig {
  type: "azure" | "openai" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  azureApiVersion?: string;  // Azure only, default "2024-10-21"
  model: string;
  displayName?: string;
}
```

### SDK Mapping

The `toSDKProviderConfig()` function in `packages/core/src/config/provider.ts` converts our config to the SDK shape:

```typescript
function toSDKProviderConfig(config: CustomProviderConfig): SDKProviderConfig {
  const apiKey = config.apiKey || process.env.JARVIS_PROVIDER_API_KEY;
  return {
    type: config.type,
    baseUrl: config.baseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(config.type === "azure"
      ? { azure: { apiVersion: config.azureApiVersion || "2024-10-21" } }
      : {}),
  };
}
```

### Session Creation Flow

**Orchestrator mode** (default):
1. `JarvisClient.startOrchestratorMode()` passes `provider` into `OrchestratorOptions`
2. `OrchestratorAgent.initialize()` calls `toSDKProviderConfig()` and spreads it into the orchestrator `SessionConfig`
3. When the orchestrator invokes `route_to_agent`, the tool's `getProviderOverrides` callback returns the SDK provider config, which is merged into the sub-agent's `SessionConfig` via `configOverrides`

**Legacy mode**:
1. `JarvisClient.startLegacyMode()` checks `this.options.provider`, calls `toSDKProviderConfig()`, and sets `sessionConfig.provider` and `sessionConfig.model`

### Desktop Reinit on Config Change

The `config:set-and-apply` IPC handler compares the old and new `provider` configs (via JSON serialization). If they differ, it triggers a full client reinitialization — same as when the orchestrator model or automation mode changes.

### Models List Enhancement

When a custom provider is active, `models:list` injects the provider's model at the top of the list (using `displayName` or a generated label like `azure: gpt-4o`) so the UI can display the active model.

---

## Verification Checklist

- [ ] Set `provider` in config YAML with Azure credentials, start the app, verify sessions connect to Azure
- [ ] Toggle BYOK on/off in Settings UI, verify model dropdown visibility toggles
- [ ] Verify saving provider settings triggers client reinit (check logs for `reinitializing...`)
- [ ] Run `pnpm build && pnpm test:e2e:smoke` — app launches correctly
- [ ] Test with Azure OpenAI endpoint, send a prompt, check `usage_update` event's `model` field
- [ ] Verify `JARVIS_PROVIDER_API_KEY` env var is picked up when `apiKey` is omitted
- [ ] Test CLI: `jarvis --provider-type azure --provider-url <url> --provider-model gpt-4o`
