# E2E Test Plan for JARVIS-AI Desktop App

## Context

The JARVIS-AI Electron desktop app currently has **zero test infrastructure** - no test files, no test framework, no playwright config. We need to add E2E tests that verify the app works correctly in both dev and packaged modes, across both Playwright automation modes (MCP and CLI).

## File Structure

```
packages/desktop/
  playwright.config.ts                    # Playwright test config
  e2e/
    tsconfig.json                         # TS config for tests
    fixtures/
      electron-app.ts                     # Playwright Electron fixture (launch/teardown)
      jarvis-helpers.ts                   # Helpers: fresh launch, persona select, config, assertions
    smoke/
      dev-mode.spec.ts                    # Suite 1: Dev mode smoke test
      packaged-mac.spec.ts                # Suite 2: Packaged Mac app smoke test
    execution/
      mcp-mode.spec.ts                    # Suite 3a: Full execution with playwright-mcp mode
      cli-mode.spec.ts                    # Suite 3b: Full execution with playwright-cli mode
    screenshots/                          # Auto-generated test screenshots (gitignored)
```

## Implementation Steps

### Step 1: Install dependencies & add scripts

**File: `packages/desktop/package.json`**
- Add `@playwright/test` as devDependency
- Add scripts: `test:e2e`, `test:e2e:smoke`, `test:e2e:execution`

### Step 2: Create `packages/desktop/playwright.config.ts`

- `testDir: "./e2e"`
- `workers: 1` (app uses single-instance lock)
- `timeout: 300_000` (5 min - execution takes 2-3 min)
- Two projects: `smoke` (2 min timeout) and `execution` (5 min timeout)
- `retries: 0` (AI-dependent tests shouldn't auto-retry)
- HTML + list reporters
- Trace on failure

### Step 3: Create `e2e/tsconfig.json`

- ES2022, NodeNext module resolution, strict, noEmit

### Step 4: Create `e2e/fixtures/electron-app.ts` (core fixture)

Custom Playwright fixture providing:
- **`isFreshMode`** option (default false) - runs `scripts/clean-fresh.sh` before launch
- **`electronApp`** fixture - launches Electron via `_electron.launch()` with `dist/main/index.js`, forwards console logs, closes on teardown
- **`mainWindow`** fixture - gets first window, waits for DOM ready
- Exports `test` and `expect` from the fixture

### Step 5: Create `e2e/fixtures/jarvis-helpers.ts`

Helper functions:
- **`waitForAppReady(window)`** - waits for "Choose Your Persona" or app header (past loading/prereqs)
- **`isPrerequisiteBlocked(window)`** - checks if "Startup Requirements" blocker is shown
- **`selectPersona(window, name)`** - clicks persona card → Continue → waits for modal to close
- **`setAutomationMode(window, mode)`** - calls `window.jarvis.config.setAndApply()` via `page.evaluate()`
- **`enterTestStepsAndRun(window, steps)`** - fills textarea (`placeholder="Enter your test steps here..."`) → clicks "Run Test"
- **`waitForExecutionComplete(window)`** - waits for verdict text matching `TEST (PASSED|FAILED)` (from `LiveExecutionLog.tsx:637`)
- **`openActivityPanel(window)`** - clicks Activity toggle in header
- **`getActivityToolNames(window)`** - extracts `toolName` from activity log entries
- **`isLivePreviewVisible(window)`** - checks for screencast `<img>` element
- **`isRecordingVisible(window)`** - checks for recording section after execution

### Step 6: Suite 1 - Dev Mode Smoke Test (`e2e/smoke/dev-mode.spec.ts`)

**Precondition**: App must be built first (`pnpm build` in desktop package)

Test: "app launches in fresh mode without critical errors"
1. Launch with `isFreshMode: true`
2. Collect console errors
3. Verify NOT stuck on PrerequisiteBlocker
4. Verify PersonaModal appears (fresh = no saved persona)
5. Verify "Manual Test Execution" persona card visible
6. Select persona → verify main UI renders (header, textarea)
7. Assert no critical console errors (filter DevTools/security warnings)
8. Take screenshot

### Step 7: Suite 2 - Packaged Mac Smoke Test (`e2e/smoke/packaged-mac.spec.ts`)

**Precondition**: Packaged app must exist (`pnpm pkg:mac`)

Test: "packaged app starts and renders UI"
1. Skip if `release/mac-arm64/JARVIS-AI.app` doesn't exist
2. Fresh clean via `clean-fresh.sh`
3. Launch via `executablePath` pointing to the packaged binary
4. Verify window opens, title is set
5. Verify PersonaModal or PrerequisiteBlocker appears (no crash)
6. Assert no uncaught errors
7. Take screenshot

### Step 8: Suite 3a - MCP Mode E2E (`e2e/execution/mcp-mode.spec.ts`)

Test: "full execution with playwright-mcp mode"
1. Fresh launch → select "Manual Test Execution" persona
2. Set automation mode to `playwright-mcp` via `page.evaluate()`
3. Enter test steps: `Navigate to https://graphcommerce.vercel.app/\nSelect Women category`
4. Click "Run Test"
5. Verify execution starts (elapsed time counter appears)
6. Check live preview appears during execution (screencast frames)
7. Wait for verdict (up to 4 min)
8. Verify execution logs are present
9. Verify recording section appears
10. Open Activity panel → verify `playwright_*` tool names present (from `useTestExecution.ts:374`)
11. Verify NO `bash` fallback tools (would indicate MCP failure)
12. Take screenshot

### Step 9: Suite 3b - CLI Mode E2E (`e2e/execution/cli-mode.spec.ts`)

Test: "full execution with playwright-cli mode"
1. Fresh launch → select "Manual Test Execution" persona
2. Set automation mode to `playwright-cli`
3. Wait 3s for persona recreation
4. Enter same test steps → click "Run Test"
5. Verify execution starts
6. Check live preview
7. Wait for verdict
8. Verify recording section appears
9. Open Activity panel → verify `bash` tool used (CLI mode runs Playwright via bash)
10. Verify NO `playwright_*` MCP tools present
11. Take screenshot

### Step 10: Add screenshots dir to gitignore

Add `e2e/screenshots/` to `packages/desktop/.gitignore`

## Key Technical Details

- **Tool name detection**: MCP mode uses `playwright_*` prefixed tools (line 374 of `useTestExecution.ts`), CLI mode uses `bash` tool (line 377)
- **Verdict detection**: `LiveExecutionLog.tsx:591` matches `TEST PASSED` or `TEST FAILED` pattern, rendered at line 637
- **Single instance**: `app.requestSingleInstanceLock()` in main process means `workers: 1`
- **Textarea selector**: `placeholder="Enter your test steps here..."` (ExecutionPanel.tsx:511)
- **Activity header**: `<h3>Activity</h3>` (ActivityLogs.tsx:46)
- **Persona modal title**: `"Choose Your Persona"` (PersonaModal.tsx:129)
- **Config API**: `window.jarvis.config.setAndApply()` available via preload

## Verification

1. Build the app: `cd packages/desktop && pnpm build`
2. Run smoke tests: `pnpm test:e2e:smoke`
3. Run execution tests: `pnpm test:e2e:execution`
4. Run all: `pnpm test:e2e`
5. Check `e2e/screenshots/` for visual verification
6. Check HTML report: `npx playwright show-report` (in packages/desktop)
