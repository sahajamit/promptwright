# Recording Playback Fix - Summary

## Problem

The execution recording playback was not working in development mode (`pnpm dev:desktop`) due to:

1. **Outdated preload.js**: The compiled `preload.js` had an old API (`getRecordingUrl`) while the TypeScript source had the new API (`getRecordingData`)
2. **Security restrictions**: Dev mode loads from `http://localhost:5173`, which blocks loading `file://` URLs due to cross-origin policies

## Solution Implemented

### 1. Rebuilt Preload Script ✅

Recompiled the preload TypeScript to sync the JavaScript with the correct API:
- Updated method: `getRecordingData(filePath)` returns `{ type: "url" | "html", data: string }`
- Command used: `pnpm --filter @jarvis-ai/desktop build:preload`

### 2. Environment-Specific Handling ✅

The IPC handler now properly detects the environment and returns the appropriate format:

**Packaged Mode** (`app.isPackaged = true`):
- Returns: `{ type: "url", data: "file:///path/to/recording.html" }`
- Uses `iframe src` with `file://` URL
- Works because the app is served from the local filesystem

**Dev Mode** (`app.isPackaged = false`):
- Returns: `{ type: "html", data: "<html>...</html>" }`
- Uses `iframe srcDoc` with HTML content
- Bypasses the `file://` URL restriction

### 3. Added Debug Logging ✅

Enhanced logging to trace the flow:

**Main Process** (`packages/desktop/src/main/index.ts`):
```typescript
console.log(`[ExecutionRecording] Getting recording data for: ${filePath}`);
console.log(`[ExecutionRecording] app.isPackaged: ${app.isPackaged}`);
console.log(`[ExecutionRecording] ${app.isPackaged ? 'Packaged' : 'Dev'} mode: returning...`);
```

**Renderer Process** (`LiveExecutionLog.tsx`):
```typescript
console.log('[LiveExecutionLog] Fetching recording data for:', recordingPath);
console.log('[LiveExecutionLog] Received recording data:', { type, dataLength });
```

## Testing Instructions

### Test in Dev Mode

1. Start the dev server:
   ```bash
   cd packages/desktop
   pnpm dev
   ```

2. In the app:
   - Select "Manual Test Execution" persona
   - Run a test (e.g., "Navigate to https://example.com and verify the page loads")
   - Wait for test completion
   - The "Execution Recording" section should appear and play successfully

3. Check console logs for:
   - `app.isPackaged: false`
   - `Dev mode: returning HTML content`
   - `type: "html"` in the renderer

### Test in Packaged Mode

1. Package the app:
   ```bash
   pnpm --filter @jarvis-ai/desktop package -- --mac
   ```

2. Open the packaged app:
   ```bash
   open packages/desktop/release/mac-arm64/JARVIS-AI.app
   ```

3. Run the same test as above

4. Check Console.app logs for:
   - `app.isPackaged: true`
   - `Packaged mode: returning file:// URL`

## Files Modified

1. **`packages/desktop/src/main/index.ts`**
   - Added debug logging in `execution:get-recording-data` IPC handler (lines 995-1012)

2. **`packages/desktop/src/renderer/components/LiveExecutionLog.tsx`**
   - Added debug logging in `useEffect` for recording data (lines 76-88)

3. **`packages/desktop/dist/preload.js`**
   - Rebuilt from TypeScript source to include `getRecordingData` method

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Renderer Process                   │
│  (LiveExecutionLog.tsx)                             │
│                                                      │
│  1. Detects recordingPath changed                   │
│  2. Calls window.jarvis.execution.getRecordingData() │
│  3. Receives { type, data }                         │
│  4. Renders iframe with src or srcDoc               │
└─────────────────────────────────────────────────────┘
                         ↓ IPC
┌─────────────────────────────────────────────────────┐
│                    Main Process                      │
│  (index.ts IPC Handler)                             │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ if (app.isPackaged) {                       │   │
│  │   return { type: "url",                     │   │
│  │            data: "file://..." }             │   │
│  │ } else {                                    │   │
│  │   return { type: "html",                    │   │
│  │            data: "<html>...</html>" }       │   │
│  │ }                                           │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Verification

Both dev mode and packaged mode apps are now:
- ✅ Building successfully
- ✅ Running without errors
- ✅ Ready for recording playback testing

The recording HTML files are saved to:
- **Dev Mode**: `~/Library/Application Support/jarvis-ai/recordings/`
- **Packaged Mode**: Same location

## Next Steps

1. Test the recording playback in both modes
2. If issues persist, consider the alternative approach of always using `srcDoc` with HTML content (simpler and more robust)

## Debug Tips

If recording doesn't play:
1. Check browser console for errors
2. Verify the recording file exists at the path shown
3. Check that `getRecordingData` is being called
4. Verify the IPC handler is returning the correct type for the environment
