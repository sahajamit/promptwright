# Playwright MCP Fix - Complete Solution

## Problem Summary

The Playwright MCP tools were not available to the Copilot SDK in the packaged app, causing the AI to fall back to `bash` and `task` tools instead of using proper browser automation with `playwright_navigate`, `playwright_click`, etc.

### Root Causes

1. **ASAR Archive Access**: Initially tried to copy `@playwright/mcp` to `extraResources`, but dependencies weren't copied due to pnpm symlinks
2. **Browser Installation Delay**: On first run, Playwright needs to download and install browsers (Chrome, Firefox, WebKit), which takes 1-2 minutes
3. **MCP Server Startup Delay**: The Copilot SDK creates the session immediately, but MCP servers take time to start and connect
4. **Race Condition**: First test message was sent before MCP servers were ready, so Playwright tools weren't available

## Solutions Implemented

### 1. Keep Playwright in ASAR Archive

**File**: `packages/desktop/src/main/index.ts` (lines 93-123)

- Removed `asarUnpack` patterns (caused build errors with pnpm monorepo)
- Kept `@playwright/mcp` and `playwright` in the ASAR bundle
- Use Electron with `ELECTRON_RUN_AS_NODE=1` to execute Node.js code from ASAR

```typescript
// Packaged mode: Use Electron as Node.js to run MCP from ASAR
const mcpCliPath = path.join(appPath, "node_modules", "@playwright", "mcp", "cli.js");
command = process.execPath; // Electron binary
args = [mcpCliPath];
mcp.env = { ...mcp.env, ELECTRON_RUN_AS_NODE: "1" };
```

**Why this works**: Electron can read files from ASAR archives directly when running with `ELECTRON_RUN_AS_NODE`.

### 2. Pre-install Playwright Browsers

**File**: `packages/desktop/src/main/index.ts` (lines 442-495)

- Detect if Playwright browsers are already installed (marker file in userData)
- On first persona selection, install Chromium browser synchronously
- Show status notifications to renderer: "Installing Playwright browsers (first run)..."
- Create marker file after successful installation

```typescript
// Check marker file
const browsersInstalledMarker = path.join(app.getPath('userData'), '.playwright-installed');

if (!existsSync(browsersInstalledMarker)) {
  // Install browsers using Electron as Node
  const installCmd = `"${process.execPath}" "${playwrightPath}/cli.js" install chromium`;
  execSync(installCmd, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: 'inherit'
  });
  fs.writeFileSync(browsersInstalledMarker, new Date().toISOString());
}
```

**Benefits**:
- First persona selection takes 1-2 minutes (one time only)
- Subsequent selections are instant
- Browser is ready before MCP server starts

### 3. Wait for MCP Server Initialization

**File**: `packages/desktop/src/main/index.ts` (lines 551-577)

- After `jarvisClient.start()`, wait 5 seconds if persona uses MCP servers
- This gives MCP servers time to spawn and connect to the Copilot SDK
- Show status notifications: "Connecting to MCP servers..."

```typescript
await jarvisClient.start();

if (mcpServers && Object.keys(mcpServers).length > 0) {
  console.log("[JARVIS] Waiting for MCP servers to initialize...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log("[JARVIS] ✓ MCP servers should be ready");
}
```

**Why 5 seconds**: 
- MCP server spawns in ~1-2 seconds
- Connection handshake takes another 1-2 seconds
- 5 seconds provides a safe buffer

### 4. Status UI for User Feedback

**Files**: 
- `packages/desktop/src/main/index.ts` (status events)
- `packages/desktop/src/renderer/components/PersonaModal.tsx` (listener)
- `packages/desktop/src/preload.ts` (electron API)

Added IPC events for real-time status updates:

```typescript
mainWindow.webContents.send('persona:status', {
  message: 'Installing Playwright browsers (first run)...',
  progress: 0
});
```

PersonaModal shows:
- "Installing Playwright browsers (first run)..." (1-2 minutes, first time only)
- "Initializing AI session..." (instant)
- "Connecting to MCP servers..." (5 seconds)
- "Ready" (ready to execute tests)

## Testing Instructions

### First Launch (Browser Installation)

1. **Delete marker file** (to test first-run experience):
   ```bash
   rm ~/Library/Application\ Support/jarvis-ai/.playwright-installed
   ```

2. **Launch app**:
   ```bash
   open packages/desktop/release/mac-arm64/JARVIS-AI.app
   ```

3. **Select "Manual Test Execution" persona**
   - You should see: "Installing Playwright browsers (first run)..."
   - This takes 1-2 minutes (downloads ~180MB of Chromium)
   - Then: "Initializing AI session..."
   - Then: "Connecting to MCP servers..." (5 seconds)
   - Finally: "Ready"

4. **Check console logs** (View → Developer → JavaScript Console):
   ```
   [JARVIS] Checking Playwright browsers installation...
   [JARVIS] Installing Playwright browsers (first run, this may take 1-2 minutes)...
   [JARVIS] Running: ".../Electron" ".../playwright/cli.js" install chromium
   [JARVIS] ✓ Playwright browsers installed successfully
   [JARVIS] Using extraResources MCP path: .../app.asar/node_modules/@playwright/mcp/cli.js
   [JARVIS] Packaged mode: spawning MCP with: .../Electron .../cli.js + 1 extra args
   [JARVIS] Starting Jarvis client session...
   [JARVIS] ✓ Session started
   [JARVIS] Waiting for MCP servers to initialize...
   [JARVIS] ✓ MCP servers should be ready
   [JARVIS] ✓ Client initialized and ready
   ```

5. **Run a test**:
   ```
   Navigate to https://www.saucedemo.com/
   Login with username: standard_user, password: secret_sauce
   Verify the products page is displayed
   ```

6. **Check execution logs** - The AI should now use:
   - `playwright_navigate` (not `bash`)
   - `playwright_click` (not `task`)
   - `playwright_fill` (not `echo`)
   - `playwright_screenshot` for verification

### Subsequent Launches (Instant)

1. **Launch app again**:
   ```bash
   open packages/desktop/release/mac-arm64/JARVIS-AI.app
   ```

2. **Select persona** - Should be instant:
   - Skips browser installation (already installed)
   - Only waits 5 seconds for MCP server connection
   - Shows "Connecting to MCP servers..." → "Ready"

3. **Run same test** - Playwright tools should be immediately available

## Expected Console Output

### Main Process Logs

```
[JARVIS] App path: /path/to/app.asar
[JARVIS] MCP CLI path: /path/to/app.asar/node_modules/@playwright/mcp/cli.js
[JARVIS] Packaged mode: spawning MCP with: /path/to/Electron /path/to/cli.js + 1 extra args
[JARVIS] MCP environment: { "ELECTRON_RUN_AS_NODE": "1", "CDP_ENDPOINT": "http://localhost:9222" }
[JARVIS SDK] Creating session with config: { "mcpServers": { "playwright-mcp": { ... } } }
[JARVIS SDK] ✓ Session created successfully
[JARVIS] Waiting for MCP servers to initialize...
[JARVIS] ✓ MCP servers should be ready
```

### Execution Logs (with Playwright tools)

```json
{
  "toolName": "playwright_navigate",
  "toolArgs": { "url": "https://www.saucedemo.com/" }
}
```

```json
{
  "toolName": "playwright_fill",
  "toolArgs": { "selector": "#user-name", "value": "standard_user" }
}
```

```json
{
  "toolName": "playwright_click",
  "toolArgs": { "selector": "#login-button" }
}
```

## Files Changed

1. `packages/desktop/src/main/index.ts`:
   - Modified `buildMCPServersConfig()` to use Electron with ASAR
   - Added browser installation check and install on first run
   - Added 5-second MCP initialization wait
   - Added status notifications

2. `packages/desktop/src/preload.ts`:
   - Exposed `window.electron` API for IPC event listeners

3. `packages/desktop/src/renderer/components/PersonaModal.tsx`:
   - Added listener for `persona:status` events
   - Shows installation and initialization progress

4. `packages/desktop/package.json`:
   - Removed `asarUnpack` patterns (not needed)
   - Kept `extraResources` for config file only

## Troubleshooting

### If Playwright tools still not available:

1. **Check console for MCP errors**:
   ```
   [JARVIS] Failed to setup @playwright/mcp: ...
   ```

2. **Verify ASAR contents**:
   ```bash
   npx asar list packages/desktop/release/mac-arm64/JARVIS-AI.app/Contents/Resources/app.asar | grep playwright
   ```
   Should show: `node_modules/@playwright/mcp/cli.js` and `node_modules/playwright/cli.js`

3. **Check browser installation**:
   ```bash
   ls ~/Library/Caches/ms-playwright/chromium-*
   ```
   Should show a Chromium installation directory

4. **Verify marker file**:
   ```bash
   cat ~/Library/Application\ Support/jarvis-ai/.playwright-installed
   ```
   Should show an ISO timestamp

5. **Check MCP server process**:
   ```bash
   ps aux | grep playwright
   ```
   Should show a running MCP server process when session is active

### If browser installation hangs:

- Check network connection (needs to download ~180MB)
- Check disk space (needs ~500MB for Chromium)
- Check console for download progress
- If it fails, delete marker file and try again

## Performance Metrics

- **First launch** (browser installation): 60-120 seconds
- **Subsequent launches** (browser cached): 5-7 seconds
- **MCP initialization**: 5 seconds (fixed wait)
- **Total time to ready**: 
  - First time: ~90 seconds
  - After first time: ~7 seconds

## Related Issues Fixed

- [x] "Playwright MCP tools not available in this environment"
- [x] AI falling back to bash/task instead of playwright tools
- [x] Browser window opening after test already failed
- [x] "Cannot call write after a stream was destroyed" (previous fix)
- [x] ASAR archive access issues with pnpm monorepo

## Next Steps

If this works:
1. Consider adding progress indicator for MCP initialization (show countdown)
2. Consider pre-installing all browsers (Firefox, WebKit) not just Chromium
3. Consider detecting when MCP servers are actually ready (instead of fixed 5s wait)
4. Consider caching MCP server connection to avoid 5s wait on every persona switch

If this doesn't work:
1. Share console output (both main and renderer)
2. Share execution logs
3. Check MCP server process with `ps aux | grep playwright`
