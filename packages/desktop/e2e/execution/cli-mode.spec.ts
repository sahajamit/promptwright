import { test, expect } from "../fixtures/electron-app.js";
import {
  waitForAppReady,
  selectPersona,
  setAutomationMode,
  enterTestStepsAndRun,
  waitForExecutionComplete,
  openActivityPanel,
  getActivityToolNames,
  isLivePreviewVisible,
  isRecordingVisible,
  hasExecutionLogs,
} from "../fixtures/jarvis-helpers.js";

const TEST_STEPS = `Navigate to https://graphcommerce.vercel.app/
Select Women category`;

test.describe("E2E: CLI Mode Execution", () => {
  test.use({ isFreshMode: true });

  test("full execution flow with playwright-cli mode", { timeout: 420_000 }, async ({
    electronApp,
    mainWindow,
  }) => {
    // 1. Wait for app to be ready
    await waitForAppReady(mainWindow);

    // 2. Select AI QA Assistant persona
    await selectPersona(mainWindow, "AI QA Assistant");

    // 3. Switch automation mode to playwright-cli
    // This triggers persona recreation which remounts the UI.
    // setAutomationMode waits for the new session + textarea to stabilize.
    await setAutomationMode(mainWindow, "playwright-cli");

    // 4. Enter test steps and run
    await enterTestStepsAndRun(mainWindow, TEST_STEPS);

    // 6. Verify execution is in progress (timer shows format like "00:15")
    await expect(mainWindow.locator("text=/\\d+:\\d+/")).toBeVisible({
      timeout: 15_000,
    });

    // 7. Check live browser preview
    await mainWindow.waitForTimeout(15_000);
    const hasPreview = await isLivePreviewVisible(mainWindow);
    console.log(`[E2E] Live preview visible during execution: ${hasPreview}`);

    // 8. Wait for execution to complete
    const verdict = await waitForExecutionComplete(mainWindow, {
      timeout: 240_000,
    });
    console.log(`[E2E] Execution verdict: ${verdict}`);
    expect(["pass", "fail"]).toContain(verdict);

    // 9. Verify execution logs are present
    const logsPresent = await hasExecutionLogs(mainWindow);
    expect(logsPresent).toBe(true);

    // 10. Verify recording is generated
    const recordingVisible = await isRecordingVisible(mainWindow);
    console.log(`[E2E] Recording visible: ${recordingVisible}`);

    // 11. Open Activity panel and verify CLI tools were used (NOT MCP tools)
    await openActivityPanel(mainWindow);
    const toolNames = await getActivityToolNames(mainWindow);
    console.log("[E2E] Tools used:", toolNames);

    // CLI mode should use bash tool, NOT playwright_* MCP tools
    const hasMCPTools = toolNames.some((name) =>
      name.startsWith("playwright_")
    );
    expect(hasMCPTools).toBe(false);

    // CLI mode uses bash to run Playwright CLI commands
    const hasBashTool = toolNames.some((name) => name === "bash");
    expect(hasBashTool).toBe(true);

    // 12. Take final screenshot
    await mainWindow.screenshot({
      path: "e2e/screenshots/cli-mode-complete.png",
    });
  });
});
