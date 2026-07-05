# Windows MCP Debugging Guide

## For Windows Testers

### Quick Check: Is MCP Working?

1. Launch JARVIS-AI
2. Select "Manual Test Execution" persona
3. Run any test (e.g., login to saucedemo.com)
4. Check execution logs:
   - ✓ **WORKING**: Tool names like `playwright_navigate`, `playwright_click`, `playwright_fill`
   - ✗ **NOT WORKING**: Tool names like `bash`, `task`

If you see `bash` tools, Playwright MCP is not connected. Follow debugging steps below.

---

## Debugging Steps

### Step 1: Open Developer Tools

1. In JARVIS-AI, press `Ctrl+Shift+I` or go to `View → Toggle Developer Tools`
2. Click the `Console` tab

### Step 2: Run Diagnostic Script

1. Copy the diagnostic script from `packages/desktop/scripts/diagnose-windows-mcp.js`
2. Paste into Console and press Enter
3. Follow the on-screen instructions

### Step 3: Capture Logs

1. Look for `[JARVIS MCP]` messages in Console
2. Critical errors will have `✗✗✗` markers
3. Right-click in Console → Save as → `jarvis-windows-logs.txt`

### Step 4: Run a Test and Capture Execution

1. Run a simple test
2. Take screenshot of execution logs
3. Note which tools appear (`playwright_*` = good, `bash` = bad)

### Step 5: Export Everything

Send back:
- `jarvis-windows-logs.txt` (from Console)
- Screenshot of execution panel showing tool names
- Any error dialogs or popups

---

## Common Issues and Solutions

| Symptom | Likely Cause | What to Look For |
|---------|--------------|------------------|
| `bash` tools used | MCP not connected | `Failed to resolve @playwright/mcp path` |
| No tools at all | Session creation failed | `Session created` message missing |
| Chrome doesn't open | CDP not working | `Chrome debug port` errors |

---

## Diagnostic Script Location

The diagnostic script is located at:
```
packages/desktop/scripts/diagnose-windows-mcp.js
```

To run it:
1. Open the file in a text editor
2. Copy all the contents
3. Paste into the Console tab in DevTools
4. Press Enter

---

## What to Look For in Logs

### 🟢 Good Signs (MCP Working)

```
[JARVIS MCP] ✓ Resolved MCP CLI path: C:\...\app.asar\node_modules\@playwright\mcp\cli.js
[JARVIS MCP] File exists check: true
[JARVIS MCP] ✓ MCP config complete for playwright-mcp
[JARVIS SDK] Creating session with config: { mcpServers: { ... } }
[JARVIS SDK] ✓ Session created successfully
```

In execution logs: `playwright_navigate`, `playwright_click`, `playwright_fill`

### 🔴 Bad Signs (MCP NOT Working)

```
[JARVIS MCP] ✗✗✗ CRITICAL ERROR: Failed to resolve @playwright/mcp path
[JARVIS MCP] Error message: Cannot find module '@playwright/mcp/cli.js'
```

OR

```
[JARVIS MCP] ✓ Resolved MCP CLI path: C:\...\app.asar\node_modules\@playwright\mcp\cli.js
[JARVIS MCP] File exists check: false
[JARVIS MCP] ✗ ERROR: MCP CLI file does not exist at resolved path!
```

In execution logs: `bash`, `task` (fallback tools - browser automation not working)

---

## Automatic Diagnostics

This version of JARVIS-AI includes automatic diagnostics:

1. **Platform Detection**: Logs Windows-specific information on startup
2. **MCP Configuration**: Detailed logs of MCP server setup
3. **Session Creation**: Verification that MCP servers are configured
4. **Tool Detection**: Warns in console if Playwright tools are missing
5. **Browser Console**: Displays diagnostic messages automatically on Windows

All these logs will appear in the Console automatically when you run tests.

---

## File Structure to Check

If you can navigate to the installed app folder, check:

```
win-unpacked/
├── JARVIS-AI.exe
├── resources/
│   ├── app.asar          ← Should contain the app
│   └── ...
```

The `app.asar` file should contain `node_modules/@playwright/mcp/cli.js` inside it.

---

## Questions the Logs Will Answer

1. **Can Node.js resolve the MCP package?**
   - Look for: `[JARVIS MCP] ✓ Resolved MCP CLI path:`

2. **Does the file actually exist in the ASAR?**
   - Look for: `[JARVIS MCP] File exists check: true`

3. **Can Electron spawn the MCP process?**
   - Look for: `[JARVIS SDK] ✓ Session created successfully`

4. **Are Playwright tools available to the AI?**
   - Look for: Tool names starting with `playwright_` in execution logs

5. **Is there a Windows-specific error?**
   - Look for: `[JARVIS WINDOWS]` or `[JARVIS MCP]` error messages

---

## Need Help?

If you encounter issues:

1. **Capture Everything**:
   - Main console logs (Electron DevTools Console)
   - Browser console logs (where you pasted the diagnostic script)
   - Screenshot of execution panel
   - Any error popups

2. **Check for Known Issues**:
   - Path separator issues (backslash vs forward slash)
   - ASAR archive reading problems
   - Node.js not installed (required for Playwright)

3. **Send Logs**:
   - Save console as text file
   - Include screenshots
   - Note your Windows version

The detailed logs will help pinpoint exactly where the MCP connection is failing on Windows.
