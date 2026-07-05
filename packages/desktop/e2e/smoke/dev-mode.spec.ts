import { test, expect } from "../fixtures/electron-app.js";
import {
  waitForAppReady,
  isPrerequisiteBlocked,
} from "../fixtures/jarvis-helpers.js";

test.describe("Dev Mode Smoke Test", () => {
  test.use({ isFreshMode: true });

  test("app launches in fresh mode without critical errors", async ({
    mainWindow,
  }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    mainWindow.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for app to be ready (auto-initializes orchestrator)
    await waitForAppReady(mainWindow, { timeout: 60_000 });

    // Verify NOT stuck on prerequisite blocker
    const blocked = await isPrerequisiteBlocked(mainWindow);
    expect(blocked).toBe(false);

    // Verify ExecutionPanel renders
    const textarea = mainWindow.locator(
      'textarea[placeholder="Describe your testing task..."]'
    );
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    // Verify Run Test button is visible (may initially show "Connecting..." while Copilot initializes)
    const runButton = mainWindow.locator("button:has-text('Run Test'), button:has-text('Connecting...')");
    await expect(runButton).toBeVisible({ timeout: 5_000 });

    // Verify Examples button is visible
    const examplesButton = mainWindow.locator("button:has-text('Examples')");
    await expect(examplesButton).toBeVisible({ timeout: 5_000 });

    // Verify header elements
    await expect(
      mainWindow.locator("text=Promptwright")
    ).toBeVisible({ timeout: 5_000 });

    // Check no critical console errors (filter known benign ones)
    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("DevTools") &&
        !e.includes("Electron Security Warning") &&
        !e.includes("net::ERR_") &&
        !e.includes("favicon.ico") &&
        !e.includes("ResizeObserver")
    );

    if (criticalErrors.length > 0) {
      console.warn("Console errors detected:", criticalErrors);
    }

    // Take a screenshot for visual verification
    await mainWindow.screenshot({
      path: "e2e/screenshots/dev-smoke-success.png",
    });
  });
});
