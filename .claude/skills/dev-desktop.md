---
name: dev-desktop
description: Start desktop dev mode with prerequisite checks
user_invocable: true
---

# Dev Desktop

Start the JARVIS-AI desktop app in development mode.

## Steps

1. Check Node.js version is 22+ (`node --version`)
2. Check `copilot` CLI is available (`which copilot`)
3. Kill any stale process on port 5173 if needed
4. Run `pnpm dev:desktop` to start all watchers and Electron
5. Remind: do NOT open `http://localhost:5173` in a browser — the app must run in Electron
