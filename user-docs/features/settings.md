# Settings

Click the **Gear icon** in the left toolbar to configure JARVIS-AI.

## Browser Settings

### Headless Mode

When enabled (default), the browser runs invisibly for faster test execution. Disable this to watch the browser in a visible window during tests.

### Automation Mode

Choose how JARVIS-AI controls the browser:

- **Playwright MCP** (default) — Rich tool integration via the Model Context Protocol. Provides the most comprehensive browser control.
- **Playwright CLI** — Token-efficient alternative using CLI commands. Use this to reduce token usage and cost for simpler tests.

## AI Model

### Model Selection

Choose which AI model powers your tests. The dropdown lists all models available through your Copilot subscription. Options include:

- **Use Copilot default** — Let Copilot automatically select the best model
- Specific models listed by name and version

Models marked with a **✦** symbol support reasoning effort configuration.

### Reasoning Effort

Controls how much "thinking" the AI does before responding (only available when the selected model supports it):

| Level | Best For |
|-------|----------|
| **Low** | Simple, fast tests where speed matters |
| **Medium** (default) | Most test scenarios — good balance |
| **High** | Complex test logic requiring careful analysis |
| **Extra High** | Maximum reasoning depth for the most complex tasks |

## Custom AI Provider (BYOK)

If you want to use your own AI API instead of GitHub Copilot, enable **Custom Provider**:

### Supported Providers

- **Azure OpenAI** — Requires: base URL, API key, model name, Azure API version
- **OpenAI-compatible** — Any OpenAI API-compatible endpoint (base URL, API key, model)
- **Anthropic** — Direct Anthropic API (base URL, API key, model)

### Configuration

1. Toggle **Enable Custom Provider** on
2. Select your provider type
3. Enter the base URL for your API endpoint
4. Enter your API key (or set the `JARVIS_PROVIDER_API_KEY` environment variable)
5. Enter the model name
6. Optionally set a display name for the UI

### Configuration File

Settings can also be configured via a YAML file. Example:

```yaml
browser:
  headless: true
  automationMode: playwright-mcp

orchestrator:
  model: ""                    # Empty = use Copilot default
  reasoningEffort: medium

provider:
  type: azure
  baseUrl: https://your-endpoint.openai.azure.com
  apiKey: your-key-here
  model: gpt-4o
  displayName: "My Azure GPT-4o"
  azureApiVersion: "2024-10-21"
```

## Saving

Click **Save** to apply changes. Click **Cancel** to discard and return to Chat.
