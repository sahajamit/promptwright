# packages/core

Shared Copilot SDK wrapper with event-based streaming, persona management, MCP coordination, CDP client, and recording system.

## Key Components

### JarvisClient (`src/client.ts`)
Main wrapper around `@github/copilot-sdk`. Extends `EventEmitter`.
- Events: `chunk` (streaming text), `tool_start` (tool execution), `chunk_complete` (done)
- Session lifecycle: `startSession({ tools, systemInstruction, model })` → `session.askStream(prompt)`
- Requires `copilot` CLI installed and authenticated

### PersonaManager (`src/personas/manager.ts`)
- Dynamic persona registration/activation
- Coordinates MCP server provisioning based on persona's `requiredMCPs`
- Swaps system prompts and tools when switching personas
- Built-in personas: `MANUAL_TEST_EXECUTION_PERSONA`, `RECORD_AND_REPEAT_PERSONA`

### Agent Orchestrator (`src/orchestrator/`)
- `OrchestratorAgent` — routes tasks to specialized agents
- `AgentRegistry` — registers and discovers available agents
- `AgentSessionManager` — manages agent session lifecycle

### MCP Integration
- Dev mode: `npx @playwright/mcp` (stdio subprocess)
- Packaged mode: resolved from `resources/app.asar.unpacked/node_modules/.pnpm`
- Playwright tools: `playwright_navigate`, `playwright_click`, `playwright_fill`, `playwright_screenshot`
- Tool results include screenshots as base64 data URIs

### Recording System (`src/recording/`)
- `RecordingManager` — orchestrates recording lifecycle, emits `state_change` and `action_recorded`
- `Recorder` — captures CDP events, converts to actions
- `AIEnhancer` — uses Copilot to improve Gherkin quality
- `ReplayExecutor` — executes Gherkin via Playwright MCP
- Two modes: `standard` (basic) and `detailed` (advanced locators)

### Chrome DevTools Protocol (`src/cdp/`)
- Connects via WebSocket to `localhost:9222`
- Key domains: `Page`, `Input`, `Network`, `DOM`, `Runtime`
- Used for: recording user actions, screencast capture, DOM snapshots

## Configuration

- Config file: `jarvis.config.yaml` (copy from `jarvis.config.example.yaml`)
- `browser.headless` — controls Playwright browser visibility
- `personas.<persona-id>.model` — per-persona model override
- Storage: `~/.jarvis/config.yaml` (desktop), `~/.jarvis/sessions/` (sessions), `~/.jarvis/temp/` (recordings)
