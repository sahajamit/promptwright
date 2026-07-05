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
} from "../fixtures/jarvis-helpers.js";

const API_TEST_STEPS = `Send a GET request to https://httpbin.org/get?foo=bar and verify:
- Status code is 200
- Response body contains "args" with "foo" as "bar"`;

/**
 * Pre-classify intent and wait for the session to stabilize.
 * Must be called after the Copilot session is fully ready.
 */
async function classifyAndWaitForApiMode(
  mainWindow: import("@playwright/test").Page,
  testSteps: string
): Promise<void> {
  const intent = await mainWindow.evaluate(async (steps) => {
    return await (window as any).jarvis.classifyIntent(steps);
  }, testSteps);
  expect(intent).toBe("api");

  // Wait for the API session reconfiguration to complete.
  // reconfigureForApiIntent creates a new client which causes a
  // disconnect → reconnect cycle. Wait for "Connected" to reappear.
  await waitForSessionReady(mainWindow, { timeout: 60_000 });

  // Extra stabilization so the session is fully accepting messages
  await mainWindow.waitForTimeout(2_000);
}

/**
 * Collects tool names used during an execution run.
 * Opens the activity panel, waits for tool activity, then returns tool names.
 */
async function collectToolNames(mainWindow: import("@playwright/test").Page): Promise<string[]> {
  const tools = await waitForFirstToolExecution(mainWindow, {
    timeout: 120_000,
  });
  expect(tools.length, "No tool activity detected").toBeGreaterThan(0);

  await waitForExecutionComplete(mainWindow, { timeout: 300_000 });

  await openActivityPanel(mainWindow);
  return getActivityToolNames(mainWindow);
}

/**
 * Asserts that tool list uses bash (not Playwright MCP) for API execution.
 */
function assertBashToolsUsed(toolNames: string[], runLabel: string) {
  const hasBashTool = toolNames.some((name) => name === "bash");
  expect(hasBashTool, `${runLabel}: expected bash tool to be used`).toBe(true);

  const hasPlaywrightTools = toolNames.some(
    (name) => name.startsWith("playwright_") || name.startsWith("playwright-mcp-")
  );
  expect(
    hasPlaywrightTools,
    `${runLabel}: expected NO playwright tools, but found: ${toolNames.filter((n) => n.startsWith("playwright")).join(", ")}`
  ).toBe(false);
}

test.describe("E2E: API Intent Persists Across New Test", () => {
  test.use({ isFreshMode: true });

  test(
    "API test uses bash on both first run and after New Test",
    { timeout: 600_000 },
    async ({ mainWindow }) => {
      // ── Setup: wait for app + Copilot session to be fully ready ──
      await waitForAppReady(mainWindow);
      await selectPersona(mainWindow, "AI QA Assistant");

      // Wait for the initial Copilot session to be fully connected
      // (async init must complete before we can classify intent)
      await waitForSessionReady(mainWindow, { timeout: 60_000 });

      // Pre-classify intent so session is reconfigured for API mode
      await classifyAndWaitForApiMode(mainWindow, API_TEST_STEPS);

      // ── First Run ──
      await openActivityPanel(mainWindow);
      await enterTestStepsAndRun(mainWindow, API_TEST_STEPS);

      const firstRunTools = await collectToolNames(mainWindow);
      console.log("[E2E] First run tools:", firstRunTools);
      assertBashToolsUsed(firstRunTools, "First run");

      // ── Click "New Test" ──
      const newTestButton = mainWindow.locator('span:has-text("New Test")');
      await newTestButton.first().click();

      // Wait for the ExecutionPanel to reset (fresh textarea visible)
      const textarea = mainWindow.locator(
        'textarea[placeholder="Describe your testing task..."]'
      );
      await textarea.waitFor({ state: "visible", timeout: 30_000 });

      // Wait for new Copilot session to be fully ready
      await waitForSessionReady(mainWindow, { timeout: 60_000 });

      // Pre-classify intent again for the new session
      await classifyAndWaitForApiMode(mainWindow, API_TEST_STEPS);

      // ── Second Run (after New Test) ──
      await enterTestStepsAndRun(mainWindow, API_TEST_STEPS);

      const secondRunTools = await collectToolNames(mainWindow);
      console.log("[E2E] Second run tools:", secondRunTools);
      assertBashToolsUsed(secondRunTools, "Second run (after New Test)");
    }
  );
});
