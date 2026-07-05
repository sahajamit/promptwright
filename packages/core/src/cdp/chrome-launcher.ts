/**
 * Chrome Launcher
 *
 * Launches Chrome with remote debugging enabled
 */

import type { LaunchedChrome } from "chrome-launcher";
import * as chromeLauncher from "chrome-launcher";
import { EventEmitter } from "events";

const DEFAULT_PORT = 9222;

/**
 * Chrome launch options
 */
export interface ChromeLaunchOptions {
  /** Port for remote debugging (default: 9222) */
  port?: number;
  /** Start URL to navigate to */
  startingUrl?: string;
  /** Run in headless mode */
  headless?: boolean;
  /** Additional Chrome flags */
  chromeFlags?: string[];
  /** User data directory (for separate profile) */
  userDataDir?: string;
}

/**
 * Chrome instance state
 */
export type ChromeState = "stopped" | "starting" | "running" | "error";

/**
 * Chrome launcher events
 */
export type ChromeLauncherEvent =
  | { type: "started"; port: number; pid: number }
  | { type: "stopped" }
  | { type: "error"; error: Error };

/**
 * Chrome Launcher
 *
 * Manages Chrome browser instances with remote debugging
 */
export class ChromeLauncher extends EventEmitter {
  private chrome: LaunchedChrome | null = null;
  private state: ChromeState = "stopped";
  private port: number = DEFAULT_PORT;

  /**
   * Get current state
   */
  getState(): ChromeState {
    return this.state;
  }

  /**
   * Get the debugging port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get the Chrome process ID
   */
  getPid(): number | null {
    return this.chrome?.pid || null;
  }

  /**
   * Check if Chrome is running
   */
  isRunning(): boolean {
    return this.state === "running" && this.chrome !== null;
  }

  /**
   * Check if a port is available
   */
  async isPortAvailable(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      // If we get a response, Chrome is already running on this port
      return !response.ok;
    } catch {
      // Connection refused means port is available
      return true;
    }
  }

  /**
   * Kill any Chrome process running on the specified port
   */
  async killExistingOnPort(port: number): Promise<void> {
    try {
      // Check if there's a Chrome instance on this port
      const response = await fetch(`http://localhost:${port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        // Chrome is running on this port, try to close it gracefully first
        try {
          await fetch(`http://localhost:${port}/json/close`, { method: "GET" });
          console.log(`[ChromeLauncher] Closed Chrome on port ${port}`);
        } catch (closeError) {
          console.log(`[ChromeLauncher] Could not close gracefully, will kill process`);
        }

        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if still running
        try {
          await fetch(`http://localhost:${port}/json/version`, {
            signal: AbortSignal.timeout(1000),
          });
          // Still running, need to force kill
          await this.forceKillOnPort(port);
        } catch {
          // Not responding, likely closed
          console.log(`[ChromeLauncher] Chrome on port ${port} closed successfully`);
        }
      }
    } catch (error) {
      // Port not in use or not reachable, nothing to kill
      console.log(`[ChromeLauncher] No Chrome process found on port ${port}`);
    }
  }

  /**
   * Force kill Chrome process on the specified port
   */
  private async forceKillOnPort(port: number): Promise<void> {
    const { execSync } = await import("child_process");
    const platform = process.platform;

    try {
      if (platform === "darwin" || platform === "linux") {
        // Use lsof to find the PID using the port
        const command = `lsof -ti:${port} -sTCP:LISTEN`;
        const output = execSync(command, { encoding: "utf-8" }).trim();

        if (output) {
          const pids = output.split("\n").filter((pid) => pid);
          for (const pid of pids) {
            try {
              execSync(`kill -9 ${pid}`);
              console.log(`[ChromeLauncher] Killed process ${pid} on port ${port}`);
            } catch (killError) {
              console.error(`[ChromeLauncher] Failed to kill process ${pid}:`, killError);
            }
          }
        }
      } else if (platform === "win32") {
        // Windows: use netstat to find PID
        const command = `netstat -ano | findstr :${port}`;
        const output = execSync(command, { encoding: "utf-8" });

        // Parse PIDs from netstat output
        const lines = output.split("\n");
        const pids = new Set<string>();

        for (const line of lines) {
          const match = line.match(/LISTENING\s+(\d+)/);
          if (match) {
            pids.add(match[1]);
          }
        }

        for (const pid of pids) {
          try {
            execSync(`taskkill /F /PID ${pid}`);
            console.log(`[ChromeLauncher] Killed process ${pid} on port ${port}`);
          } catch (killError) {
            console.error(`[ChromeLauncher] Failed to kill process ${pid}:`, killError);
          }
        }
      }
    } catch (error) {
      console.error(`[ChromeLauncher] Failed to force kill on port ${port}:`, error);
    }
  }

  /**
   * Launch Chrome with remote debugging
   */
  async launch(options: ChromeLaunchOptions = {}): Promise<void> {
    if (this.state === "running") {
      throw new Error("Chrome is already running");
    }

    this.state = "starting";
    this.port = options.port || DEFAULT_PORT;

    try {
      // Check if port is available
      const portAvailable = await this.isPortAvailable(this.port);
      if (!portAvailable) {
        throw new Error(
          `Port ${this.port} is already in use. Another Chrome instance may be running with remote debugging.`
        );
      }

      // Default Chrome flags for recording
      const defaultFlags = [
        "--disable-background-networking",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        // Start maximized to show more content
        "--start-maximized",
        "--window-size=1920,1080",
        // Set initial zoom level to 80% to show more content (0.8 = 80%)
        // "--force-device-scale-factor=0.8",
        // Note: --disable-blink-features=AutomationControlled is not supported by chrome-launcher
        // The "Chrome is being controlled by automated test software" banner is cosmetic and doesn't affect functionality
        // To suppress it, you would need to use excludeSwitches(['enable-automation']) with ChromeDriver/Selenium
        // but chrome-launcher doesn't support this option. Playwright MCP will handle browser automation properly.
      ];

      const chromeFlags = [
        ...defaultFlags,
        ...(options.chromeFlags || []),
      ];

      if (options.headless) {
        chromeFlags.push("--headless=new");
      }

      // Launch Chrome
      this.chrome = await chromeLauncher.launch({
        port: this.port,
        startingUrl: options.startingUrl || "about:blank",
        chromeFlags,
        userDataDir: options.userDataDir,
        handleSIGINT: true,
      });

      this.state = "running";
      this.emitEvent({
        type: "started",
        port: this.port,
        pid: this.chrome.pid,
      });

      // Monitor process exit
      this.chrome.process.on("exit", () => {
        if (this.state === "running") {
          this.state = "stopped";
          this.chrome = null;
          this.emitEvent({ type: "stopped" });
        }
      });
    } catch (error) {
      this.state = "error";
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitEvent({ type: "error", error: err });
      throw err;
    }
  }

  /**
   * Kill the Chrome process
   */
  async kill(): Promise<void> {
    if (this.chrome) {
      await this.chrome.kill();
      this.chrome = null;
      this.state = "stopped";
      this.emitEvent({ type: "stopped" });
    }
  }

  /**
   * Emit a launcher event
   */
  private emitEvent(event: ChromeLauncherEvent): void {
    this.emit("chrome-event", event);
  }

  /**
   * Subscribe to launcher events
   */
  onEvent(handler: (event: ChromeLauncherEvent) => void): () => void {
    this.on("chrome-event", handler);
    return () => this.off("chrome-event", handler);
  }
}

/**
 * Default Chrome launcher instance
 */
let defaultLauncher: ChromeLauncher | null = null;

/**
 * Get or create the default Chrome launcher
 */
export function getChromeLauncher(): ChromeLauncher {
  if (!defaultLauncher) {
    defaultLauncher = new ChromeLauncher();
  }
  return defaultLauncher;
}
