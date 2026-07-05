# Async Copilot Session Management - Performance Plan

## Context

Every UI action that involves a Copilot session (app startup, "New Test", session switch) blocks the UI for 3-10+ seconds because the renderer `await`s `jarvis:initialize` which synchronously runs `initializeClient()` (spawns Copilot CLI subprocess, JSON-RPC handshake, MCP tool manifest registration). The fix: decouple UI updates from Copilot session lifecycle using a fire-and-forget pattern with push-event notifications.

## Core Concept

Introduce a **Copilot readiness state** (`"idle" | "initializing" | "ready" | "error"`) that is:
- Tracked in main process and pushed to renderer via new IPC events
- Consumed by a new React state in `useSession` hook
- Used to disable "Run Test" button with a clear visual indicator while session initializes
- UI updates (new session, switch session) happen **immediately** before Copilot is ready
- Connection events (`connecting → connected`) continue to fire naturally for the header status dot

## Files to Modify

### 1. `packages/desktop/src/main/index.ts` — Main Process

**A. New push events** (main → renderer via `webContents.send`):
- `jarvis:session-ready` — payload: `{ uiSessionId: string, copilotSessionId: string | null }`
- `jarvis:session-error` — payload: `{ uiSessionId: string, error: string }`

**B. Change `jarvis:initialize` handler** (line 1897) to fire-and-forget:
```typescript
ipcMain.handle("jarvis:initialize", async (_, workDir, personaId?, copilotSessionId?, uiSessionId?) => {
  assertPrerequisitesPassed();
  const myVersion = ++clientInitVersion;

  // Fire and forget — don't await
  initializeClient(workDir, personaId, copilotSessionId)
    .then(() => {
      if (myVersion === clientInitVersion && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("jarvis:session-ready", {
          uiSessionId,
          copilotSessionId: jarvisClient?.getCopilotSessionId() || null,
        });
      }
    })
    .catch((error) => {
      if (myVersion === clientInitVersion && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("jarvis:session-error", {
          uiSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

  return null; // Return immediately
});
```

Note: The `clientInitVersion` check ensures stale inits from rapid switching don't send events. The existing `isInitializing` mutex inside `initializeClient()` still prevents concurrent inits.

**C. Change `persona:select` handler** (line 2271) — remove `initializeClient()`:
- Keep: `isAppFullyReady` wait, `cleanupRuntimeResources()` on persona switch, `personaManager.select()`, `saveConfig()`
- Remove: `await initializeClient(workDir, personaId)` and the 500ms MCP stabilization delay
- The renderer's `createNewSession()` will call `jarvis:initialize` separately
- This reduces `persona:select` from ~5-10s to ~0.5-1.5s (only cleanup on switch, near-zero on first select)

**D. Add `jarvis:get-readiness` handler** (new):
```typescript
ipcMain.handle("jarvis:get-readiness", () => {
  if (jarvisClient?.getState() === "connected") return "ready";
  if (isInitializing) return "initializing";
  return "idle";
});
```

**E. Add wait-for-client in `jarvis:send-message`** (line 1830):
Before the existing `if (!jarvisClient)` throw, add a poll loop:
```typescript
if (!jarvisClient && isInitializing) {
  const maxWait = 30000;
  const start = Date.now();
  while (!jarvisClient && isInitializing && Date.now() - start < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
```
This is a safety net — normally the UI prevents submission before ready (Run Test button is disabled).

### 2. `packages/desktop/src/preload.ts`

**A. Update `initialize` signature** (line 60):
```typescript
initialize: (workDir: string, personaId?: string, copilotSessionId?: string, uiSessionId?: string): Promise<null> =>
  ipcRenderer.invoke("jarvis:initialize", workDir, personaId, copilotSessionId, uiSessionId),
```

**B. Add new subscription methods** (after `onUsageUpdate`, ~line 254):
```typescript
onSessionReady: (callback: (data: { uiSessionId: string; copilotSessionId: string | null }) => void): (() => void) => {
  const handler = (_: Electron.IpcRendererEvent, data: any) => callback(data);
  ipcRenderer.on("jarvis:session-ready", handler);
  return () => ipcRenderer.removeListener("jarvis:session-ready", handler);
},

onSessionError: (callback: (data: { uiSessionId: string; error: string }) => void): (() => void) => {
  const handler = (_: Electron.IpcRendererEvent, data: any) => callback(data);
  ipcRenderer.on("jarvis:session-error", handler);
  return () => ipcRenderer.removeListener("jarvis:session-error", handler);
},

getReadiness: (): Promise<"ready" | "initializing" | "idle"> =>
  ipcRenderer.invoke("jarvis:get-readiness"),
```

**C. Update TypeScript `declare global`** block to include new methods.

### 3. `packages/desktop/src/renderer/hooks/useSession.ts`

**A. Add new state**:
```typescript
type CopilotReadiness = "idle" | "initializing" | "ready" | "error";

const [copilotReadiness, setCopilotReadiness] = useState<CopilotReadiness>("idle");
const [copilotError, setCopilotError] = useState<string | null>(null);
const currentSessionIdRef = useRef<string | null>(null);
```

**B. Subscribe to push events** (new `useEffect`):
```typescript
useEffect(() => {
  const unsubReady = window.jarvis.onSessionReady(({ uiSessionId, copilotSessionId }) => {
    if (uiSessionId !== currentSessionIdRef.current) return; // ignore stale
    setCopilotReadiness("ready");
    setCopilotError(null);
    // Persist copilotSessionId to storage
    if (copilotSessionId) {
      setCurrentSession(prev => prev ? { ...prev, copilotSessionId } : prev);
      SessionStorage.loadSession(uiSessionId).then(s => {
        if (s) { s.copilotSessionId = copilotSessionId; SessionStorage.saveSession(s); }
      });
    }
  });
  const unsubError = window.jarvis.onSessionError(({ uiSessionId, error }) => {
    if (uiSessionId !== currentSessionIdRef.current) return;
    setCopilotReadiness("error");
    setCopilotError(error);
  });
  return () => { unsubReady(); unsubError(); };
}, []);
```

**C. Rewrite `createNewSession()`** (line 169) — non-blocking:
- Move `setCurrentSession(newSession)` + storage save **before** `initialize()` call
- Call `window.jarvis.initialize(workDir, personaId, undefined, newSession.id)` **without await**
- Set `copilotReadiness = "initializing"` immediately
- `setIsCreatingSession(false)` returns fast (just disk I/O time)

**D. Rewrite `switchSession()`** (line 203) — non-blocking:
- Load session from disk → `setCurrentSession(session)` immediately (shows messages)
- Call `window.jarvis.initialize(...)` **without await** (passes `session.id` as `uiSessionId`)
- Set `copilotReadiness = "initializing"`
- Clear `isSwitchingSession` and `switchingToSessionId` immediately after UI update

**E. Rewrite `loadAllSessions` initial session** (line 44) — non-blocking:
- Same pattern: set session immediately, fire initialize without await

**F. Add to return value**: `copilotReadiness`, `copilotError`

### 4. `packages/desktop/src/renderer/App.tsx`

**A. Startup flow** (line 87):
- `persona:select` now returns fast (no `initializeClient()`)
- `setIsReady(true)` happens almost immediately after persona metadata is set
- `LoadingScreen` disappears in ~300-500ms instead of ~6-11s

**B. Simplify `handlePersonaSelect`** (line 412):
- Remove `copilot.getSessionId()` call and `skipInitialize` pattern
- Just call `createNewSession(personaId)` — it fires async init internally
```typescript
const handlePersonaSelect = async (personaId: string) => {
  try {
    isPersonaSelectionInFlightRef.current = true;
    hasAttemptedCreate.current = true;
    const persona = await window.jarvis.persona.select(personaId);
    setCurrentPersona(persona);
    setShowPersonaModal(false);
    await createNewSession(personaId); // now returns fast
    clearMessages();
    setLogs([]);
  } catch (error) { ... }
  finally { isPersonaSelectionInFlightRef.current = false; }
};
```

**C. Thread new state to ChatInterface**:
```tsx
<ChatInterface
  ...
  copilotReadiness={copilotReadiness}
  copilotError={copilotError}
/>
```

**D. Destructure new values from `useSession()`**:
```typescript
const { ..., copilotReadiness, copilotError } = useSession();
```

### 5. `packages/desktop/src/renderer/components/ChatInterface.tsx`

- Accept and forward `copilotReadiness` and `copilotError` props to `ExecutionPanel`

### 6. `packages/desktop/src/renderer/components/ExecutionPanel.tsx`

**A. Add `copilotReadiness` and `copilotError` props** to both `ExecutionPanel` and `IdleState`

**B. Add readiness banner** in `IdleState` (above the textarea):
```tsx
{copilotReadiness === "initializing" && (
  <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
    <Loader2 size={14} className="animate-spin" />
    <span>Connecting to Copilot... You can type your test while it loads.</span>
  </div>
)}
{copilotReadiness === "error" && (
  <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
    <AlertCircle size={14} />
    <span>Failed to connect: {copilotError}</span>
    <button onClick={onRetryConnection} className="ml-auto underline text-xs">Retry</button>
  </div>
)}
```

**C. Disable "Run Test" button** (line 666) while initializing:
```tsx
disabled={!hasInput || isClassifying || copilotReadiness === "initializing"}
```
Show "Connecting..." text when `copilotReadiness === "initializing"`.

**D. Retry handler**: `onRetryConnection` prop from App.tsx that re-fires `window.jarvis.initialize()`.

## Race Condition Protection

The existing protections handle rapid switching correctly:
1. **`clientInitVersion`** (main process): Each `jarvis:initialize` increments the counter. Stale inits bail via `myVersion !== clientInitVersion` and never send push events.
2. **`currentSessionIdRef`** (renderer): Push events for non-current sessions are silently ignored.
3. **`isInitializing` mutex** (main process): Prevents concurrent `initializeClient()` calls.

## Expected Performance Improvement

| Scenario | Before | After |
|---|---|---|
| App startup to interactive UI | ~6-11s | ~0.5-1s |
| "New Test" to empty chat visible | ~3-10s | ~100-200ms |
| Session switch to messages visible | ~3-10s | ~50-100ms (disk read) |
| Time until "Run Test" enabled | Same as above | Same as before (background init) |

## Implementation Order

1. Add new IPC events to preload + main process (additive, no behavior change)
2. Add `copilotReadiness` state to `useSession` + subscribe to events
3. Thread `copilotReadiness` through App → ChatInterface → ExecutionPanel, add banner + button disable
4. Change `jarvis:initialize` to fire-and-forget with push events
5. Change `persona:select` to remove `initializeClient()` call
6. Rewrite `createNewSession` and `switchSession` to be non-blocking
7. Add wait-for-client safety net in `jarvis:send-message`
8. Add retry button in error banner

## Verification

1. `pnpm build && pnpm dev:desktop` — manually test:
   - App startup speed (should show UI in <1s)
   - "New Test" responsiveness (empty chat appears instantly)
   - Session switch responsiveness (messages load instantly)
   - "Connecting to Copilot..." banner appears and disappears
   - "Run Test" is disabled during init, enabled after ready
   - Typing in textarea while session initializes works
   - Rapid session switching doesn't cause errors
2. `pnpm build && pnpm test:e2e:smoke` — smoke tests may need a `waitForCopilotReady()` helper since "Run Test" is now initially disabled
