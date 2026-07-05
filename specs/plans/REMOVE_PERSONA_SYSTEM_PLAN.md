# Remove Persona System — Always-On Orchestrator Plan

## Context

JARVIS-AI currently uses a **persona-based architecture** where users select a persona (Manual Test Execution, Record & Repeat) on startup, which pre-configures the Copilot SDK session with specific system prompts, MCP servers, and skills. A newer **agent orchestration system** already exists and is production-ready, but only used for API tests.

**Problem**: The persona system gates the app, pre-loads MCP tools unnecessarily, and prevents the orchestrator from routing all task types. As JARVIS evolves into a general QA AI assistant (test planning, brainstorming, code writing, etc.), pre-loading specific MCP tools makes no sense.

**Goal**: Remove the persona gate entirely. Always use orchestrator mode. The orchestrator routes to the right agent (pw-mcp, pw-cli, api-test, workflow-observer) based on user input. Agents load their own MCP servers on demand.

## Effort Assessment

**Overall: LARGE** (~21 files touched, ~500 lines removed, ~150 lines added)

The persona system is deeply embedded across 3 layers:
- **Main process**: `initializeClient()` has ~350 lines of persona-driven branching
- **Renderer**: PersonaModal gates the app, persona state drives view routing
- **Core**: PersonaManager, persona definitions, types

However, the orchestrator already works end-to-end for API tests, so the core infrastructure exists. The work is primarily **removal and simplification**, not new feature development.

---

## Phase 1: Main Process — Make Orchestrator the Default

### 1A. Simplify `initializeClient()` in `packages/desktop/src/main/index.ts`

**Current** (lines 751-1065): `effectivePersonaId` drives automation mode, system prompt, MCP config, agent skill, model selection. Only uses orchestrator when `!effectivePersonaId`.

**New**: Always use orchestrator. Remove persona lookup entirely.

- Remove `personaId` parameter → signature becomes `initializeClient(workDir: string, copilotSessionId?: string)`
- Remove lines 781-972: the entire persona lookup, CLI/MCP mode branching, system prompt loading, skill loading, MCP server building
- Remove lines 983-992: persona model config lookup
- Line 1028: Change `const useOrchestrator = !effectivePersonaId` → `const useOrchestrator = true`
- Simplify JarvisClient constructor: remove `systemPrompt`, `agentSkill`, `mcpServers`, `skillDirectories`. Always pass `useOrchestrator: true`, `getMCPOverrides` callback, `orchestratorModel` from config
- Model comes from `config.orchestrator?.model` instead of persona config
- Keep: concurrency guards, CLI path resolution, version staleness checks, event forwarding

### 1B. Remove intent classification system from `packages/desktop/src/main/index.ts`

- Delete `classifyIntent()` function (lines 1388-1442)
- Delete `reconfigureForApiIntent()` function (lines 1449-1547)
- Delete `jarvis:classify-intent` IPC handler (lines 1809-1858)
- Delete global state: `activeIntent`, `pendingReconfiguration`, `suppressConnectionEvents`
- Update `jarvis:send-message` handler: remove `pendingReconfiguration` await, simplify `retrySend` to just call `initializeClient(workDir)`

### 1C. Remove persona initialization from `packages/desktop/src/main/index.ts`

- Delete `initializePersonaManager()` function (lines 615-645)
- Remove its call in `app.whenReady()` (line 1231)
- Delete `personaManager` global variable (line 278)
- Delete IPC handlers: `persona:list`, `persona:get-active`, `persona:select` (lines 2335-2435)
- Delete `config:get-last-used-persona` and `config:set-last-used-persona` handlers
- Update `jarvis:initialize` handler: remove `personaId` parameter, call `initializeClient(workDir, copilotSessionId)`
- Update `models:get-active`: return `config.orchestrator?.model` instead of persona model
- Remove unused imports: `MANUAL_TEST_EXECUTION_PERSONA`, `RECORD_AND_REPEAT_PERSONA`, `PersonaManager`, `API_TEST_EXECUTION_SYSTEM_PROMPT`, `API_TEST_EXECUTION_SKILL_PATH`, `buildCLISystemPrompt`, etc.

### 1D. Update `config:set-and-apply` handler

- Remove persona-aware model reconfiguration logic
- When orchestrator model changes: reinitialize client with new config

---

## Phase 2: Preload — Simplify API Surface

### File: `packages/desktop/src/preload.ts`

- `initialize()`: Remove `personaId` parameter → `(workDir, copilotSessionId?, uiSessionId?)`
- Remove `classifyIntent()` method
- Remove entire `persona` namespace (`persona.list`, `persona.getActive`, `persona.select`, `persona.onEvent`)
- Remove `config.getLastUsedPersona` and `config.setLastUsedPersona`

---

## Phase 3: Renderer — Remove Persona Gate & Simplify Views

### 3A. `packages/desktop/src/renderer/App.tsx`

- Remove imports: `PersonaModal`, `PersonaBanner`
- Remove state: `currentPersona`, `showPersonaModal`, `isPersonaSelectionInFlightRef`, `lastPersonaId`, `DEFAULT_PERSONA_ID`
- Simplify startup `useEffect`: check prerequisites → `setIsReady(true)` → session auto-creation. No persona selection step.
- Remove `handlePersonaSelect`, `handlePersonaSwitch`
- Remove `<PersonaModal>` from JSX
- Remove `currentPersona` prop from `<Header>` and `<ChatInterface>`
- `handleNewChat`: remove persona ID passing, just call `createNewSession()`
- `handleExportSession`: check `executionData` presence instead of `personaId`

### 3B. `packages/desktop/src/renderer/hooks/useSession.ts`

- `createNewSession()`: remove `personaId` parameter. Call `window.jarvis.initialize(workDir, undefined, newSession.id)` (2 args, no personaId)
- `switchSession()`: call `window.jarvis.initialize(workDir, session.copilotSessionId, session.id)`
- `retryConnection()`: remove `currentSession.personaId`
- `loadAllSessions()`: remove `window.jarvis.persona.getActive()` call

### 3C. `packages/desktop/src/renderer/components/ChatInterface.tsx`

- Remove `currentPersona` prop and `Persona` interface import
- Remove `currentPersona?.id === "record-and-repeat"` branch (RecordingPanel goes to toolbar)
- **Always render ExecutionPanel** as the default view (the orchestrator handles routing to the right agent)
- Remove `currentPersona?.id === "manual-test-execution"` guard — ExecutionPanel is always shown
- Remove `persona` prop from `ExecutionPanel` call
- Keep WelcomeScreen but remove persona-dependent text

### 3D. `packages/desktop/src/renderer/components/ExecutionPanel.tsx`

- Remove `window.jarvis.classifyIntent(input)` call — orchestrator handles routing
- Remove `isClassifying` state and transitional screen
- Remove `detectedIntent` state
- `handleSubmit` simply calls `runTest(input.trim())` directly
- Remove `persona` prop
- Model config: read from `config.orchestrator?.model` or `config.agents?.["pw-mcp-agent"]?.model`

### 3E. `packages/desktop/src/renderer/components/Header.tsx`

- Remove `currentPersona` and `onPersonaSwitch` props
- Remove persona display/switch button
- Show static "JARVIS AI" branding

### 3F. `packages/desktop/src/renderer/components/Settings.tsx`

- Remove persona model selectors (`manualTestModel`, `recordRepeatModel`)
- Add orchestrator model selector (from `config.orchestrator?.model`)
- Keep `automationMode` selector (still controls which web agent the orchestrator prefers)
- Optionally add per-agent model overrides (from `config.agents`)

### 3G. Delete persona UI components

- Delete `packages/desktop/src/renderer/components/PersonaModal.tsx`
- Delete `packages/desktop/src/renderer/components/PersonaBanner.tsx`

### 3H. Add RecordingPanel to toolbar

- Add `"recording"` to `PanelType` in `ToolBar.tsx`
- Add toolbar button: `{ id: "recording", icon: Video, label: "Record", shortcut: "R" }`
- In `App.tsx`: render `<RecordingPanel />` inside a `<SidePanel>` when `activePanel === "recording"`
- RecordingPanel continues to use existing `window.jarvis.recording.*` APIs (no change to recording backend)

---

## Phase 4: Orchestrator Enhancement — automationMode Awareness

The orchestrator needs to know which web agent to prefer based on `config.browser.automationMode`.

### 4A. Pass automationMode to orchestrator

In `packages/desktop/src/main/index.ts`, when creating JarvisClient, pass `automationMode` from config as a new option.

### 4B. Update orchestrator system prompt

In `packages/core/src/agents/orchestrator.ts`, include the preferred web automation agent in the system prompt:
- When `automationMode === "playwright-mcp"`: instruct orchestrator to prefer `pw-mcp-agent` for web tests
- When `automationMode === "playwright-cli"`: instruct orchestrator to prefer `pw-cli-agent` for web tests
- This can be injected via the agent listing or as an additional instruction block

### 4C. Alternatively: agent priority in registry

Add a `preferred` flag to web-ui-testing agents based on config, so the orchestrator's `list_available_agents` tool highlights the preferred one.

---

## Phase 5: Config & Session Cleanup

### 5A. Config schema updates

- `jarvis.config.example.yaml`: Remove `personas` section. Keep `orchestrator` and `agents` sections.
- `packages/core/src/config.ts` (or wherever config types live): Remove `PersonasConfig` type references
- Keep `browser.automationMode` (controls orchestrator's web agent preference)

### 5B. Session backward compatibility

- Keep `personaId?: string` as optional field on `Thread` type — old sessions still load
- New sessions will not have `personaId`
- No data migration needed

### 5C. `packages/desktop/src/renderer/types.ts`

- Keep `Persona` interface temporarily for type compat with old sessions
- Remove active usage, mark deprecated

---

## Phase 6: E2E Test Updates

### 6A. `packages/desktop/e2e/fixtures/jarvis-helpers.ts`

- Remove `selectPersona()` helper (already deprecated/no-op)
- `waitForAppReady()`: should work as-is (waits for textarea, not persona modal)
- `setAutomationMode()`: update config path if persona-related config changes

### 6B. `packages/desktop/e2e/smoke/dev-mode.spec.ts`

- Remove any persona modal expectations
- App should launch directly to ExecutionPanel

### 6C. `packages/desktop/e2e/execution/*.spec.ts`

- Remove persona selection steps
- Tests should work via orchestrator routing

---

## Phase 7: Core Package (Deferrable)

### 7A. `packages/core/src/client.ts`

- Default `useOrchestrator` to `true`
- Mark `startLegacyMode()` as deprecated (keep for CLI backward compat)
- Mark `systemPrompt`, `agentSkill` options as deprecated

### 7B. `packages/core/src/personas/` directory

- **Do NOT delete** — SKILL.md files are loaded by SkillManager from this directory
- Mark PersonaManager and persona definitions as deprecated
- Can be cleaned up in a future pass

---

## Files Summary

### Files to Delete
| File | Reason |
|------|--------|
| `src/renderer/components/PersonaModal.tsx` | Persona gate UI removed |
| `src/renderer/components/PersonaBanner.tsx` | Persona display removed |

### Files with Major Changes
| File | Change | Effort |
|------|--------|--------|
| `packages/desktop/src/main/index.ts` | Remove ~400 lines (persona init, intent classification, persona IPC). Simplify initializeClient to ~80 lines. | Large |
| `packages/desktop/src/renderer/App.tsx` | Remove persona state, modal, auto-select flow. Add recording panel routing. | Medium |
| `packages/desktop/src/preload.ts` | Remove persona namespace, classifyIntent, simplify initialize | Medium |
| `packages/desktop/src/renderer/components/ChatInterface.tsx` | Always render ExecutionPanel, remove persona branching | Small |
| `packages/desktop/src/renderer/components/ExecutionPanel.tsx` | Remove intent classification call, persona prop | Small |
| `packages/desktop/src/renderer/hooks/useSession.ts` | Remove personaId from session lifecycle | Small |

### Files with Minor Changes
| File | Change |
|------|--------|
| `src/renderer/components/Header.tsx` | Remove persona props |
| `src/renderer/components/Settings.tsx` | Replace persona model selectors with orchestrator/agent |
| `src/renderer/components/ToolBar.tsx` | Add "Recording" toolbar button |
| `src/renderer/components/SessionSidebar.tsx` | Remove persona display from sessions |
| `src/renderer/types.ts` | Mark persona types deprecated |
| `packages/core/src/agents/orchestrator.ts` | Add automationMode-aware prompt injection |
| `e2e/fixtures/jarvis-helpers.ts` | Remove persona helpers |
| `e2e/smoke/dev-mode.spec.ts` | Remove persona expectations |

---

## Verification

1. `pnpm build` — must pass (zero TS errors)
2. `pnpm test:e2e:smoke` — must pass (app launches directly to ExecutionPanel, no persona modal)
3. Manual test: Open app → type a web test → verify orchestrator routes to pw-mcp-agent → test executes with Playwright MCP tools
4. Manual test: Open app → type an API test → verify orchestrator routes to api-test-agent → test executes with bash tools
5. Manual test: Click Recording toolbar button → verify RecordingPanel opens
6. Manual test: Open Settings → verify orchestrator model selector works, no persona model selectors
7. Manual test: Switch automationMode in Settings → verify next web test uses pw-cli-agent instead

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Recording workflow broken | Medium | RecordingPanel moves to toolbar panel with existing backend APIs unchanged |
| Old sessions with personaId | Low | Keep field optional, graceful handling |
| CLI package regression | Low | Keep legacy mode in core, mark deprecated |
| Orchestrator doesn't know automationMode | Medium | Phase 4 injects preference into orchestrator prompt |
| E2E tests break | Low | Tests already adapted to auto-select; minimal changes needed |
