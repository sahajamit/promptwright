# Enable Parallel Manual Test Execution

## Goal Description
Enable users to run multiple manual test execution sessions simultaneously (up to 5). Each session will run in its own chat interface, utilizing a dedicated and isolated Chrome browser instance on a unique port. This ensures that actions in one test session do not interfere with another.

## User Review Required
> [!IMPORTANT]
> **Breaking Change**: The IPC interfaces for `jarvis:send-message` and execution recording will be updated to require a `sessionId`. The frontend must be updated to pass this ID.
> **Resource Usage**: Running 5 Chrome instances simultaneously will consume significant system resources (RAM/CPU).

## Proposed Changes

### Backend Architecture (Main Process)

#### 1. Implement `PortPool`
Create a utility to manage TCP ports for Chrome debugging.
*   **Range**: 9222 - 9226 (Max 5 sessions).
*   **Methods**: `acquire()`, `release(port)`.
*   **Logic**: Check if port is free before returning.

#### 2. Create `SessionManager` & `Session` Class
Refactor the global singleton pattern (`jarvisClient`, `chromeLauncher`) into a session-based model.

**New File**: `packages/desktop/src/main/session-manager.ts`
*   **Class `Session`**:
    *   `id`: string (UUID)
    *   `port`: number
    *   `userDataDir`: string (e.g., `<appData>/sessions/<id>`)
    *   `chromeLauncher`: Host instance of `ChromeLauncher`.
    *   `cdpClient`: Host instance of `CDPClient`.
    *   `screencastRecorder`: Host instance of `ScreencastRecorder`.
    *   `jarvisClient`: Host instance of `JarvisClient`.
    *   `active`: boolean.
*   **Class `SessionManager`**:
    *   `sessions`: Map<string, Session>
    *   `createSession(id)`: Allocates port, creates Session object.
    *   `getSession(id)`: Returns session.
    *   `closeSession(id)`: Kills Chrome, releases port, destroys clients.
    *   `closeAll()`: Cleanup on app exit.

#### 3. Refactor `packages/desktop/src/main/index.ts`
*   Replace global variables (`jarvisClient`, `chromeLauncher`, `cdpClient`, `screencastRecorder`) with `sessionManager`.
*   **IPC Handler Updates**:
    *   `jarvis:send-message(prompt, sessionId)`: Delegate to `sessionManager.getSession(sessionId).jarvisClient`.
    *   `execution:start-recording(sessionId)`: Trigger Chrome launch and tool setup for the specific session.
    *   `session:create`: New IPC to initialize a session from Frontend.
    *   `session:close`: New IPC to manually close a tab/session.
*   **App Lifecycle**: Update `window-all-closed` and `before-quit` to call `sessionManager.closeAll()`.

#### 4. Update `ChromeLauncher`
*   Ensure it accepts `userDataDir` and uses it to isolate browser profiles. (Already supported in `packages/core/src/cdp/chrome-launcher.ts`, just need to pass it).

### Frontend Updates (Renderer)

#### 1. Update `useJarvis` Hook
*   Manage `sessionId` in the React context or component state.
*   Generate a UUID when opening a new "Manual Test" chat tab.
*   Pass `sessionId` to all `jarvis.*` API calls.

#### 2. Multi-Tab Support
*   Ensure the UI can handle switching between active sessions.
*   Screencast stream (`execution:screencast-frame`) needs to be aware of `sessionId` so the UI renders the correct stream for the active tab.

## Verification Plan

### Automated Tests
*   **Unit Tests**: Test `PortPool` allocation and limits.
*   **Unit Tests**: Test `SessionManager` creation and cleanup logic.

### Manual Verification
1.  **Single Session**: Start a manual test, verify Chrome launches on 9222. Run a simple test.
2.  **Parallel Session**:
    *   While Session 1 is running, click "New Chat".
    *   Start a new manual test in Session 2.
    *   Verify a NEW Chrome instance launches on 9223.
    *   Verify actions in Session 2 (e.g., Navigate to Google) do not affect Session 1 (e.g., waiting on Amazon).
    *   Verify Screencast in Session 1 shows Session 1's browser, and Session 2 shows Session 2's browser.
3.  **Cleanup**: Close Session 1 tab. Verify Chrome on 9222 closes. Session 2 (9223) remains active.
4.  **Max Limit**: Try to open 6 sessions. Verify graceful failure or queueing (should error if port pool exhausted).
