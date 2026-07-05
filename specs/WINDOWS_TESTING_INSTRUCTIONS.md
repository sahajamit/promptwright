# Windows Testing Instructions - Debug Version

**Version:** 1.0.0-debug (with extensive MCP diagnostics)  
**Date:** January 29, 2026  
**Purpose:** Debug why Playwright MCP is not connecting on Windows

---

## Overview

This build includes extensive diagnostic logging to help identify why Playwright MCP tools are not available on Windows. The Mac version works perfectly with the same code, so this is a platform-specific issue.

---

## Package Information

**File:** `JARVIS-AI-1.0.0-win-x64-portable-debug.zip` (195MB)  
**Location:** `packages/desktop/release/`  
**Type:** Portable (no installer - extract and run)

---

## Prerequisites

1. **Windows 10 or 11** (64-bit)
2. **Node.js 18+ or 20+** (Required for Playwright MCP)
   - Download from: https://nodejs.org/
   - Verify: Open PowerShell and run `node --version`

---

## Installation Steps

### 1. Extract the ZIP

1. Right-click `JARVIS-AI-1.0.0-win-x64-portable-debug.zip`
2. Select "Extract All..."
3. Choose destination (e.g., `C:\JARVIS-AI-Debug\`)
4. Extract

### 2. Locate the Executable

Navigate to: `win-unpacked\JARVIS-AI.exe`

### 3. Run the App

Double-click `JARVIS-AI.exe`

**Note:** Windows SmartScreen may warn you. Click "More info" → "Run anyway"

---

## Testing Procedure

### Step 1: Open Developer Tools

**IMPORTANT:** Open DevTools BEFORE selecting a persona!

1. In JARVIS-AI window, press `Ctrl+Shift+I`
2. OR go to `View → Toggle Developer Tools`
3. Click the `Console` tab

You should see platform detection logs immediately:
```
[JARVIS] Platform: win32 (Windows: true, Mac: false, Linux: false)
[JARVIS] Process execPath: C:\path\to\JARVIS-AI.exe
```

### Step 2: Run the Diagnostic Script

1. Copy the contents of `packages/desktop/scripts/diagnose-windows-mcp.js`
2. Paste into the Console tab
3. Press Enter

You'll see a diagnostic report banner. Leave this console open.

### Step 3: Select the Persona

1. In the JARVIS-AI UI, select **"Manual Test Execution"** persona
2. Watch the Console for diagnostic messages

**Expected Logs (look for these):**
```
[JARVIS MCP] Building MCP config for platform: win32, packaged: true
[JARVIS MCP] Configuring playwright-mcp for packaged mode on win32
[JARVIS MCP] Attempting to resolve @playwright/mcp/cli.js...
[JARVIS MCP] ✓ Resolved MCP CLI path: C:\...\app.asar\node_modules\@playwright\mcp\cli.js
[JARVIS MCP] File exists check: true
[JARVIS MCP] Windows detected - checking path format
[JARVIS MCP] ✓ MCP config complete for playwright-mcp
```

**OR Error Logs (if something fails):**
```
[JARVIS MCP] ✗✗✗ CRITICAL ERROR: Failed to resolve @playwright/mcp path
[JARVIS MCP] Error message: Cannot find module '@playwright/mcp/cli.js'
```

### Step 4: Run a Simple Test

In the JARVIS-AI interface, enter a test:

```
Test: Login to saucedemo.com

Steps:
1. Navigate to https://www.saucedemo.com/
2. Enter username: standard_user
3. Enter password: secret_sauce
4. Click the login button
5. Verify we're on the products page
```

Click "Run Test" and watch both:
- **Execution Panel** in the UI (shows tools being used)
- **Console** in DevTools (shows MCP diagnostics)

### Step 5: Check Tool Usage

In the execution panel, look at the tool names:

**✅ GOOD (MCP Working):**
- `playwright_navigate`
- `playwright_click`
- `playwright_fill`
- `playwright_screenshot`

**❌ BAD (MCP NOT Working):**
- `bash` (with echo commands)
- `task` (subagent fallback)

If you see `bash` tools, the Console will display:
```
[JARVIS] ⚠️⚠️⚠️ PLAYWRIGHT MCP NOT AVAILABLE ⚠️⚠️⚠️
[JARVIS WINDOWS] Common Windows issues:
  1. MCP CLI path resolution failed
  2. ASAR archive reading issue
  3. Process spawning with ELECTRON_RUN_AS_NODE failed
```

---

## Capturing Logs

### Method 1: Save Console Logs

1. Right-click in the Console tab
2. Select "Save as..."
3. Save to: `jarvis-windows-console-logs.txt`

### Method 2: Take Screenshots

Capture screenshots of:
1. The Console tab showing all `[JARVIS MCP]` and `[JARVIS WINDOWS]` messages
2. The execution panel showing which tools were used
3. Any error dialogs or popups

### Method 3: Copy Specific Logs

Look for and copy these specific sections:

**1. Platform Detection:**
```
[JARVIS] Platform: win32 ...
[JARVIS] Process execPath: ...
[JARVIS] app.isPackaged: ...
```

**2. MCP Configuration:**
```
[JARVIS MCP] Building MCP config ...
[JARVIS MCP] ✓ Resolved MCP CLI path: ...
[JARVIS MCP] File exists check: ...
[JARVIS MCP] Final config for playwright-mcp: ...
```

**3. Session Creation:**
```
[JARVIS SDK] Creating session with config: ...
[JARVIS SDK] ✓ Session created successfully
```

**4. Any Errors:**
```
[JARVIS MCP] ✗✗✗ CRITICAL ERROR: ...
[JARVIS MCP] Error message: ...
[JARVIS MCP] Windows-specific diagnostics: ...
```

---

## What to Send Back

### Required Files/Information

1. **Console Log File** (`jarvis-windows-console-logs.txt`)
   - Contains all diagnostic output

2. **Screenshot of Execution Panel**
   - Shows which tools were used (`playwright_*` vs `bash`)

3. **System Information:**
   - Windows version (e.g., Windows 11 Pro 23H2)
   - Node.js version (run `node --version` in PowerShell)
   - Extracted location (e.g., `C:\JARVIS-AI-Debug\`)

4. **Observations:**
   - Did Chrome browser window open?
   - Were there any error popups?
   - At what step did it fail?

### Optional but Helpful

- Video recording of the test execution
- Additional screenshots of any errors
- Output of: `Get-Process | Where-Object {$_.ProcessName -like "*chrome*"}` in PowerShell (after test runs)

---

## Troubleshooting

### Issue: "Windows protected your PC"

**Solution:**
1. Click "More info"
2. Click "Run anyway"
3. This happens because the app isn't code-signed

### Issue: DevTools won't open

**Solution:**
1. Try `F12` key
2. OR restart the app and try again
3. OR use Menu → View → Toggle Developer Tools

### Issue: Console is blank/no logs

**Solution:**
1. Close and restart JARVIS-AI
2. Open DevTools BEFORE selecting persona
3. Check you're in the "Console" tab, not "Sources" or other tabs

### Issue: Test never starts

**Solution:**
1. Check Console for error messages
2. Verify Node.js is installed: `node --version` in PowerShell
3. Try restarting the app

### Issue: Chrome opens but nothing happens

**Partial success!** This means:
- Chrome spawning works
- CDP connection works
- But Playwright MCP might not be controlling it

Capture logs - this is valuable diagnostic info!

---

## Understanding the Logs

### Successful MCP Connection

```
[JARVIS MCP] ✓ Resolved MCP CLI path: C:\...\app.asar\node_modules\@playwright\mcp\cli.js
[JARVIS MCP] File exists check: true
[JARVIS MCP] MCP CLI in ASAR: true
[JARVIS MCP] Windows detected - checking path format
[JARVIS MCP] ✓ MCP config complete for playwright-mcp
[JARVIS SDK] Creating session with config: { mcpServers: { "playwright-mcp": {...} } }
[JARVIS SDK] ✓ Session created successfully
[JARVIS] ✓ Playwright MCP tools detected - browser automation working!
```

Execution panel shows: `playwright_navigate`, `playwright_click`, etc.

### Failed MCP Connection - Path Resolution

```
[JARVIS MCP] ✗✗✗ CRITICAL ERROR: Failed to resolve @playwright/mcp path
[JARVIS MCP] Error message: Cannot find module '@playwright/mcp/cli.js'
[JARVIS MCP] Windows-specific diagnostics:
[JARVIS MCP]   - CWD: C:\...
[JARVIS MCP]   - @playwright folder does not exist!
```

Execution panel shows: `bash`, `task` (fallback tools)

### Failed MCP Connection - File Not Found

```
[JARVIS MCP] ✓ Resolved MCP CLI path: C:\...\app.asar\node_modules\@playwright\mcp\cli.js
[JARVIS MCP] File exists check: false
[JARVIS MCP] ✗ ERROR: MCP CLI file does not exist at resolved path!
```

### Failed MCP Connection - Process Spawning

```
[JARVIS MCP] ✓ Resolved MCP CLI path: C:\...
[JARVIS MCP] File exists check: true
[JARVIS MCP] ✓ MCP config complete for playwright-mcp
[JARVIS SDK] Creating session with config: ...
[JARVIS SDK] ✓ Session created successfully
```

But then execution logs show `bash` instead of `playwright_*`

---

## Key Diagnostics to Watch For

1. **Path Separator Issues**
   - Look for: `Path contains backslashes, normalized to: ...`
   - This shows if Windows paths need conversion

2. **ASAR Archive Access**
   - Look for: `File exists check: false` even though path resolved
   - This means Electron can't read from ASAR on Windows

3. **Environment Variables**
   - Look for: `Windows environment variables:` section
   - Shows if PATH and other env vars are set correctly

4. **Process Spawn Failure**
   - Look for errors after `Session created successfully`
   - Means spawning failed silently

---

## Expected Timeline

- **Extraction:** 1-2 minutes
- **First launch:** 30 seconds
- **DevTools open:** Immediate
- **Diagnostic script run:** Immediate
- **Persona selection:** 5-10 seconds (first time, installs Playwright browsers)
- **Test execution:** 30-60 seconds (if working)

---

## Questions?

If anything is unclear:
1. Take a screenshot of what you see
2. Copy any error messages
3. Note exactly what step you're on
4. Send all of this back

The more detail you provide, the faster we can fix this!

---

## Success Criteria

**The test is successful if:**
1. Playwright tools appear in execution logs (`playwright_navigate`, etc.)
2. Chrome browser opens and performs the test
3. No `bash` fallback tools are used

**The test provides useful diagnostics if:**
1. Console logs are captured completely
2. Tool names are visible in execution panel screenshot
3. Any errors are fully captured with stack traces

Either outcome is valuable! Even a failure with good logs helps us fix the issue.

---

**Thank you for testing! Your detailed logs will help us make JARVIS-AI work perfectly on Windows.**
