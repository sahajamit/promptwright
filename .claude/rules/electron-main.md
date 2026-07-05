---
globs: ["packages/desktop/src/main/**"]
---

# Electron Main Process Rules

- Register IPC handlers via `ipcMain.handle()` BEFORE window creation
- Prerequisite checks (Node.js, Copilot CLI) must pass before enabling IPC handlers
- MCP config: check `app.isPackaged` — use `npx` in dev, bundled path in packaged mode
- Windows: call `app.setName("jarvis-ai")` BEFORE any `app.getPath()` calls
- Icon loading: try dev path (`../../assets/icon.png`) then packaged path (`resources/app/assets/`)
- Key file: `packages/desktop/src/main/index.ts` (~1900 lines) — MCP config, IPC, window management
