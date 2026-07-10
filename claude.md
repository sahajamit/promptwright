# Promptwright Coding Instructions

## Project Overview

Promptwright (formerly JARVIS-AI) is a QA Assistant powered by GitHub Copilot SDK, available as both CLI and Electron Desktop app. It uses a **persona-based architecture** where different personas (Manual Test Execution, Record & Repeat) provide specialized AI agents with distinct capabilities via Model Context Protocol (MCP) servers.

**Key Technologies**: TypeScript, pnpm workspace monorepo, GitHub Copilot SDK, Electron, React, Playwright MCP, Chrome DevTools Protocol (CDP)

## Monorepo Structure (pnpm workspace)

- **`packages/core/`** — Copilot SDK wrapper, persona management, MCP coordination, CDP client, recording. See `packages/core/CLAUDE.md`.
- **`packages/cli/`** — Terminal interface (`commander` + `chalk`). See `packages/cli/CLAUDE.md`.
- **`packages/desktop/`** — Electron app with React frontend, IPC, session persistence. See `packages/desktop/CLAUDE.md`.

## Building and Running

```bash
pnpm install              # Install dependencies (REQUIRED first step)
pnpm build                # Build all packages (run after changes to core)
pnpm dev:cli              # Run CLI in dev mode
pnpm dev:desktop          # Run Electron app (starts all watchers + Electron)
pnpm package:desktop      # Package for current platform
pnpm pkg:mac              # macOS DMG
pnpm pkg:win              # Windows portable
pnpm test:e2e             # All E2E tests
pnpm test:e2e:smoke       # Smoke tests (~6s, run after UI changes)
pnpm test:e2e:execution   # Full execution tests (requires Copilot auth)
```

## Plan Storage

All plans **MUST** be stored in `./specs/plans/` with format `<TOPIC>_PLAN.md`.

## Module System

- **ESM only**: All packages use `"type": "module"`
- **Import extensions**: ALWAYS use `.js` in imports (`import { Foo } from "./foo.js"`)
- **Module resolution**: `"moduleResolution": "NodeNext"` in tsconfig

## TypeScript Configuration

- Base config: `tsconfig.base.json` (shared strict settings)
- Desktop has 3 tsconfigs: `tsconfig.main.json`, `tsconfig.preload.json`, `tsconfig.renderer.json`

## Runtime Requirements

- **Node.js 22+** required
- **Copilot CLI** required and available in `PATH`
- **Copilot auth** check is advisory (non-blocking)

## Event-Driven Patterns

All major components extend `EventEmitter` for streaming/progress:
- JarvisClient: `chunk`, `tool_start`, `chunk_complete`
- RecordingManager: `state_change`, `action_recorded`

## Persona Definition

```typescript
{
  id: "manual-test-execution",
  name: "Manual Test Execution",
  requiredMCPs: [{ id: "playwright", packageName: "@playwright/mcp", command: "npx" }],
  getSystemPrompt: () => "...",
  getTools: () => []
}
```

## Key Files

- `packages/core/src/client.ts` — Core Copilot wrapper
- `packages/core/src/personas/manager.ts` — Persona system
- `packages/core/src/recording/manager.ts` — Recording orchestration
- `packages/desktop/src/main/index.ts` — Electron main (~1900 lines)
- `packages/desktop/src/preload.ts` — IPC bridge API
- `jarvis.config.example.yaml` — Configuration schema

## Versioning

**Single source of truth**: Root `package.json` version field.

- `pnpm sync:versions` — propagates root version to all subpackages
- `pnpm version:increment` — increments patch, syncs, builds, packages
- Desktop UI: Vite injects `__APP_VERSION__` (see `vite.config.ts` + `vite-env.d.ts`)
- CLI: reads version at runtime from its own `package.json`
- Shell scripts: `VERSION=$(node -p "require('./packages/desktop/package.json').version")`

| File | Role |
|------|------|
| `/package.json` | **Source of truth** |
| `scripts/sync-versions.js` | Propagates version to subpackages |
| `scripts/version-increment.js` | Increment + sync + build + package |

## Troubleshooting

Detailed fix docs in `specs/`: `PLAYWRIGHT_MCP_FIX.md`, `PERSONA_RELAUNCH_FIX.md`, `STREAM_DESTROYED_FIX_V2.md`, `WINDOWS_MCP_DEBUGGING.md`, `packages/desktop/BUILD_FIX.md`.
