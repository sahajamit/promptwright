---
globs: ["packages/desktop/src/renderer/**"]
---

# Electron Renderer Rules

- Access backend EXCLUSIVELY through `window.jarvis` (exposed via preload's `contextBridge`)
- NEVER import Node.js modules (`fs`, `path`, `child_process`, etc.) in renderer code
- Version display uses `__APP_VERSION__` global (injected by Vite at build time, declared in `vite-env.d.ts`)
- Desktop app MUST run in Electron — opening `http://localhost:5173` in a browser shows a black screen
