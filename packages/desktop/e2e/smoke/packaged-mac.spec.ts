import {
  _electron as electron,
  test as base,
  expect,
} from "@playwright/test";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_ROOT = path.resolve(__dirname, "../..");
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, "../..");

// Try both arm64 and x64 paths
const PACKAGED_APP_ARM64 = path.join(
  DESKTOP_ROOT,
  "release/mac-arm64/Promptwright.app/Contents/MacOS/Promptwright"
);
const PACKAGED_APP_X64 = path.join(
  DESKTOP_ROOT,
  "release/mac/Promptwright.app/Contents/MacOS/Promptwright"
);

function getPackagedAppPath(): string | null {
  if (existsSync(PACKAGED_APP_ARM64)) return PACKAGED_APP_ARM64;
  if (existsSync(PACKAGED_APP_X64)) return PACKAGED_APP_X64;
  return null;
}

base.describe("Packaged Mac App Smoke Test", () => {
  const appPath = getPackagedAppPath();

  base.skip(!appPath, "Packaged app not found. Run 'pnpm pkg:mac' first.");

  base.beforeAll(() => {
    // Fresh mode: clean user data
    const cleanScript = path.join(PROJECT_ROOT, "scripts/clean-fresh.sh");
    console.log("[E2E] Running fresh clean for packaged app test...");
    execSync(`bash "${cleanScript}"`, { stdio: "inherit" });
  });

  base("packaged app starts and renders UI", async () => {
    const electronApp = await electron.launch({
      executablePath: appPath!,
    });

    try {
      const mainWindow = await electronApp.firstWindow();
      await mainWindow.waitForLoadState("domcontentloaded");

      // Collect console errors
      const consoleErrors: string[] = [];
      mainWindow.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Wait for app to get past loading screen
      // Should see either ExecutionPanel textarea or PrerequisiteBlocker
      const executionPanel = mainWindow.locator('textarea[placeholder="Describe your testing task..."]');
      const prereqBlocker = mainWindow.locator("text=Startup Requirements");
      await executionPanel
        .or(prereqBlocker)
        .first()
        .waitFor({ state: "visible", timeout: 60_000 });

      // Verify no crash - window title should be set
      const title = await mainWindow.title();
      expect(title).toBeTruthy();

      // Take screenshot for visual verification
      await mainWindow.screenshot({
        path: "e2e/screenshots/packaged-smoke.png",
      });

      // Verify no critical uncaught errors
      const criticalErrors = consoleErrors.filter(
        (e) =>
          e.includes("Cannot read properties") ||
          e.includes("Uncaught") ||
          e.includes("FATAL")
      );
      expect(criticalErrors).toHaveLength(0);
    } finally {
      await electronApp.close();
    }
  });
});
