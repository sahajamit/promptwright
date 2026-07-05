import type { ElectronApplication, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Wait for the app to pass prerequisite checks and become interactive.
 * The app auto-initializes the orchestrator and shows the ExecutionPanel.
 * If prereqs fail, "Startup Requirements" blocker appears.
 */
export async function waitForAppReady(window: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout ?? 60_000;

  // Wait for either the main app UI (ExecutionPanel textarea) or prerequisite blocker
  const executionPanel = window.locator('textarea[placeholder="Describe your testing task..."]');
  const prereqBlocker = window.locator("text=Startup Requirements");
  await executionPanel.or(prereqBlocker).first().waitFor({
    state: "visible",
    timeout,
  });
}

/**
 * Check if PrerequisiteBlocker is shown (Node.js or Copilot CLI check failed).
 */
export async function isPrerequisiteBlocked(window: Page): Promise<boolean> {
  return window.locator("text=Startup Requirements").isVisible();
}

/**
 * @deprecated Persona system has been removed. The app always uses the orchestrator.
 * Kept for backward compatibility — just waits for the app to be ready.
 */
export async function selectPersona(window: Page, _personaName: string): Promise<void> {
  await waitForAppReady(window);
}

/**
 * Set the automation mode via the renderer's window.jarvis API.
 * Must be called after the app is loaded and past prerequisites.
 *
 * IMPORTANT: Changing automation mode triggers client re-initialization which creates
 * a new session and remounts the ExecutionPanel. This function waits for the
 * full UI cycle to complete (textarea disappears during remount, then reappears).
 */
export async function setAutomationMode(
  window: Page,
  mode: "playwright-mcp" | "playwright-cli"
): Promise<void> {
  const textarea = window.locator('textarea[placeholder="Describe your testing task..."]');

  // Count sessions before mode change to detect new session creation
  const sessionCountBefore = await window.locator("text=New Chat").count();

  await window.evaluate(async (m) => {
    await (window as any).jarvis.config.setAndApply({
      browser: { automationMode: m },
    });
  }, mode);

  // Wait for client re-initialization to create a new session.
  // The new session causes ExecutionPanel to remount (key changes).
  // Strategy: wait for a new "New Chat" entry to appear in the sidebar.
  await window.waitForFunction(
    (prevCount) => {
      const entries = document.querySelectorAll("*");
      let count = 0;
      for (const el of entries) {
        if (el.textContent?.trim() === "New Chat" && el.closest("nav, aside, [class*='sidebar']")) {
          count++;
        }
      }
      return count > prevCount;
    },
    sessionCountBefore,
    { timeout: 15_000 }
  ).catch(() => {
    // Fallback: if session detection fails, just wait
  });

  // Wait for textarea to be visible and stable (empty = fresh remounted state)
  await textarea.waitFor({ state: "visible", timeout: 15_000 });
  // Extra stabilization - ensure no more remounts are pending
  await window.waitForTimeout(1_000);
}

/**
 * Wait for the Copilot session to be fully initialized.
 *
 * Polls the main process via IPC to check both:
 * - getReadiness() === "ready" (async initializeClient completed)
 * - getState() === "connected" (client is connected)
 *
 * Uses page.evaluate() polling from the Node.js test side because
 * waitForFunction's browser-context execution doesn't reliably handle
 * IPC-backed promises from Electron's contextBridge.
 */
export async function waitForSessionReady(window: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout ?? 60_000;
  const startedAt = Date.now();

  // Poll from Node.js side using page.evaluate for reliable IPC access
  while (Date.now() - startedAt < timeout) {
    try {
      const result = await window.evaluate(async () => {
        const w = window as any;
        if (!w.jarvis) return { readiness: "no-api", state: "no-api" };
        const readiness = await w.jarvis.getReadiness();
        const state = await w.jarvis.getState();
        return { readiness, state };
      });

      if (result.readiness === "ready" && result.state === "connected") {
        // Also wait for the UI "Connected" indicator
        await window.locator("text=Connected").first().waitFor({
          state: "visible",
          timeout: 10_000,
        });
        // Brief stabilization window
        await window.waitForTimeout(500);
        return;
      }
    } catch {
      // Evaluate may fail if page is navigating — retry
    }

    await window.waitForTimeout(500);
  }

  throw new Error(`waitForSessionReady: timed out after ${timeout}ms`);
}

/**
 * Enter test steps in the ExecutionPanel textarea and click "Run Test".
 * Waits for the Copilot session to be ready before proceeding.
 */
export async function enterTestStepsAndRun(window: Page, testSteps: string): Promise<void> {
  const textarea = window.locator('textarea[placeholder="Describe your testing task..."]');
  await textarea.waitFor({ state: "visible", timeout: 15_000 });

  // Wait for the Copilot session to be ready before submitting
  await waitForSessionReady(window);

  await textarea.fill(testSteps);

  // Click "Run Test" button
  await window.locator("button:has-text('Run Test')").click();
}

/**
 * Wait for test execution to complete (verdict message appears).
 * Returns "pass", "fail", or "error".
 *
 * Handles three completion states:
 * - Verdict: "TEST PASSED" or "TEST FAILED" (normal completion)
 * - Error: "Execution Failed" (session/MCP error)
 * - Crash: page/browser closed unexpectedly
 */
export async function waitForExecutionComplete(
  window: Page,
  options?: { timeout?: number }
): Promise<"pass" | "fail" | "error"> {
  const timeout = options?.timeout ?? 240_000; // 4 minutes default

  // Wait for either verdict badge or execution error
  const verdictLocator = window.locator("text=/TEST (PASSED|FAILED)/");
  const errorLocator = window.locator("text=Execution Failed");

  try {
    await verdictLocator.or(errorLocator).first().waitFor({ state: "visible", timeout });
  } catch (err: any) {
    // If the page/browser closed, provide a clear error message
    if (err.message?.includes("Target page, context or browser has been closed")) {
      console.error("[E2E] ⚠ App crashed during execution - Electron process terminated");
      return "error";
    }
    throw err;
  }

  // Check if it's an error state
  if (await errorLocator.isVisible().catch(() => false)) {
    const errorText = await errorLocator.textContent().catch(() => "");
    console.error(`[E2E] Execution error: ${errorText}`);
    return "error";
  }

  const text = await verdictLocator.first().textContent();
  if (text?.includes("TEST PASSED")) return "pass";
  if (text?.includes("TEST FAILED")) return "fail";
  return "error";
}

/**
 * Toggle the Activity panel open via the header toggle button.
 * The button has title "Show activity logs" / "Hide activity logs".
 */
export async function openActivityPanel(window: Page): Promise<void> {
  // Check if activity panel is already visible (has "Activity" heading in sidebar)
  const activityHeading = window.locator("h3:has-text('Activity')");
  const isAlreadyOpen = await activityHeading.isVisible().catch(() => false);

  if (!isAlreadyOpen) {
    const toggleBtn = window.locator('button[title="Activity Logs"]');
    await toggleBtn.click();
    await activityHeading.waitFor({ state: "visible", timeout: 5_000 });
  }
}

/**
 * Get tool names from the Activity panel.
 * Tool log entries show "Executing <toolName>..." as content.
 * Returns array of tool names extracted from the logs.
 */
export async function getActivityToolNames(window: Page): Promise<string[]> {
  // The activity panel is a w-80 sidebar. Tool entries have content like "Executing playwright_navigate..."
  // We can extract tool names by evaluating the DOM or by reading the log entries.
  // Use page.evaluate to access the rendered log entries more reliably.
  const toolNames = await window.evaluate(() => {
    const names: string[] = [];
    // Activity panel log entries are rendered inside the w-80 sidebar
    const sidebar = document.querySelector(".w-80.border-l");
    if (!sidebar) return names;

    // Each log item has tool name displayed. Look for elements containing "Executing"
    const allText = sidebar.querySelectorAll("*");
    for (const el of allText) {
      const text = (el as HTMLElement).textContent?.trim() || "";
      // Match patterns like "Executing playwright_navigate..." or tool name directly
      const execMatch = text.match(/^Executing (\S+)\.\.\.$/);
      if (execMatch) {
        names.push(execMatch[1]);
      }
    }
    return [...new Set(names)]; // deduplicate
  });

  return toolNames;
}

/**
 * Wait until at least one tool execution appears in Activity panel.
 * Useful to assert MCP/CLI execution actually started.
 */
export async function waitForFirstToolExecution(
  window: Page,
  options?: { timeout?: number }
): Promise<string[]> {
  const timeout = options?.timeout ?? 90_000;
  const startedAt = Date.now();

  // Ensure Activity panel is visible so logs are queryable.
  await openActivityPanel(window);

  while (Date.now() - startedAt < timeout) {
    const tools = await getActivityToolNames(window);
    if (tools.length > 0) {
      return tools;
    }
    await window.waitForTimeout(1_000);
  }

  return [];
}

/**
 * Check if live browser preview (screencast frame) is visible during execution.
 */
export async function isLivePreviewVisible(window: Page): Promise<boolean> {
  // LiveExecutionLog renders screencast frames as <img> with base64 data URI src
  const preview = window.locator('img[src^="data:image"]');
  return preview.first().isVisible().catch(() => false);
}

/**
 * Check if a recording section is visible after execution completes.
 */
export async function isRecordingVisible(window: Page): Promise<boolean> {
  const recording = window.locator("text=Recording");
  return recording.isVisible().catch(() => false);
}

/**
 * Check if execution logs (streaming messages) are present.
 */
export async function hasExecutionLogs(window: Page): Promise<boolean> {
  // LiveExecutionLog renders messages in a scrollable container
  // Check that there's at least some content in the execution area
  const messages = window.locator('[class*="overflow-y-auto"] >> text=/.{10,}/');
  const count = await messages.count();
  return count > 0;
}
