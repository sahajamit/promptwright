import { test as base, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_ROOT = path.resolve(__dirname, "../..");
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, "../..");

function getFreshCleanCommand(): string {
  if (process.platform === "win32") {
    const cleanScript = path.join(PROJECT_ROOT, "scripts", "clean-fresh.bat");
    return `cmd /c "${cleanScript}"`;
  }

  const cleanScript = path.join(PROJECT_ROOT, "scripts", "clean-fresh.sh");
  return `bash "${cleanScript}"`;
}

export interface ElectronFixtures {
  electronApp: ElectronApplication;
  mainWindow: Page;
  isFreshMode: boolean;
}

export const test = base.extend<ElectronFixtures>({
  isFreshMode: [false, { option: true }],

  electronApp: async ({ isFreshMode }, use) => {
    // Run clean script if fresh mode requested
    if (isFreshMode) {
      console.log("[E2E] Running fresh clean...");
      execSync(getFreshCleanCommand(), { stdio: "inherit" });
    }

    // Launch Electron from built dist (production mode so it loads built HTML, not localhost:5173)
    console.log("[E2E] Launching Electron app...");
    const electronApp = await electron.launch({
      args: [path.join(DESKTOP_ROOT, "dist/main/index.js")],
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      cwd: DESKTOP_ROOT,
    });

    // Forward main process logs to test output for crash diagnosis.
    const appProcess = electronApp.process();
    appProcess.stdout?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        console.log(`[Main] ${text}`);
      }
    });
    appProcess.stderr?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(`[Main:stderr] ${text}`);
      }
    });

    // Monitor for unexpected app termination
    let appCrashed = false;
    appProcess.on("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`[E2E] ⚠ Electron process exited unexpectedly with code ${code}, signal ${signal}`);
        appCrashed = true;
      }
    });

    await use(electronApp);

    // Teardown: close app
    console.log("[E2E] Closing Electron app...");
    if (appCrashed) {
      console.error("[E2E] App had already crashed - skipping close");
    } else {
      await electronApp.close().catch(() => {
        // App may have already exited
      });
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    // Wait for the first BrowserWindow to open
    const window = await electronApp.firstWindow();

    // Forward renderer console to test output
    window.on("console", (msg) => {
      const type = msg.type();
      if (type === "error") {
        console.error(`[Renderer] ${msg.text()}`);
      } else if (type === "warning") {
        console.warn(`[Renderer] ${msg.text()}`);
      }
    });

    // Log page crashes
    window.on("crash", () => {
      console.error("[E2E] ⚠ Renderer process crashed!");
    });

    // Wait for the renderer to be fully loaded
    await window.waitForLoadState("domcontentloaded");

    await use(window);
  },
});

export { expect } from "@playwright/test";
