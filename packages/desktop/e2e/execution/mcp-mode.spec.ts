import { test, expect } from "../fixtures/electron-app.js";
import {
  waitForAppReady,
  selectPersona,
  setAutomationMode,
  enterTestStepsAndRun,
  waitForExecutionComplete,
  openActivityPanel,
  getActivityToolNames,
  waitForFirstToolExecution,
  isLivePreviewVisible,
  isRecordingVisible,
  hasExecutionLogs,
} from "../fixtures/jarvis-helpers.js";

const TEST_STEPS = `Navigate to https://graphcommerce.vercel.app/
Select Women category`;

test.describe("E2E: MCP Mode Execution", () => {
  test.use({ isFreshMode: true });

  test("full execution flow with playwright-mcp mode", { timeout: 420_000 }, async ({
    electronApp,
    mainWindow,
  }) => {
    // 1. Wait for app to be ready
    await waitForAppReady(mainWindow);

    // 2. Select AI QA Assistant persona
    await selectPersona(mainWindow, "AI QA Assistant");

    // 3. Explicitly set MCP mode and wait for full remount/session recreation.
    // This mirrors the manual flow and ensures mode + session are fully settled.
    await setAutomationMode(mainWindow, "playwright-mcp");
    await mainWindow.waitForTimeout(3_000);

    // 4. Enter test steps and run
    await enterTestStepsAndRun(mainWindow, TEST_STEPS);

    // 5. Verify execution is in progress (ExecutionProgress shows timer like "00:15")
    await expect(mainWindow.locator("text=/\\d+:\\d+/")).toBeVisible({
      timeout: 15_000,
    });

    // 5b. Ensure execution has actually begun by observing first tool call.
    // If this fails, MCP execution never truly started.
    const initialTools = await waitForFirstToolExecution(mainWindow, {
      timeout: 90_000,
    });
    expect(initialTools.length, "No tool activity detected after Run Test").toBeGreaterThan(0);
    console.log("[E2E] First tool activity detected:", initialTools);

    // 6. Check live browser preview appears during execution
    // Wait for screencast frames to start streaming
    await mainWindow.waitForTimeout(15_000);
    const hasPreview = await isLivePreviewVisible(mainWindow);
    console.log(`[E2E] Live preview visible during execution: ${hasPreview}`);

    // 6b. Fast-fail diagnostics: ensure execution is actually producing logs/tools.
    // This catches "execution started but never progressed" much earlier than the
    // final 5-minute verdict timeout.
    await expect
      .poll(async () => {
        try {
          if (await hasExecutionLogs(mainWindow)) {
            return true;
          }
          await openActivityPanel(mainWindow);
          const tools = await getActivityToolNames(mainWindow);
          return tools.length > 0;
        } catch {
          return false;
        }
      }, {
        timeout: 60_000,
        intervals: [1_000, 2_000, 5_000],
        message: "Execution started but no logs/tool activity appeared within 60s",
      })
      .toBe(true);

    // 7. Wait for execution to complete
    const verdict = await waitForExecutionComplete(mainWindow, {
      timeout: 300_000, // 5 minutes - MCP mode can be slower
    });
    console.log(`[E2E] Execution verdict: ${verdict}`);

    // If app crashed during execution, take screenshot of whatever state is available
    // and fail with a clear message
    if (verdict === "error") {
      // Try to capture screenshot before failing (may fail if app crashed)
      await mainWindow.screenshot({
        path: "e2e/screenshots/mcp-mode-error.png",
      }).catch(() => {});

      // Check if it was an "Execution Failed" error vs app crash
      const errorVisible = await mainWindow.locator("text=Execution Failed")
        .isVisible().catch(() => false);

      if (errorVisible) {
        // Get the error message for diagnostics
        const errorMsg = await mainWindow.locator("text=/Execution Failed.*/")
          .textContent().catch(() => "unknown");
        expect.soft(verdict, `Execution failed with error: ${errorMsg}`).not.toBe("error");
      } else {
        expect.soft(verdict, "App crashed during MCP execution").not.toBe("error");
      }
    }

    expect(["pass", "fail"]).toContain(verdict);

    // 8. Verify execution logs are present
    const logsPresent = await hasExecutionLogs(mainWindow);
    expect(logsPresent).toBe(true);

    // 9. Verify recording is generated
    const recordingVisible = await isRecordingVisible(mainWindow);
    console.log(`[E2E] Recording visible: ${recordingVisible}`);
    // Recording may not always appear - log but don't hard-fail

    // 10. Open Activity panel and verify MCP tools were used
    await openActivityPanel(mainWindow);
    const toolNames = await getActivityToolNames(mainWindow);
    console.log("[E2E] Tools used:", toolNames);

    // MCP mode should use Playwright tools.
    // Depending on the MCP/tool adapter version, names may appear as:
    // - playwright_*
    // - playwright-mcp-*
    const hasMCPTools = toolNames.some((name) =>
      name.startsWith("playwright_") || name.startsWith("playwright-mcp-")
    );
    expect(hasMCPTools).toBe(true);

    // Verify no bash fallback (would indicate MCP failed to connect)
    const hasBashFallback = toolNames.some((name) => name === "bash");
    if (hasBashFallback) {
      console.warn(
        "[E2E] WARNING: bash tool detected - MCP may have fallen back to CLI mode"
      );
    }
    expect(hasBashFallback).toBe(false);

    // 11. Take final screenshot
    await mainWindow.screenshot({
      path: "e2e/screenshots/mcp-mode-complete.png",
    });
  });
});
