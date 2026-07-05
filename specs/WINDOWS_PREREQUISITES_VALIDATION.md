# Windows Prerequisites Fix - Validation Guide

## Overview

This document provides a comprehensive validation matrix for the Windows prerequisite checks fix. The fix addresses false negatives in Copilot CLI detection when launching packaged/portable builds on Windows.

## Changes Summary

1. **Cross-platform PATH merging**: Updated `mergePathLists()` to use `path.delimiter` (`;` on Windows, `:` on Unix)
2. **Windows environment normalization**: Extended `normalizeLaunchEnvironment()` to run on packaged Windows builds
3. **Common Windows paths**: Added `%APPDATA%\npm`, `%ProgramFiles%\nodejs`, `%LOCALAPPDATA%\Programs\nodejs`
4. **Enhanced prerequisite checks**: Added explicit env passing and Windows shell fallback (`shell: true`)
5. **Structured debug logging**: Added comprehensive, sanitized logging for troubleshooting

## Files Modified

- `packages/desktop/src/main/index.ts` - Environment normalization and PATH merging
- `packages/desktop/src/main/prerequisites.ts` - Check execution and logging

## Validation Matrix

### Windows Testing

#### Test 1: Portable Build - Explorer Launch
**Setup:**
- Extract portable `.zip` to a directory (e.g., `C:\JarvisAIAgent\v2\JARVIS-AI-1.0.3-win-x64-portable\`)
- Ensure Node.js and Copilot CLI are installed globally via npm
- Double-click `JARVIS-AI.exe` from Windows Explorer

**Expected behavior:**
- App starts without prerequisite blocker
- Console logs show:
  - `[JARVIS ENV] Platform: win32, packaged: true, normalization: starting`
  - `[JARVIS ENV] Windows PATH segments: npm=true, nodejs=true, count=3`
  - `[JARVIS ENV] PATH entries: X -> Y` (where Y > X)
  - `[JARVIS ENV] Copilot CLI detected: <version>`
  - `[PREREQ node] ✓ Check passed (mode=direct, version=vX.X.X)`
  - `[PREREQ copilot-cli] ✓ Check passed (mode=direct, version=X.X.X)`
  - `[PREREQ_SUMMARY] passed=true, node_ok=true, copilot_cli_ok=true`

**Pass criteria:** Prerequisites pass, no blocker UI shown

#### Test 2: Portable Build - CMD Launch
**Setup:**
- Open `cmd.exe`
- Navigate to portable directory
- Run `JARVIS-AI.exe`

**Expected behavior:**
- App starts without prerequisite blocker
- Similar logs to Test 1, but PATH normalization may have fewer additions if CMD already has full PATH

**Pass criteria:** Prerequisites pass, no blocker UI shown

#### Test 3: Portable Build - PowerShell Launch
**Setup:**
- Open PowerShell
- Navigate to portable directory
- Run `.\JARVIS-AI.exe`

**Expected behavior:**
- App starts without prerequisite blocker
- Similar logs to Test 1

**Pass criteria:** Prerequisites pass, no blocker UI shown

#### Test 4: Installed Build (if available)
**Setup:**
- Run Windows installer
- Launch from Start Menu shortcut

**Expected behavior:**
- App starts without prerequisite blocker
- Installer should have added app to PATH, prerequisites should pass

**Pass criteria:** Prerequisites pass, no blocker UI shown

#### Test 5: Windows Shell Fallback
**Setup:**
- Rename `node.exe` temporarily to test fallback (optional advanced test)
- Or test on system where `copilot` is in a non-standard location

**Expected behavior:**
- Logs show `attempt=windows-shell-fallback` when direct resolution fails
- If shell resolution succeeds, check passes
- If both fail, appropriate error message shown

**Pass criteria:** Fallback mechanism activates and logs show attempt mode

#### Test 6: Negative Test - No Copilot Installed
**Setup:**
- Test on Windows machine without Copilot CLI

**Expected behavior:**
- App shows prerequisite blocker UI
- Logs show:
  - `[PREREQ copilot-cli] attempt=direct, status=null, hasError=true, classification=not_found`
  - `[PREREQ copilot-cli] Retrying with shell=true on Windows`
  - `[PREREQ copilot-cli] attempt=windows-shell-fallback, status=null, hasError=true, classification=not_found`
  - `[PREREQ_SUMMARY] passed=false, copilot_cli_ok=false, blockers=["copilot_cli_check_failed"]`

**Pass criteria:** Blocker UI shown with correct error message, logs clearly indicate "not_found"

### macOS Testing (Regression Check)

#### Test 7: macOS Packaged Build - Finder Launch
**Setup:**
- Package macOS build (`.dmg`)
- Install and launch from Finder (not from terminal)

**Expected behavior:**
- App starts without prerequisite blocker
- Logs show:
  - `[JARVIS ENV] Platform: darwin, packaged: true, normalization: starting`
  - `[JARVIS ENV] Launch environment normalized for packaged macOS`
  - `[JARVIS ENV] PATH entries: X -> Y` (login shell PATH merged)
  - Prerequisites pass

**Pass criteria:** No regression, app works as before

#### Test 8: macOS Development Mode
**Setup:**
- Run `pnpm dev:desktop` from terminal

**Expected behavior:**
- App starts in development mode
- No environment normalization logs (normalization skipped in dev mode)
- Prerequisites still pass using inherited terminal PATH

**Pass criteria:** No regression in dev mode

### Cross-Platform Validation

#### Test 9: PATH Delimiter Correctness
**Windows:**
- Verify logs show PATH merged with `;` separator
- Check `process.env.PATH` doesn't contain stray `:` characters

**macOS:**
- Verify logs show PATH merged with `:` separator
- Check `process.env.PATH` doesn't contain stray `;` characters

**Pass criteria:** Platform-specific delimiters used correctly

#### Test 10: Log Privacy
**All platforms:**
- Review all console logs
- Ensure no full PATH strings dumped
- Ensure no user home paths exposed
- Ensure only counts, booleans, and short snippets logged

**Pass criteria:** No sensitive information in logs

## Log Analysis Reference

### Success Pattern (Windows)
```
[JARVIS ENV] Platform: win32, packaged: true, normalization: starting
[JARVIS ENV] Windows PATH segments: npm=true, nodejs=true, count=3
[JARVIS ENV] PATH entries: 15 -> 18
[JARVIS ENV] Copilot CLI detected: 1.234.0
[PREREQ] Running prerequisite checks...
[PREREQ node] attempt=direct, status=0, signal=null, hasError=false, classification=ok
[PREREQ node] ✓ Check passed (mode=direct, version=v22.1.0)
[PREREQ copilot-cli] attempt=direct, status=0, signal=null, hasError=false, classification=ok
[PREREQ copilot-cli] ✓ Check passed (mode=direct, version=1.234.0)
[PREREQ copilot-auth] attempt=direct, status=0, signal=null, hasError=false, classification=ok
[PREREQ copilot-auth] ✓ Check passed (mode=direct)
[PREREQ_SUMMARY] {
  "label": "PREREQ_SUMMARY",
  "passed": true,
  "cached": false,
  "node_ok": true,
  "copilot_cli_ok": true,
  "copilot_auth_ok": true,
  "blockers": [],
  "all_reasons": []
}
[PREREQ] ✓ All required checks passed, cache saved
```

### Failure Pattern - Command Not Found (Windows)
```
[JARVIS ENV] Platform: win32, packaged: true, normalization: starting
[JARVIS ENV] Windows PATH segments: npm=true, nodejs=true, count=3
[JARVIS ENV] PATH entries: 15 -> 18
[JARVIS ENV] Copilot CLI check failed: exit=1
[PREREQ] Running prerequisite checks...
[PREREQ node] attempt=direct, status=0, signal=null, hasError=false, classification=ok
[PREREQ node] ✓ Check passed (mode=direct, version=v22.1.0)
[PREREQ copilot-cli] attempt=direct, status=null, signal=null, hasError=true, classification=not_found
[PREREQ copilot-cli] Retrying with shell=true on Windows
[PREREQ copilot-cli] attempt=windows-shell-fallback, status=null, signal=null, hasError=true, classification=not_found
[PREREQ copilot-cli] stderr_snippet="'copilot' is not recognized as an internal or external command"
[PREREQ_SUMMARY] {
  "label": "PREREQ_SUMMARY",
  "passed": false,
  "cached": false,
  "node_ok": true,
  "copilot_cli_ok": false,
  "copilot_auth_ok": false,
  "blockers": ["copilot_cli_check_failed"],
  "all_reasons": ["copilot_cli_check_failed", "copilot_auth_advisory_only"]
}
[PREREQ] ✗ Prerequisites not met, app will be blocked
```

### Shell Fallback Success Pattern (Windows)
```
[PREREQ copilot-cli] attempt=direct, status=null, signal=null, hasError=true, classification=not_found
[PREREQ copilot-cli] Retrying with shell=true on Windows
[PREREQ copilot-cli] attempt=windows-shell-fallback, status=0, signal=null, hasError=false, classification=ok
[PREREQ copilot-cli] ✓ Check passed (mode=windows-shell-fallback, version=1.234.0)
```

## Support Troubleshooting Guide

When a user reports prerequisite issues on Windows, request logs and analyze:

1. **Check environment normalization ran:**
   - Look for `[JARVIS ENV] Platform: win32, packaged: true`
   - Verify `Windows PATH segments` shows `npm=true, nodejs=true`
   - If false, Node/Copilot may be in non-standard location

2. **Check attempt modes:**
   - If only `attempt=direct` with `not_found`, and no fallback attempt, bug in fallback logic
   - If both attempts fail with `not_found`, Copilot genuinely not installed or in unusual location

3. **Check classification:**
   - `not_found` = binary not in PATH
   - `non_zero_exit` = binary found but returned error
   - `timeout` = command hung (rare)
   - `spawn_error` = other spawn issue

4. **Check PATH context:**
   - If `PATH entries: 5 -> 5`, normalization didn't add segments (possible env variable issue)
   - If `PATH entries: 15 -> 30`, normalization worked but copilot still not found (unusual install location)

## Known Issues and Workarounds

### Issue: Copilot in Custom Directory
**Symptom:** Both direct and shell fallback fail
**Workaround:** 
1. Launch from `cmd.exe` with full PATH
2. Or add Copilot directory to system PATH manually

### Issue: npm Global Binaries in Unusual Location
**Symptom:** `Windows PATH segments: npm=false`
**Workaround:**
1. Check where npm global binaries are: `npm config get prefix`
2. Add that directory to system PATH
3. Relaunch app

### Issue: False Positive Cache
**Symptom:** App worked once, then moved to different machine/context
**Workaround:**
1. Delete cache: `%APPDATA%\jarvis-ai\prerequisites.json`
2. Relaunch app (forces fresh check)

## Acceptance Checklist

- [ ] Test 1: Windows portable + Explorer launch → PASS
- [ ] Test 2: Windows portable + CMD launch → PASS
- [ ] Test 3: Windows portable + PowerShell launch → PASS
- [ ] Test 4: Windows installed build → PASS
- [ ] Test 6: Windows without Copilot → Blocker shown with correct message
- [ ] Test 7: macOS Finder launch → PASS (no regression)
- [ ] Test 8: macOS dev mode → PASS (no regression)
- [ ] Test 9: PATH delimiter correctness → PASS
- [ ] Test 10: Log privacy → PASS (no sensitive data)
- [ ] API intent execution uses `bash` tool calls and ends with `TEST PASSED:` or `TEST FAILED:`
- [ ] MCP mode execution uses `playwright_*` / `playwright-mcp-*` tools (no `bash` fallback)
- [ ] CLI mode execution uses `bash` tool calls (for `playwright-cli` commands) and ends with `TEST PASSED:` or `TEST FAILED:`
- [ ] All logs clear and actionable for support
- [ ] No breaking changes to existing functionality

## Build and Test Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Test in development mode (macOS)
pnpm dev:desktop

# Package for current platform
pnpm package:desktop

# Windows portable build
pnpm pkg:win

# macOS DMG build
pnpm pkg:mac
```

## Post-Validation Actions

After successful validation:

1. Update `CHANGELOG.md` with fix details
2. Close related GitHub issues
3. Document common troubleshooting patterns
4. Consider adding telemetry for prerequisite failure rates
5. Archive this validation document for future reference
