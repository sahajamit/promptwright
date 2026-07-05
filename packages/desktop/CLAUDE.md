# packages/desktop

Electron app with React frontend, IPC via preload script, session persistence.

## CRITICAL: Must Run in Electron

Opening `http://localhost:5173` shows a black screen — `window.jarvis` API only exists via Electron's preload script.

## IPC Architecture

1. **Main Process** (`src/main/index.ts`, ~1900 lines) — window management, JarvisClient, IPC handlers, MCP config
2. **Preload Script** (`src/preload.ts`) — exposes `window.jarvis` via `contextBridge`
3. **Renderer** (`src/renderer/`) — React app consuming `window.jarvis`

## TypeScript Configuration

Three separate tsconfigs:
- `tsconfig.main.json` — Main process (Node + Electron)
- `tsconfig.preload.json` — Preload (Node + Electron, outputs to `dist/`)
- `tsconfig.renderer.json` — Renderer (DOM + React)

## Dev Mode

`pnpm dev` runs 4 concurrent processes:
- `dev:main` — tsc watch for main process
- `dev:preload` — tsc watch for preload
- `dev:renderer` — Vite dev server for React
- `dev:electron` — launches Electron after Vite ready (`wait-on`)

## E2E Testing

Tests in `e2e/` use Playwright's `_electron.launch()` to drive the real Electron app.

```bash
pnpm test:e2e              # All tests
pnpm test:e2e:smoke        # Smoke tests (~6s) — app launch, persona modal, ExecutionPanel
pnpm test:e2e:execution    # Full execution (requires Copilot auth)
```

- Fixtures: `e2e/fixtures/electron-app.ts` (launch/teardown), `e2e/fixtures/jarvis-helpers.ts` (shared helpers)
- View report: `pnpm --filter @jarvis-ai/desktop exec playwright show-report`

## Startup Prerequisite Gate

- `src/main/prerequisites.ts` validates Node.js, Copilot CLI, and Copilot auth
- Main process blocks IPC handlers until Node + Copilot CLI checks pass
- Renderer shows `PrerequisiteBlocker` UI with re-check flow

## Packaging

```bash
pnpm package:desktop      # Current platform
pnpm pkg:mac              # macOS DMG
pnpm pkg:win              # Windows portable (scripts/build-win-portable.sh)
```

### MCP Path Resolution (packaged mode)
- Check `app.isPackaged` → resolve from `resources/app.asar.unpacked/node_modules/.pnpm`
- Use `process.execPath` (Electron binary) instead of `npx`

### Corporate Firewall Workaround
electron-builder fails downloading `winCodeSign` behind firewalls (e.g., Zscaler). Use pre-cached binaries in `.electron-builder-cache/`. See `.electron-builder-cache/README.md`.

### Cross-Platform
- Windows: `app.setName("jarvis-ai")` BEFORE any `app.getPath()` calls
- Icons: dev (`../../assets/icon.png`), packaged (`resources/app/assets/`)
- Build assets: logo bundled by Vite, icons per platform, config via `extraResources`

## Debugging

- **MCP issues**: Check Activity panel logs, verify `[JARVIS] Starting MCP server: playwright`
- **IPC errors**: Check `dist/preload.js` exists, grep for `ipcMain.handle()`, verify `contextBridge`
- **Troubleshooting docs**: `specs/PLAYWRIGHT_MCP_FIX.md`, `specs/WINDOWS_MCP_DEBUGGING.md`, `BUILD_FIX.md`
