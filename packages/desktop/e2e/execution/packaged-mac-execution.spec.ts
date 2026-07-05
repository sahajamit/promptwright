import { _electron as electron, test as base, expect } from "@playwright/test";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  waitForAppReady,
  selectPersona,
  setAutomationMode,
  enterTestStepsAndRun,
  waitForExecutionComplete,
  openActivityPanel,
  getActivityToolNames,
  waitForFirstToolExecution,
  hasExecutionLogs,
} from "../fixtures/jarvis-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_ROOT = path.resolve(__dirname, "../..");
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, "../..");

const PACKAGED_APP_ARM64 = path.join(
  DESKTOP_ROOT,
  "release/mac-arm64/Promptwright.app/Contents/MacOS/Promptwright"
);
const PACKAGED_APP_X64 = path.join(
  DESKTOP_ROOT,
  "release/mac/Promptwright.app/Contents/MacOS/Promptwright"
);

const TEST_STEPS = `Navigate to https://graphcommerce.vercel.app/
Select Women category`;

function getPackagedAppPath(): string | null {
  if (existsSync(PACKAGED_APP_ARM64)) return PACKAGED_APP_ARM64;
  if (existsSync(PACKAGED_APP_X64)) return PACKAGED_APP_X64;
  return null;
}

async function runExecutionFlow(
  mainWindow: import("@playwright/test").Page,
  mode: "playwright-mcp" | "playwright-cli"
): Promise<string[]> {
  await waitForAppReady(mainWindow);
  await selectPersona(mainWindow, "AI QA Assistant");
  await setAutomationMode(mainWindow, mode);

  // Extra settle window for packaged app reconfiguration.
  await mainWindow.waitForTimeout(3_000);

  await enterTestStepsAndRun(mainWindow, TEST_STEPS);
  await expect(mainWindow.locator("text=/\\d+:\\d+/")).toBeVisible({
    timeout: 20_000,
  });

  const initialTools = await waitForFirstToolExecution(mainWindow, {
    timeout: 90_000,
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
  return toolNames;
}

base.describe("Packaged Mac Execution", () => {
  const appPath = getPackagedAppPath();

  base.skip(!appPath, "Packaged app not found. Run 'pnpm pkg:mac' first.");

  base.beforeEach(() => {
    const cleanScript = path.join(PROJECT_ROOT, "scripts/clean-fresh.sh");
    console.log("[E2E] Running fresh clean for packaged execution test...");
    execSync(`bash "${cleanScript}"`, { stdio: "inherit" });
  });

  base("packaged app executes in MCP mode", async () => {
    const electronApp = await electron.launch({
      executablePath: appPath!,
    });

    try {
      const mainWindow = await electronApp.firstWindow();
      await mainWindow.waitForLoadState("domcontentloaded");

      const toolNames = await runExecutionFlow(mainWindow, "playwright-mcp");
      const hasMCPTools = toolNames.some(
        (name) => name.startsWith("playwright_") || name.startsWith("playwright-mcp-")
      );
      const hasBashFallback = toolNames.some((name) => name === "bash");

      expect(hasMCPTools).toBe(true);
      expect(hasBashFallback).toBe(false);
    } finally {
      await electronApp.close().catch(() => {});
    }
  });

  base("packaged app executes in CLI mode", async () => {
    const electronApp = await electron.launch({
      executablePath: appPath!,
    });

    try {
      const mainWindow = await electronApp.firstWindow();
      await mainWindow.waitForLoadState("domcontentloaded");

      const toolNames = await runExecutionFlow(mainWindow, "playwright-cli");
      const hasMCPTools = toolNames.some(
        (name) => name.startsWith("playwright_") || name.startsWith("playwright-mcp-")
      );
      const hasBashTool = toolNames.some((name) => name === "bash");

      expect(hasMCPTools).toBe(false);
      expect(hasBashTool).toBe(true);
    } finally {
      await electronApp.close().catch(() => {});
    }
  });
});
