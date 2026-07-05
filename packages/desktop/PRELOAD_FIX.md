# Preload Script Fix

## Issue
The preload script was compiled as ES modules (`import`/`export`) but Electron's preload scripts require CommonJS (`require`/`exports`).

**Error Message:**
```
Unable to load preload script: .../preload.js
SyntaxError: Cannot use import statement outside a module
```

## Fix Applied

Updated `tsconfig.preload.json`:
```json
{
  "compilerOptions": {
    "module": "CommonJS",  // Changed from "ESNext"
    // ... other options
  }
}
```

## Result

The preload script now compiles to CommonJS:
```javascript
"use strict";
const electron_1 = require("electron");
// ... rest of the code
```

Instead of ES modules:
```javascript
import { contextBridge, ipcRenderer } from "electron";
// ... rest of the code
```

## How to Apply

1. Stop the dev server (Ctrl+C)
2. Recompile preload script:
   ```bash
   cd packages/desktop
   rm -f src/preload.js
   pnpm tsc -p tsconfig.preload.json
   ```
3. Restart dev server:
   ```bash
   pnpm dev
   ```

## Why This Matters

Electron preload scripts run in a special context:
- They have access to Node.js APIs (like `require`)
- They run before the renderer process loads
- They must use CommonJS module format
- ES modules are not supported in this context

The renderer process (React app) can use ES modules because it's bundled by Vite, but the preload script is loaded directly by Electron and must use CommonJS.
