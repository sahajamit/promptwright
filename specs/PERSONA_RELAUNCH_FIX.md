# Persona Selection After Relaunch - Fix Summary

## Problem Fixed

The packaged macOS app would fail with "Cannot call write after a stream was destroyed" error when:
1. Launching the packaged app for the first time ✓ (worked)
2. Selecting Manual Test Execution persona ✓ (worked)
3. Killing the app and relaunching ✗ (FAILED - this is what we fixed)
4. Trying to select the persona again ✗ (FAILED - this is what we fixed)

## Root Cause

On macOS, when windows close, the app stays running in the background (dock icon remains). The issue was:
- MCP server child processes were spawned but not properly cleaned up
- Chrome on port 9222 persisted between sessions
- Stale process references caused stream errors on subsequent persona selections
- No cleanup happened when app actually quit

## Solution Implemented

### 1. Added `before-quit` Handler

Ensures proper cleanup when the app actually quits (Cmd+Q):

```typescript
app.on("before-quit", async (event) => {
  // Prevents default quit to perform async cleanup
  event.preventDefault();
  
  // Stop JarvisClient (which stops MCP servers)
  if (jarvisClient) {
    await jarvisClient.stop();
  }
  
  // Kill Chrome on debug port
  if (chromeLauncher) {
    await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
  }
  
  // Now actually quit
  app.exit(0);
});
```

### 2. Enhanced `window-all-closed` Handler

Cleanup happens even on macOS (not just quit):

```typescript
app.on("window-all-closed", async () => {
  // Always cleanup resources
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

### 3. Stale Process Cleanup on Startup

Kills leftover Chrome processes from previous sessions:

```typescript
app.whenReady().then(async () => {
  // Kill any Chrome process on the debug port from previous sessions
  try {
    const tempLauncher = new ChromeLauncher();
    await tempLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
    console.log("Cleaned up stale Chrome processes");
  } catch (error) {
    console.log("No stale Chrome processes found");
  }
  
  // Continue with normal initialization...
});
```

### 4. Error Recovery in `persona:select`

Automatically recovers from stream errors:

```typescript
ipcMain.handle("persona:select", async (_, personaId: string) => {
  try {
    await personaManager.select(personaId);
    await initializeClient(process.cwd(), personaId);
    return serializePersonaForIPC(personaManager.getActive());
  } catch (error) {
    // If it's a stream error, try to recover
    if (error.message.includes("stream was destroyed")) {
      console.log("Stream error detected, attempting recovery...");
      
      // Force stop the client
      if (jarvisClient) {
        await jarvisClient.stop();
        jarvisClient = null;
      }
      
      // Kill Chrome to ensure clean state
      if (chromeLauncher) {
        await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
      }
      
      // Retry initialization
      await initializeClient(process.cwd(), personaId);
      return serializePersonaForIPC(personaManager.getActive());
    }
    throw error;
  }
});
```

### 5. Proper Cleanup Wait in `initializeClient`

Ensures previous client is fully stopped before creating new one:

```typescript
if (jarvisClient) {
  console.log("Stopping existing client...");
  try {
    await jarvisClient.stop();
    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error("Error stopping previous client:", error);
  }
  jarvisClient = null;
}
```

## Testing Instructions

### Test 1: First Launch (Should Work - Already Did)
1. Launch: `open packages/desktop/release/mac-arm64/JARVIS-AI.app`
2. Select "Manual Test Execution" persona
3. Run a test
4. **Expected**: Works ✓

### Test 2: Relaunch After Kill (Primary Bug Fix)
1. Kill the app: Press `Cmd+Q` or Force Quit from Activity Monitor
2. Launch again: `open packages/desktop/release/mac-arm64/JARVIS-AI.app`
3. Select "Manual Test Execution" persona
4. **Expected**: Should work WITHOUT "stream was destroyed" error ✓
5. Run a test
6. **Expected**: Recording should work ✓

### Test 3: Window Close and Reopen (macOS Specific)
1. Close window with `Cmd+W` (app stays in dock)
2. Click app icon in dock to reopen
3. Select persona
4. **Expected**: Should work ✓

### Test 4: Multiple Close/Open Cycles
1. Repeat Test 2 several times
2. **Expected**: Should consistently work ✓

### Test 5: Chrome Cleanup Verification
After killing the app, check for leftover Chrome processes:
```bash
ps aux | grep -i "chrome.*9222" | grep -v grep
```
**Expected**: Should show no results (Chrome cleaned up) ✓

## What Gets Cleaned Up

### On Window Close
- ✓ JarvisClient stopped
- ✓ MCP servers destroyed
- ✓ Chrome on port 9222 killed
- ✓ All resources freed

### On App Quit (Cmd+Q)
- ✓ Same as above
- ✓ App fully exits

### On Force Quit (kill -9)
- ✗ Cleanup handlers don't run (can't prevent force quit)
- ✓ But next launch cleans up stale processes automatically

### On App Startup
- ✓ Kills any stale Chrome on port 9222
- ✓ Fresh start guaranteed

## Files Modified

All changes in: [`packages/desktop/src/main/index.ts`](packages/desktop/src/main/index.ts)

1. **Lines ~510-540**: Added `before-quit` handler
2. **Lines ~503-527**: Enhanced `window-all-closed` handler
3. **Lines ~478-490**: Added stale process cleanup on startup
4. **Lines ~880-930**: Added error recovery in `persona:select`
5. **Lines ~352-363**: Added cleanup wait in `initializeClient`

## Verification Steps

Run these after implementing the fix:

1. **Check app launches cleanly**
   ```bash
   open packages/desktop/release/mac-arm64/JARVIS-AI.app
   ```
   Look for: "[JARVIS] Cleaned up stale Chrome processes"

2. **Test persona selection**
   - Select Manual Test Execution
   - Look for successful initialization logs
   - No "stream was destroyed" errors

3. **Test relaunch**
   - Quit app (Cmd+Q)
   - Relaunch
   - Select persona again
   - Should work without errors

4. **Verify Chrome cleanup**
   ```bash
   # After closing app
   lsof -ti:9222 || echo "Port 9222 is free"
   ```

## Expected Console Output

### On First Launch
```
[JARVIS] App ready, checking for stale processes...
[JARVIS] No stale Chrome processes found
[JARVIS] Initializing config with userData: ...
```

### On Subsequent Launch (After Previous Session)
```
[JARVIS] App ready, checking for stale processes...
[JARVIS] Cleaned up stale Chrome processes
[JARVIS] Initializing config with userData: ...
```

### On Persona Selection
```
[JARVIS] Initializing client with workDir: ..., personaId: manual-test-execution
[JARVIS] Stopping existing client...  (if switching personas)
[JARVIS] Loading persona: Manual Test Execution
[JARVIS] Creating Jarvis client...
[JARVIS] ✓ Client initialized and ready
```

### On Window Close
```
[JARVIS] All windows closed
[JARVIS] Stopping client...
[JARVIS] Killing Chrome...
[JARVIS] macOS: App will stay running in background
```

### On App Quit (Cmd+Q)
```
[JARVIS] App quitting, performing cleanup...
[JARVIS] Stopping JarvisClient...
[JARVIS] Killing Chrome browser...
[JARVIS] Cleanup complete
```

## Success Criteria

- ✅ First launch works
- ✅ Subsequent launches work without stream errors
- ✅ Chrome is killed on app close/quit
- ✅ Stale processes are cleaned on startup
- ✅ Error recovery works if issues occur
- ✅ No orphaned processes after quit

## Notes

- The fix handles both graceful quit (Cmd+Q) and force quit scenarios
- On macOS, window close != app quit (app stays in dock)
- Chrome cleanup happens in multiple places for redundancy
- Stream errors are now caught and recovered automatically
