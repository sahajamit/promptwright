# Automating System Browser Connection

## Goal Check
The goal is to allow the "Manual Test Execution" persona to use the user's **Main Chrome Profile** (with logins, cookies, etc.) for testing.
Instead of asking the user to manually launch Chrome with flags, the app will:
1.  Detect if `useSystemProfile` is enabled.
2.  Warn the user that their browser will be closed (killing existing session).
3.  Upon confirmation, programmatically relaunch Chrome with the user's Default Profile and remote debugging enabled.

## User Review Required
> [!WARNING]
> **Data Loss Risk**: This feature kills all running Google Chrome instances to unlock the user profile. Users will lose unsaved work in their browser.
> The application will display a confirmation dialog before proceeding.

## Proposed Changes

### Configuration Updates

#### [MODIFY] packages/core/src/config/types.ts
- Add `useSystemProfile` boolean to `BrowserConfig`.
- Default to `false`.

```typescript
export interface BrowserConfig {
    headless: boolean;
    /**
     * If true, uses the system's default Chrome profile (allowing access to
     * existing logins/cookies) instead of a temporary isolated profile.
     * 
     * WARNING: This requires killing any existing Chrome instances.
     * @default false
     */
    useSystemProfile?: boolean;
}
```

### Core Logic Updates

#### [MODIFY] packages/core/src/cdp/chrome-launcher.ts
- Add a helper to determine the default User Data Directory based on OS.
- Update `launch` method to accept `useSystemProfile` option.
- If `useSystemProfile` is true:
    - Resolve the real `userDataDir` (Mac: `~/Library/Application Support/Google/Chrome`, etc.).
    - Pass this to the underlying `chrome-launcher`.

```typescript
// Helper to get default profile path
function getDefaultUserDataDir(): string {
  const platform = process.platform;
  const homedir = require('os').homedir();
  
  if (platform === 'darwin') {
    return `${homedir}/Library/Application Support/Google/Chrome`;
  } else if (platform === 'win32') {
    return `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
  } else {
    return `${homedir}/.config/google-chrome`;
  }
}
```

### Desktop Main Process Updates

#### [MODIFY] packages/desktop/src/main/index.ts
1.  **Execution Start (`execution:start-recording`)**:
    - Check `config.browser.useSystemProfile`.
    - If `true`:
        - **SHOW DIALOG**: "This will verify your main Chrome browser to run the test. CAUTION: This will CLOSE all open Chrome windows and you may lose unsaved work. Do you want to continue?"
        - If User cancels -> Throw error / Stop.
        - If User proceeds:
            - Force kill existing chrome (`killExistingOnPort` might need to be broader, maybe `pkill Chrome`? `chrome-launcher` handles port killing, but we might need to be sure the lockfile is released).
            - Launch with `useSystemProfile: true` (which sets the `userDataDir` to the real one).
            
    - **Important**: When `useSystemProfile` is true, we MUST NOT delete the user data directory on exit. `chrome-launcher` generally doesn't delete provided `userDataDir`, only temp ones, but verify this.

## Verification Plan

### Manual Verification
1.  **Configuration**:
    - Enable `browser.useSystemProfile: true` and `browser.headless: false` in settings (or yaml).
2.  **Pre-condition**:
    - Open Chrome (normal system chrome).
    - Log in to a site (e.g. GitHub).
    - Open a few tabs.
3.  **Execution**:
    - Start a Manual Test in Jarvis.
    - **Verify Dialog**: Check that the warning dialog appears.
    - **Action**: Click "Cancel".
    - **Verify**: Test aborts, Chrome stays open.
    - **Action**: Start Test again, Click "Continue".
    - **Verify**:
        - Old Chrome window closes.
        - New Chrome window opens (maybe with "Remote debugging" banner).
        - **Verify**: The new window has your extensions and is logged in to GitHub (User Profile is active).
    - **Action**: Run test steps (e.g. "Go to GitHub").
    - **Verify**: Automation works in this window.
4.  **Cleanup**:
    - End test.
    - **Verify**: Chrome might close or stay open depending on logic. Ideally it stays open or closes gracefully.
    - **Verify**: Re-opening Chrome normally still has your profile intact (no corruption).
