# Playwright CLI Integration — Implementation Guide

## Overview

JARVIS AI supports **two browser automation backends** that users can switch between via a Settings dropdown:

| Mode | Package | How the LLM drives the browser |
|------|---------|-------------------------------|
| **Playwright MCP** (default) | `@playwright/mcp` | LLM invokes structured MCP tools (`browser_click`, `browser_snapshot`) through the Copilot SDK's MCP server integration |
| **Playwright CLI** | `@playwright/cli` | LLM issues concise shell commands via the SDK's built-in `bash` tool (`playwright-cli click e15`, `playwright-cli snapshot`) |

**Why CLI mode?** Token efficiency. MCP mode loads large tool schemas and verbose accessibility trees into the context window. CLI mode uses lightweight bash commands that consume far fewer tokens for the same browser interactions.

**Both modes share** the same Chrome browser lifecycle, CDP screencast flow, verdict format, and UI. The only difference is *how the LLM talks to the browser*.

---

## Architecture

### Unified Browser Strategy

Both modes reuse the exact same browser infrastructure:

```
Both modes share:
├── ChromeLauncher.launch(port=9222)        # Same Chrome instance
├── CDP screencast recorder                  # Same real-time screencast
├── UI (chat, screencast panel, verdicts)    # Same user experience
└── Config/Settings                          # Same config system

MCP Mode:                              CLI Mode:
├── mcpServers = { playwright-mcp }    ├── mcpServers = undefined
├── skillDirectories = undefined       ├── skillDirectories = [~/.jarvis-ai/skills]
├── LLM calls MCP tools                ├── LLM calls bash with playwright-cli
│   (browser_click, etc.)              │   (playwright-cli click e15, etc.)
└── Heavy tool schemas in context      └── Lightweight CLI commands
```

### Data Flow

```
User clicks "Run Test" in Electron UI
        │
        ▼
Electron Main Process (initializeClient)
        │
        ├── Reads config.browser.automationMode
        │
        ├── if 'playwright-mcp':
        │   ├── Builds mcpServers config with --cdp-endpoint http://localhost:9222
        │   ├── Sets MCP-specific system prompt
        │   └── Creates JarvisClient({ mcpServers, systemPrompt })
        │
        └── if 'playwright-cli':
            ├── Installs playwright-cli SKILL.md to ~/.jarvis-ai/skills/ (first time)
            ├── Sets skillDirectories = [~/.jarvis-ai/skills]
            ├── Kills stale playwright-cli daemons (killPlaywrightCLIDaemons)
            ├── Fetches WebSocket URL from Chrome's /json/version endpoint
            ├── Writes playwright-cli.json config with WS URL + isolated: false
            ├── Sets CLI-specific system prompt
            └── Creates JarvisClient({ skillDirectories, systemPrompt })
                    │
                    ▼
            Copilot SDK Session
                    │
                    ├── SDK discovers SKILL.md from skillDirectories
                    ├── SDK has built-in bash, view, edit, grep tools
                    ├── LLM reads SKILL.md → understands playwright-cli commands
                    └── LLM executes: bash("playwright-cli goto https://example.com")
```

### Key Differences Table

| Aspect | MCP Mode | CLI Mode |
|--------|----------|----------|
| **LLM interaction** | MCP tool calls (structured JSON-RPC) | Shell commands via SDK's built-in `bash` tool |
| **Token cost** | Heavy — tool schemas + accessibility tree | Light — concise CLI commands |
| **Browser** | Chrome on port 9222 via `ChromeLauncher` | Same Chrome on port 9222 |
| **Screencast** | CDP-based `ScreencastRecorder` | Same CDP-based `ScreencastRecorder` |
| **Copilot session config** | `mcpServers` populated, `skillDirectories` empty | `mcpServers` empty, `skillDirectories` populated |
| **System prompt** | Minimal (MCP tools auto-discovered by SDK) | CLI command reference included |
| **Skill loading** | `agentSkill` string injected into system prompt | SDK's `skillDirectories` discovers SKILL.md natively |
| **Supported personas** | Manual Test Execution, Workflow Observer | Both (each has a CLI-specific system prompt) |

---

## How Playwright CLI Skill Installation Works

The skill installation is the most important piece of CLI mode. Here's exactly how it works:

### The Problem

The `@playwright/cli` npm package does **not** ship a `skills/` directory. The npm package only contains `playwright-cli.js` (the CLI binary) and its dependencies. The skill files (SKILL.md + reference docs) are only in the [GitHub repository](https://github.com/microsoft/playwright-cli).

### The Solution

The `@playwright/cli` package has a built-in `install --skills` command that **generates** the skill files at runtime:

```bash
playwright-cli install --skills
# Creates:
#   .claude/skills/playwright-cli/SKILL.md
#   .claude/skills/playwright-cli/references/
#     ├── session-management.md
#     ├── running-code.md
#     ├── test-generation.md
#     ├── storage-state.md
#     ├── tracing.md
#     ├── request-mocking.md
#     └── video-recording.md
```

### Installation Flow (in `playwright-cli-manager.ts`)

```
installPlaywrightCLISkill()
    │
    ├── 1. Resolve bundled CLI binary
    │      cliPath = require.resolve("@playwright/cli/playwright-cli.js")
    │
    ├── 2. Create temp directory
    │      ~/.jarvis-ai/temp/cli-install/
    │
    ├── 3. Run `node <cliPath> install --skills` in temp dir
    │      Creates: <tempDir>/.claude/skills/playwright-cli/SKILL.md
    │      Creates: <tempDir>/.claude/skills/playwright-cli/references/*.md
    │
    ├── 4. Read generated SKILL.md
    │      Append JARVIS-specific rules (verdict format, CDP rules, etc.)
    │      Write to: ~/.jarvis-ai/skills/playwright-cli/SKILL.md
    │
    ├── 5. Copy references/ directory
    │      From: <tempDir>/.claude/skills/playwright-cli/references/
    │      To:   ~/.jarvis-ai/skills/playwright-cli/references/
    │
    └── 6. Clean up temp directory
```

### JARVIS-Specific Skill Additions

The following rules are appended to the upstream SKILL.md (inlined in `playwright-cli-manager.ts` to avoid file path issues across dev/packaged modes):

```markdown
## JARVIS-AI Specific Rules

IMPORTANT: A Chrome browser is already launched and connected via Chrome DevTools Protocol (CDP).
A `playwright-cli.json` config file is provided in the working directory with the CDP endpoint.

- You MUST start with `playwright-cli open --config=playwright-cli.json` to initialize the session — this connects to the existing Chrome browser via CDP (it does NOT launch a new one)
- Then navigate using `playwright-cli goto <url>`
- Always use `playwright-cli snapshot` before interacting to get element refs
- Use element refs (e.g., e15) from snapshots for click, fill, type, etc.
- Only the `open` command needs `--config=playwright-cli.json`. Subsequent commands (goto, click, snapshot, etc.) do NOT need it.
- Do NOT pass `--headed`, `--browser`, or `--cdp-endpoint` flags
- After completing all test steps, provide your final verdict in this EXACT format:
  - SUCCESS: "TEST PASSED: [brief summary of what was verified]"
  - FAILURE: "TEST FAILED: [which step failed and why]"
- The verdict text "TEST PASSED:" or "TEST FAILED:" is CRITICAL for UI rendering
```

### Installed Skill Directory Structure

```
~/.jarvis-ai/
└── skills/
    └── playwright-cli/
        ├── SKILL.md                    # Upstream SKILL.md + JARVIS additions
        └── references/
            ├── session-management.md   # Named sessions, isolation
            ├── running-code.md         # run-code command
            ├── test-generation.md      # Test code generation
            ├── storage-state.md        # Cookie/storage management
            ├── tracing.md              # Trace recording
            ├── request-mocking.md      # Network mocking
            └── video-recording.md      # Video capture
```

### How the SDK Discovers Skills

The Copilot SDK (v0.1.23+) has a `skillDirectories` parameter in `SessionConfig`:

```typescript
// packages/core/src/client.ts
const sessionConfig = {
  streaming: true,
  skillDirectories: ["/Users/<user>/.jarvis-ai/skills"],
  // ...
};
this.session = await this.client.createSession(sessionConfig);
```

The SDK scans these directories for `SKILL.md` files and loads them into the agent's context. The skill's frontmatter specifies allowed tools:

```yaml
---
name: playwright-cli
description: Automates browser interactions...
allowed-tools: Bash(playwright-cli:*)
---
```

This means the SDK's built-in `bash` tool is used to execute `playwright-cli` commands — no additional tool registration needed.

---

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/mcp/playwright-cli-manager.ts` | Skill installer, CDP config writer, daemon lifecycle. Runs `playwright-cli install --skills`, appends JARVIS additions, copies to `~/.jarvis-ai/skills/`. Also provides `writePlaywrightCLIConfig()` (writes `playwright-cli.json` with `isolated: false`), `fetchCDPWebSocketUrl()`, and `killPlaywrightCLIDaemons()` |
| `packages/core/src/personas/playwright-cli/JARVIS-SKILL-ADDITIONS.md` | Reference copy of the JARVIS-specific rules appended to the skill (content is inlined in the manager for reliability) |

### Modified Files — Core Package

| File | Change |
|------|--------|
| `packages/core/package.json` | Added `@playwright/cli: ^0.1.0` dependency. Upgraded `@github/copilot-sdk` from 0.1.20 to 0.1.23 (required for `skillDirectories` support) |
| `packages/core/src/config/types.ts` | Added `automationMode?: 'playwright-mcp' \| 'playwright-cli'` to `BrowserConfig`. Updated `DEFAULT_CONFIG` |
| `packages/core/src/types.ts` | Added `skillDirectories?: string[]` to `JarvisOptions` |
| `packages/core/src/client.ts` | Pass `skillDirectories` from options to SDK `SessionConfig` |
| `packages/core/src/personas/manual-test-execution/system-prompt.ts` | Added `buildCLISystemPrompt()` function |
| `packages/core/src/personas/manual-test-execution/index.ts` | Export `buildCLISystemPrompt` |
| `packages/core/src/personas/record-and-repeat/system-prompt.ts` | Added `buildCLISystemPromptForObserver()` function |
| `packages/core/src/personas/record-and-repeat/index.ts` | Export `buildCLISystemPromptForObserver` |
| `packages/core/src/index.ts` | Export all new functions: `buildCLISystemPrompt`, `buildCLISystemPromptForObserver`, `fetchCDPWebSocketUrl`, `getGlobalSkillsDir`, `getPlaywrightCLIEnvVars`, `installPlaywrightCLISkill`, `isPlaywrightCLISkillInstalled`, `killPlaywrightCLIDaemons`, `writePlaywrightCLIConfig` |

### Modified Files — Desktop Package

| File | Change |
|------|--------|
| `packages/desktop/src/main/index.ts` | **Imports**: Added all CLI-related imports from `@jarvis-ai/core` including `fetchCDPWebSocketUrl` and `killPlaywrightCLIDaemons`. **initializeClient()**: Added automation mode branching — reads `config.browser.automationMode`, then either configures MCP servers (existing) or: installs skill, sets `skillDirectories`, kills stale daemons, fetches WS URL from `/json/version`, writes `playwright-cli.json` with `isolated: false` + WS URL (CLI). **cleanupRuntimeResources()**: Uses `killPlaywrightCLIDaemons()` (bundled CLI binary) for cleanup when in CLI mode |
| `packages/desktop/src/renderer/components/Settings.tsx` | Added `automationMode` state, loaded from config on open, saved with config on save. Added "Browser Automation Mode" `<select>` dropdown in Browser section |

### Modified Files — Config

| File | Change |
|------|--------|
| `jarvis.config.example.yaml` | Added `automationMode: playwright-mcp` under `browser:` section |

---

## Detailed Code Walkthrough

### 1. Configuration Schema

**File**: `packages/core/src/config/types.ts`

```typescript
export interface BrowserConfig {
    headless: boolean;
    automationMode?: 'playwright-mcp' | 'playwright-cli';
}

export const DEFAULT_CONFIG: JarvisConfig = {
    browser: {
        headless: true,
        automationMode: 'playwright-mcp',
    },
    // ...
};
```

The `automationMode` is optional with a default of `'playwright-mcp'` to ensure backward compatibility. The existing `mergeConfig()` function in `config/index.ts` handles this field automatically via object spread.

### 2. JarvisClient — Passing skillDirectories to SDK

**File**: `packages/core/src/client.ts`

```typescript
// In start() method, after system prompt setup:
if (this.options.skillDirectories && this.options.skillDirectories.length > 0) {
  sessionConfig.skillDirectories = this.options.skillDirectories;
  this.log("debug", `Skill directories: ${this.options.skillDirectories.join(", ")}`);
}
```

This is a clean pass-through. The SDK's `SessionConfig.skillDirectories` (confirmed in v0.1.23 types.d.ts line 575) handles all the skill discovery internally.

### 3. Electron Main — initializeClient() Branching

**File**: `packages/desktop/src/main/index.ts` (~line 732)

The initialization function reads the automation mode and branches:

**CLI Mode** (when `automationMode === 'playwright-cli'`):
1. Calls `installPlaywrightCLISkill()` if SKILL.md not found at `~/.jarvis-ai/skills/playwright-cli/SKILL.md`
2. Sets `skillDirectories = [getGlobalSkillsDir()]` → `["~/.jarvis-ai/skills"]`
3a. Kills stale playwright-cli daemons via `killPlaywrightCLIDaemons()` (uses bundled CLI binary)
3b. Fetches WebSocket URL from Chrome's `/json/version` endpoint via `fetchCDPWebSocketUrl()` (falls back to HTTP URL on failure)
3c. Writes `playwright-cli.json` to workDir via `writePlaywrightCLIConfig()` with the WS URL and `isolated: false` — this is critical for screencast to work (see "CDP Context Isolation Fix" below)
4. Loads CLI-specific system prompt via `buildCLISystemPrompt()` or `buildCLISystemPromptForObserver()`
5. Sets `agentSkill = undefined` (SDK discovers skills from directories)
6. Sets `mcpServers = undefined` (no MCP servers in CLI mode)

**MCP Mode** (existing behavior, unchanged):
1. Builds system prompt dynamically from persona's MCP server list
2. Configures Playwright MCP in Copilot CLI config (`~/.copilot/mcp.json`)
3. Builds MCP servers config with `--cdp-endpoint http://localhost:9222`
4. Loads agent skill from persona's `skillPath` (except manual-test-execution)

Both modes then create a `JarvisClient` with the mode-appropriate options:

```typescript
jarvisClient = new JarvisClient({
  workDir,
  verbose: true,
  model: modelFromConfig,
  systemPrompt,        // CLI-specific or MCP-specific
  agentSkill,          // undefined in CLI mode
  mcpServers,          // undefined in CLI mode
  skillDirectories,    // set in CLI mode, undefined in MCP mode
  copilotSessionId,
});
```

### 4. CLI System Prompts

Each persona has a dedicated CLI system prompt builder:

**Manual Test Execution** (`buildCLISystemPrompt()`):
```
Execute test steps using playwright-cli commands via bash.

Rules:
- You MUST start with `playwright-cli open --config=playwright-cli.json` to connect to the existing Chrome via CDP
- Then navigate: playwright-cli goto <url>
- Get element refs: playwright-cli snapshot
- Interact using refs: playwright-cli click e15, playwright-cli fill e5 "text"
- Only the `open` command needs --config. Subsequent commands do NOT need it.
- Do NOT pass --headed, --browser, or --cdp-endpoint flags
- After all steps, verdict MUST be:
  SUCCESS: "TEST PASSED: [summary]"
  FAILURE: "TEST FAILED: [step that failed and why]"
```

**Workflow Observer** (`buildCLISystemPromptForObserver()`):
Same CLI rules plus Gherkin generation instructions (Given/When/Then, locator comments, etc.)

### 5. Settings UI

**File**: `packages/desktop/src/renderer/components/Settings.tsx`

A `<select>` dropdown in the Browser section:

```
Browser Automation Mode
  [Playwright MCP — Rich tool integration via MCP protocol     ▼]
  ├─ Playwright MCP — Rich tool integration via MCP protocol
  └─ Playwright CLI — Token-efficient CLI commands
```

The value is saved via the existing config IPC:
```typescript
await window.jarvis.config.set({
  browser: { headless, automationMode: 'playwright-cli' },
  // ...
});
```

No changes to the preload script were needed — the config `get`/`set` handlers already support arbitrary fields via deep merge.

### 6. Cleanup

**File**: `packages/desktop/src/main/index.ts` — `cleanupRuntimeResources()`

When in CLI mode, kills any lingering playwright-cli sessions using the bundled CLI binary:

```typescript
if (currentConfig.browser.automationMode === 'playwright-cli') {
  await killPlaywrightCLIDaemons();
}
```

`killPlaywrightCLIDaemons()` resolves the bundled `@playwright/cli/playwright-cli.js` via `require.resolve()` and runs `node <cliPath> kill-all`. This works in both dev and packaged Electron modes (unlike the previous `spawnSync("playwright-cli", ...)` which relied on global PATH).

This runs alongside the existing Chrome and MCP process cleanup.

---

## CDP Connection Configuration

### Config File (`playwright-cli.json`)

The primary mechanism for connecting playwright-cli to JARVIS's Chrome browser. Written to the Copilot SDK's working directory before each session:

```json
{
  "browser": {
    "cdpEndpoint": "ws://localhost:9222/devtools/browser/<UUID>",
    "isolated": false
  },
  "outputMode": "stdout"
}
```

**Key fields:**
- **`cdpEndpoint`**: The WebSocket URL fetched from Chrome's `/json/version` endpoint. Falls back to `http://localhost:9222` if the WS URL cannot be fetched.
- **`isolated: false`**: **Critical for screencast.** Without this, playwright-cli creates a new browser context (like incognito) and navigates there — but JARVIS's `ScreencastRecorder` captures the default context's page, which stays at `about:blank`. Setting `isolated: false` makes playwright-cli reuse the default context so screencast captures actual navigation.
- **`outputMode: "stdout"`**: Required for Copilot SDK to capture CLI output.

### Environment Variables (belt-and-suspenders)

Also set on `process.env` as a fallback, though the config file is the primary mechanism:

| Variable | Value | Purpose |
|----------|-------|---------|
| `PLAYWRIGHT_MCP_CDP_ENDPOINT` | WS URL (or `http://localhost:9222` fallback) | Tells `playwright-cli` to connect to our managed Chrome instance instead of launching a new browser |
| `PLAYWRIGHT_CLI_SESSION` | `jarvis-test` | Names the CLI session for consistent browser context and easy cleanup |

---

## Package Dependencies

| Package | Version | Location | Purpose |
|---------|---------|----------|---------|
| `@playwright/cli` | `^0.1.0` | `packages/core/package.json` | Bundled CLI binary for skill generation + runtime execution |
| `@github/copilot-sdk` | `0.1.23` | `packages/core/package.json` | Upgraded from 0.1.20 for `skillDirectories` support in `SessionConfig` |

The `@playwright/cli` package is a thin wrapper around Playwright's built-in terminal program (`playwright/lib/mcp/terminal/program`). It depends on `playwright` (alpha) and `minimist`.

---

## How to Switch Modes (User Perspective)

1. Open JARVIS desktop app
2. Click Settings (gear icon)
3. Under **Browser** section, find **Browser Automation Mode** dropdown
4. Select either:
   - **Playwright MCP** — Rich tool integration via MCP protocol (default)
   - **Playwright CLI** — Token-efficient CLI commands
5. Click **Save Changes**
6. Restart the app (required for mode change to take effect)

---

## Verification Checklist

1. **Settings UI**: Open Settings → verify "Browser Automation Mode" dropdown → select CLI → save → verify `automationMode: playwright-cli` in config YAML
2. **MCP mode regression**: Select MCP → run test → verify Chrome launches, screencast works, LLM uses MCP tools (`browser_click`, etc.), verdict returned
3. **CLI mode**: Select CLI → run test → verify:
   - Skill installed at `~/.jarvis-ai/skills/playwright-cli/SKILL.md`
   - Chrome launches on 9222
   - Console shows `[JARVIS] CDP WebSocket URL: ws://localhost:9222/devtools/browser/...`
   - `playwright-cli.json` written with `isolated: false` and WS URL
   - LLM uses `playwright-cli` bash commands (visible in tool_start events as `toolName: "bash"`)
   - Live preview panel shows actual browser navigation (not blank)
   - Screencast works — recorded video shows the test execution
   - No separate browser window appears (playwright-cli uses JARVIS's Chrome default context)
   - Verdict returned with correct format
4. **Mode switching**: Alternate between modes → verify clean handoff, no state leakage
5. **Cleanup**: Close app → verify no orphan Chrome or CLI processes remain
6. **Both personas**: Test CLI mode with both Manual Test Execution and Workflow Observer

---

## Design Decisions & Tradeoffs

### Why `skillDirectories` instead of `agentSkill`?

The original approach injected the SKILL.md content as a string into `agentSkill`, which gets concatenated into the system prompt. The SDK v0.1.23 introduced `skillDirectories` which provides native skill discovery — the SDK reads SKILL.md files from specified directories and handles them as proper skills with metadata (name, description, allowed-tools). This is cleaner and matches how Claude Code itself handles skills.

### Why inline JARVIS additions instead of a separate .md file?

TypeScript doesn't copy `.md` files to the `dist/` directory during compilation. In packaged Electron mode, the path resolution between `src/` and `dist/` would break. Inlining the additions as a constant string in `playwright-cli-manager.ts` ensures they work in all environments (dev, packaged macOS, packaged Windows).

### Why use `playwright-cli install --skills` instead of bundling SKILL.md?

The `@playwright/cli` npm package does not include the `skills/` directory (only the git repo has it). Running `install --skills` at runtime generates the skill files using the installed Playwright version, ensuring they stay in sync with the CLI binary.

### Why a global skills directory (`~/.jarvis-ai/skills/`) instead of per-project?

Skills are not project-specific — they describe the CLI tool's capabilities. A global directory avoids reinstalling on every project switch and matches the pattern used by Claude Code (`.claude/skills/`).

### Why use `playwright-cli.json` config file AND env vars?

The `playwright-cli.json` config file in the working directory is the **primary** mechanism because:
- It supports `isolated: false` — critical for screencast to work (env vars cannot set this)
- It supports the WebSocket URL for direct CDP connection
- It's auto-discovered by `playwright-cli` in its CWD
- Env vars set on the Electron process may not be inherited by Copilot CLI subprocesses

The env vars (`PLAYWRIGHT_MCP_CDP_ENDPOINT`, `PLAYWRIGHT_CLI_SESSION`) are set as belt-and-suspenders but are secondary to the config file.

### Why `isolated: false`?

The playwright-cli daemon defaults to `isolated: true`, which creates a **new browser context** (like incognito) for each session. When connecting via CDP with `isolated: true`:
- playwright-cli navigates pages in the new isolated context
- JARVIS's `ScreencastRecorder` calls `Page.startScreencast` on the **default page** in the **default context**
- The default page stays at `about:blank` → screencast captures **0 frames**
- The user sees no live preview and no recorded video

Setting `isolated: false` makes playwright-cli reuse the default browser context, so all navigation happens on the page that the screencast is recording.

### Why fetch the WebSocket URL?

Chrome's `/json/version` endpoint returns the exact `ws://localhost:9222/devtools/browser/<UUID>` URL. While `connectOverCDP` supports both HTTP and WS URLs, the WS URL is more direct and matches the approach proven in independent testing. The HTTP URL is used as a fallback if `/json/version` is unavailable.
