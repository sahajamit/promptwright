import { test, expect } from "../fixtures/electron-app.js";
import {
  waitForAppReady,
  selectPersona,
  enterTestStepsAndRun,
  waitForExecutionComplete,
  openActivityPanel,
  getActivityToolNames,
  waitForFirstToolExecution,
  waitForSessionReady,
  hasExecutionLogs,
} from "../fixtures/jarvis-helpers.js";

const API_TEST_STEPS = `Send a GET request to https://httpbin.org/get and verify status is 200.
Then verify response body contains the url field.`;

test.describe("E2E: API Intent Execution", () => {
  test.use({ isFreshMode: true });

  test("routes API intent to bash-based execution", { timeout: 420_000 }, async ({
    mainWindow,
  }) => {
    await waitForAppReady(mainWindow);
    await selectPersona(mainWindow, "AI QA Assistant");

    // Wait for Copilot session to be fully connected (async init)
    await waitForSessionReady(mainWindow);

    // Pre-trigger intent classification to reconfigure the session for API mode
    // BEFORE submitting test steps. Without this, classifyIntent() during
    // handleSubmit() causes a session recreation which remounts the ExecutionPanel
    // (React key changes), aborting handleSubmit() before runTest() is called.
    // This mirrors how cli-mode and mcp-mode tests call setAutomationMode() first.
    const intent = await mainWindow.evaluate(async (steps) => {
      return await (window as any).jarvis.classifyIntent(steps);
    }, API_TEST_STEPS);
    expect(intent).toBe("api");

    // Wait for the API session to fully stabilize after reconfiguration
    const textarea = mainWindow.locator('textarea[placeholder="Describe your testing task..."]');
    await textarea.waitFor({ state: "visible", timeout: 30_000 });
    await mainWindow.waitForTimeout(3_000);

    await enterTestStepsAndRun(mainWindow, API_TEST_STEPS);

    await expect(mainWindow.locator("text=/\\d+:\\d+/")).toBeVisible({
      timeout: 30_000,
    });

    const initialTools = await waitForFirstToolExecution(mainWindow, {
      timeout: 120_000,
    });
    expect(initialTools.length).toBeGreaterThan(0);

    const verdict = await waitForExecutionComplete(mainWindow, {
      timeout: 300_000,
    });
    expect(["pass", "fail"]).toContain(verdict);

    const logsPresent = await hasExecutionLogs(mainWindow);
    expect(logsPresent).toBe(true);

    await openActivityPanel(mainWindow);
    const toolNames = await getActivityToolNames(mainWindow);
    expect(toolNames.length).toBeGreaterThan(0);

    const hasBashTool = toolNames.some((name) => name === "bash");
    expect(hasBashTool).toBe(true);

    const hasPlaywrightTools = toolNames.some(
      (name) => name.startsWith("playwright_") || name.startsWith("playwright-mcp-")
    );
    expect(hasPlaywrightTools).toBe(false);
  });
});
