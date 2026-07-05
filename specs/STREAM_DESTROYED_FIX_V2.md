# Stream Destroyed Error Fix - February 2026

## Problem

After packaging the app, selecting the "Manual Test Execution" persona resulted in this error:

```
Failed to check/select persona: Error: Error invoking remote method 'persona:select': 
Error: Cannot call write after a stream was destroyed
```

## Root Cause

The fixes that were previously implemented (documented in `PERSONA_RELAUNCH_FIX.md` and `ASAR_FIX.md`) had been **removed from the codebase**. The code was missing:

1. **Cleanup wait after stopping client** - When stopping an existing `jarvisClient`, the code didn't wait for streams to flush and child processes to exit
2. **Error recovery in persona:select** - No try/catch to handle stream errors and retry
3. **before-quit handler** - No cleanup when app quits via Cmd+Q
4. **Enhanced window-all-closed handler** - Basic cleanup but no Chrome port cleanup
5. **Stale process cleanup on startup** - No cleanup of leftover Chrome from force quit scenarios

These missing pieces caused MCP server child processes to remain in a bad state, leading to stream errors when trying to initialize a new session.

## Solution Implemented

### 1. Added Cleanup Wait in `initializeClient` (Line ~470-483)

```typescript
// Stop existing client if any
if (jarvisClient) {
  console.log("[JARVIS] Stopping existing client...");
  try {
    await jarvisClient.stop();
    // Wait for cleanup to complete (streams to flush, child processes to exit)
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error("[JARVIS] Error stopping previous client:", error);
  }
  jarvisClient = null;
}
```

**Why it works**: Gives MCP server processes time to cleanly shut down before creating a new client.

### 2. Added Error Recovery in `persona:select` Handler (Line ~1172-1234)

```typescript
ipcMain.handle("persona:select", async (_, personaId: string) => {
  try {
    // Normal flow
    await personaManager.select(personaId);
    await initializeClient(process.cwd(), personaId);
    return serializePersonaForIPC(personaManager.getActive());
  } catch (error) {
    // If it's a stream error, try to recover
    if (errorMsg.includes("stream was destroyed") || errorMsg.includes("Cannot call write")) {
      // Force stop client
      // Kill Chrome
      // Wait for cleanup
      // Retry initialization
      return serializePersonaForIPC(personaManager.getActive());
    }
    throw error;
  }
});
```

**Why it works**: Automatically recovers from stream errors by forcing cleanup and retrying.

### 3. Added Stale Process Cleanup on Startup (Line ~625-638)

```typescript
app.whenReady().then(async () => {
  // Kill any Chrome process on the debug port from previous sessions
  console.log("[JARVIS] Checking for stale Chrome processes on port", CHROME_DEBUG_PORT);
  try {
    const tempLauncher = new ChromeLauncher();
    await tempLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
    console.log("[JARVIS] ✓ Cleaned up stale Chrome processes");
  } catch (error) {
    console.log("[JARVIS] No stale Chrome processes found");
  }
  // ... rest of initialization
});
```

**Why it works**: Ensures clean state on app launch, even after force quit.

### 4. Enhanced `window-all-closed` Handler (Line ~651-680)

```typescript
app.on("window-all-closed", async () => {
  console.log("[JARVIS] All windows closed, cleaning up resources...");
  
  // Stop JarvisClient
  if (jarvisClient) {
    await jarvisClient.stop();
    jarvisClient = null;
  }
  
  // Kill Chrome to free the debug port
  if (chromeLauncher) {
    await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
  }
  
  // On macOS, app stays running; on other platforms, quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

**Why it works**: Ensures all resources are cleaned up when windows close, including Chrome on debug port.

### 5. Added `before-quit` Handler (Line ~682-710)

```typescript
app.on("before-quit", async (event) => {
  // Prevent default quit to perform async cleanup
  event.preventDefault();
  
  // Stop JarvisClient
  if (jarvisClient) {
    await jarvisClient.stop();
    jarvisClient = null;
  }
  
  // Kill Chrome
  if (chromeLauncher) {
    await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
  }
  
  // Now actually quit
  app.exit(0);
});
```

**Why it works**: Ensures proper cleanup when app quits via Cmd+Q or dock menu.

## Files Modified

1. **`packages/desktop/src/main/index.ts`**
   - Line ~470-483: Added cleanup wait in `initializeClient`
   - Line ~625-638: Added stale process cleanup on startup
   - Line ~651-680: Enhanced `window-all-closed` handler
   - Line ~682-710: Added `before-quit` handler
   - Line ~1172-1234: Added error recovery in `persona:select` handler

## Testing Instructions

### Test 1: First Launch
```bash
./packages/desktop/scripts/cleanup-jarvis.sh
open packages/desktop/release/mac-arm64/JARVIS-AI.app
```
1. Select "Manual Test Execution" persona
2. **Expected**: Works ✓

### Test 2: Relaunch After Quit
1. Quit app (Cmd+Q)
2. Relaunch: `open packages/desktop/release/mac-arm64/JARVIS-AI.app`
3. Select "Manual Test Execution" persona
4. **Expected**: Works without "stream was destroyed" error ✓

### Test 3: Multiple Relaunches
Repeat Test 2 several times to verify consistency.

### Test 4: Window Close and Reopen (macOS)
1. Close window (Cmd+W) - app stays in dock
2. Click dock icon to reopen
3. Select persona
4. **Expected**: Works ✓

### Test 5: Verify Chrome Cleanup
After quitting the app:
```bash
lsof -ti:9222 || echo "Port 9222 is free"
```
**Expected**: Port 9222 should be free ✓

## Expected Console Output

### On First Launch
```
[JARVIS] Checking for stale Chrome processes on port 9222
[JARVIS] No stale Chrome processes found
[JARVIS] Initializing config with userData: ...
```

### On Subsequent Launch (After Previous Session)
```
[JARVIS] Checking for stale Chrome processes on port 9222
[JARVIS] ✓ Cleaned up stale Chrome processes
[JARVIS] Initializing config with userData: ...
```

### On Persona Selection Success
```
[JARVIS] Initializing client with workDir: ..., personaId: manual-test-execution
[JARVIS] Loading persona: Manual Test Execution
[JARVIS] Creating Jarvis client...
[JARVIS SDK] ✓ Session created successfully
[JARVIS] ✓ Client initialized and ready
```

### On Persona Selection with Recovery
```
[JARVIS] Stream error detected, attempting recovery...
[JARVIS] Force stopping client...
[JARVIS] Killing Chrome to ensure clean state...
[JARVIS] Retrying persona selection...
[JARVIS] ✓ Client initialized and ready
```

### On Window Close
```
[JARVIS] All windows closed, cleaning up resources...
[JARVIS] Stopping JarvisClient...
[JARVIS] Killing Chrome browser on port 9222
[JARVIS] macOS: App will stay running in background (dock)
```

### On App Quit (Cmd+Q)
```
[JARVIS] App quitting, performing cleanup...
[JARVIS] Stopping JarvisClient...
[JARVIS] Killing Chrome browser...
[JARVIS] Cleanup complete, exiting...
```

## Success Criteria

- ✅ First launch works
- ✅ Subsequent launches work without stream errors
- ✅ Chrome is killed on app close/quit
- ✅ Stale processes are cleaned on startup
- ✅ Error recovery works automatically if issues occur
- ✅ No orphaned processes after quit

## Why This Fix Was Needed Again

The original fixes from `PERSONA_RELAUNCH_FIX.md` (implemented previously) had been removed from the codebase, possibly during:
- Code refactoring
- Merging changes from different branches
- Reverting commits accidentally

This fix **re-implements** the proven solutions from the previous fix, ensuring robust process lifecycle management and error recovery.

## Prevention

To prevent this from happening again:
1. Add comments in the code explaining WHY each handler exists
2. Include references to this spec in the code
3. Add integration tests for persona selection after relaunch
4. Document critical lifecycle handlers in the main README

## Related Documentation

- `PERSONA_RELAUNCH_FIX.md` - Original fix (same solution)
- `ASAR_FIX.md` - ASAR handling fix for MCP servers
- `DISTRIBUTION_SUMMARY.md` - Overall packaging and distribution guide
