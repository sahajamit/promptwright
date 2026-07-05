# E2E Test Fixes - Persona Selection UI Change

## Issue

E2E tests were failing with timeout errors while waiting for `h1:has-text('Choose Your Persona')` to appear. All 5 execution tests were affected:
- `api-mode.spec.ts`
- `cli-mode.spec.ts`
- `mcp-mode.spec.ts`
- `packaged-mac-execution.spec.ts` (both MCP and CLI modes)

## Root Cause

The UI/UX flow changed - the app no longer shows a "Choose Your Persona" modal on startup. Instead:

1. **Old Flow** (what tests expected):
   ```
   App Launch → PrerequisiteBlocker (if needed) → PersonaModal → User clicks persona → Main App
   ```

2. **New Flow** (current implementation):
   ```
   App Launch → PrerequisiteBlocker (if needed) → Auto-initialize with "AI QA Assistant" → Main App
   ```

The persona is now automatically selected on startup (defaults to `manual-test-execution` a.k.a. "AI QA Assistant"). See `App.tsx` lines 76-93.

## Fix Applied

Updated `/packages/desktop/e2e/fixtures/jarvis-helpers.ts`:

```typescript
/**
 * DEPRECATED: Persona selection is now automatic.
 * The app auto-initializes with "AI QA Assistant" (manual-test-execution) persona on startup.
 * This function is kept for backward compatibility but does nothing.
 * 
 * To change persona in tests, you must manually call window.jarvis.persona.select(personaId).
 */
export async function selectPersona(window: Page, personaName: string): Promise<void> {
  // Persona selection is now automatic - the app auto-initializes with AI QA Assistant.
  // No action needed. Just wait for the app to be ready.
  console.log(`[E2E] selectPersona("${personaName}") - DEPRECATED - persona is auto-selected on startup`);
  
  // Simply verify the app is ready (ExecutionPanel visible)
  await waitForAppReady(window);
}
```

The function now:
- Logs a deprecation warning
- Simply waits for the app to be ready (which tests already do with `waitForAppReady`)
- Is effectively a no-op, maintaining backward compatibility

## Test Code Impact

All test files that call `selectPersona()` will continue to work:

```typescript
await waitForAppReady(mainWindow);
await selectPersona(mainWindow, "Manual Test Execution");  // Now a no-op
await enterTestStepsAndRun(mainWindow, TEST_STEPS);
```

The `selectPersona` call is redundant now but harmless. Tests can optionally remove it since `waitForAppReady` already ensures the app is initialized.

## Verification Status

**Cannot fully verify due to unrelated E2E framework issue**: The Playwright/Electron integration is currently broken with the error:

```
/Users/amitrawat/Desktop/dev/github/jarvis-ai/node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron: bad option: --remote-debugging-port=0
```

This is a Playwright → Electron compatibility issue where newer Electron versions don't accept the `--remote-debugging-port=0` flag that Playwright tries to use.

**Manual Verification**:
- ✅ Reviewed App.tsx auto-initialization code (lines 76-93)
- ✅ Confirmed ExecutionPanel renders with "AI QA Assistant" persona pre-selected
- ✅ Updated test helper to match new behavior
- ✅ Screenshot from failed tests shows correct UI: "AI QA Assistant" with ExecutionPanel visible

## Expected Behavior After E2E Framework Fix

Once the Playwright/Electron compatibility issue is resolved, tests should:
1. Launch app successfully
2. See ExecutionPanel with "AI QA Assistant" heading
3. `selectPersona()` calls will be no-ops (just wait for ready state)
4. Tests continue with test execution as normal

## Recommended Next Steps

1. **Fix E2E Framework**: Update Playwright configuration to work with Electron 33.x or downgrade Electron
2. **Optional Cleanup**: Remove redundant `selectPersona()` calls from tests since persona is now auto-selected
3. **Future**: If tests need to explicitly change personas, use:
   ```typescript
   await window.evaluate(async () => {
     await (window as any).jarvis.persona.select('record-and-repeat');
   });
   ```

## Files Modified

- `packages/desktop/e2e/fixtures/jarvis-helpers.ts` - Updated `selectPersona()` to match new auto-init behavior

## Related Code Locations

- `packages/desktop/src/renderer/App.tsx` (lines 76-93) - Auto-initialization logic
- `packages/desktop/src/renderer/components/PersonaModal.tsx` - Modal still exists for manual switching
- All E2E execution tests that call `selectPersona()`

---

**Date**: 2026-02-17  
**Status**: Fix applied, awaiting E2E framework resolution for full verification
