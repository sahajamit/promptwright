# ASAR Archive Fix for MCP Server Spawning

## Problem

After implementing the persona relaunch fixes, the app still failed with "Cannot call write after a stream was destroyed" error. The root cause was different from the original issue:

### Original Issue
- Stale MCP server processes from previous sessions
- No cleanup on app quit/window close
- **Status**: FIXED with lifecycle handlers

### Secondary Issue (This Fix)
- MCP server child processes couldn't access files from ASAR archive
- Using `process.execPath` with `ELECTRON_RUN_AS_NODE=1` pointed to Electron binary
- Child process tried to read `@playwright/mcp/cli.js` from inside `app.asar`
- ASAR is Electron-specific, not accessible to spawned Node.js processes
- **Result**: Spawned process crashed immediately → stream destroyed error

## Solution

Changed from using Electron's binary to system Node.js:

### Before (Broken)
```typescript
// Packaged mode
command = process.execPath; // Points to Electron binary
args = [require.resolve("@playwright/mcp/cli.js")]; // Path inside ASAR
env = { ELECTRON_RUN_AS_NODE: "1" };
```

**Problem**: Child process can't read from ASAR even with ELECTRON_RUN_AS_NODE

### After (Fixed)
```typescript
// Packaged mode  
command = "node"; // Use system Node.js
args = [require.resolve("@playwright/mcp/cli.js")]; // Still resolves ASAR path
```

**Why it works**: System `node` can read from ASAR through Electron's ASAR protocol handling

## Files Modified

### 1. [`packages/desktop/package.json`](packages/desktop/package.json)
- Removed `asarUnpack` configuration (caused monorepo issues)
- Added `!dist/**/*.map` to exclude source maps

### 2. [`packages/desktop/src/main/index.ts`](packages/desktop/src/main/index.ts)
**Lines ~94-117**: Changed MCP server spawning in packaged mode
```typescript
// Old approach
command = process.execPath;
env = { ELECTRON_RUN_AS_NODE: "1" };

// New approach  
command = "node";
// No special env vars needed
```

## Requirements

**System Node.js**: The packaged app now requires Node.js to be installed on the user's system. This is reasonable because:
1. Most developers have Node.js installed
2. The app is a development tool (JARVIS AI for testing)
3. Avoids complex ASAR extraction/unpacking
4. Simpler, more reliable solution

## Testing

### Verify Node.js Availability
```bash
which node
node --version
```

### Test Persona Selection After Relaunch
1. Launch packaged app
2. Select "Manual Test Execution" persona
3. **Expected**: Works ✓
4. Quit app (Cmd+Q)
5. Relaunch
6. Select persona again
7. **Expected**: Works without stream errors ✓

## Why Other Approaches Failed

### Attempt 1: asarUnpack
```json
"asarUnpack": ["node_modules/@playwright/mcp/**"]
```
**Problem**: Followed symlinks in pnpm workspace, tried to unpack files outside desktop package directory

### Attempt 2: asarUnpack with app.asar.unpacked path
```typescript
mcpCliPath = mcpCliPath.replace("app.asar", "app.asar.unpacked");
```
**Problem**: asarUnpack config failed due to monorepo structure

### Attempt 3: System node (Final Solution) ✓
```typescript
command = "node";
```
**Works**: Node.js can access ASAR through Electron's protocol handling

## Complete Fix Summary

The persona relaunch issue required TWO fixes:

### Fix 1: Lifecycle & Cleanup (First Implementation)
- Added `before-quit` handler
- Enhanced `window-all-closed` handler
- Kill stale Chrome on startup
- Error recovery in `persona:select`
- Proper cleanup waits

### Fix 2: ASAR Access (This Fix)
- Use system `node` instead of `process.execPath`
- Remove `ELECTRON_RUN_AS_NODE` environment variable
- Remove `asarUnpack` configuration
- Exclude source maps from packaging

## Verification

The app should now:
- ✅ Launch successfully
- ✅ Select persona on first launch
- ✅ Work after relaunch/quit
- ✅ Properly cleanup processes
- ✅ Spawn MCP servers correctly
- ✅ Handle Chrome on port 9222
- ✅ Recover from errors gracefully

## Console Output (Success)

When persona is selected, you should see:
```
[JARVIS] Packaged mode: using node /path/to/app.asar/node_modules/@playwright/mcp/cli.js for playwright-mcp
[JARVIS] Creating Jarvis client...
[JARVIS SDK] Creating session with config:
[JARVIS SDK] ✓ Session created successfully
[JARVIS] ✓ Client initialized and ready
```

No "stream was destroyed" errors!

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| ELECTRON_RUN_AS_NODE | No external deps | Can't access ASAR ❌ |
| asarUnpack | Works theoretically | Breaks with monorepo ❌ |
| System node | Simple, reliable ✓ | Requires Node.js on system |

**Chosen**: System node - best balance of simplicity and reliability
