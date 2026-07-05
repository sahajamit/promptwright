import { exec as execCallback, spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { createRequire } from "module";
import { promisify } from "util";
import { getConfig } from "../config/index.js";

const exec = promisify(execCallback);
const require = createRequire(import.meta.url);

/**
 * Status of Playwright MCP installation
 */
export type PlaywrightMCPStatus =
  | "not_installed"
  | "installed"
  | "installing"
  | "running"
  | "stopped"
  | "error";

/**
 * Events emitted by PlaywrightMCPManager
 */
export type PlaywrightMCPEvent =
  | { type: "status_changed"; status: PlaywrightMCPStatus }
  | { type: "installation_progress"; message: string }
  | { type: "installation_complete" }
  | { type: "installation_failed"; error: string }
  | { type: "server_started" }
  | { type: "server_stopped" }
  | { type: "server_error"; error: string }
  | { type: "server_output"; data: string };

/**
 * PlaywrightMCPManager
 * 
 * Manages the Playwright MCP server installation, lifecycle, and monitoring.
 */
export class PlaywrightMCPManager extends EventEmitter {
  private status: PlaywrightMCPStatus = "not_installed";
  private serverProcess: ChildProcess | null = null;
  private verbose: boolean = false;
  private headless: boolean = true;
  private isPackaged: boolean = false;
  private resourcesPath: string | null = null;

  constructor(options: {
    verbose?: boolean;
    headless?: boolean;
    isPackaged?: boolean;
    resourcesPath?: string;
  } = {}) {
    super();
    this.verbose = options.verbose || false;
    this.isPackaged = options.isPackaged || false;
    this.resourcesPath = options.resourcesPath || null;
    // Get headless setting from config if not explicitly provided
    const config = getConfig();
    this.headless = options.headless ?? config.browser.headless;

    this.log(`Initialized with isPackaged=${this.isPackaged}, resourcesPath=${this.resourcesPath}`);
  }

  /**
   * Get current status
   */
  getStatus(): PlaywrightMCPStatus {
    return this.status;
  }

  /**
   * Check if @playwright/mcp is installed
   */
  async isInstalled(): Promise<boolean> {
    // In packaged mode, assume the bundled @playwright/mcp is available
    if (this.isPackaged) {
      this.log("Packaged mode: assuming @playwright/mcp is bundled");
      this.setStatus("installed");
      return true;
    }

    try {
      // Try to resolve the package
      const { stdout } = await exec("npm list -g @playwright/mcp --json", {
        timeout: 5000,
      });
      const result = JSON.parse(stdout);
      const installed = result.dependencies?.["@playwright/mcp"] !== undefined;

      if (!installed) {
        // Also check local node_modules
        const localCheck = await exec("npm list @playwright/mcp --json", {
          timeout: 5000,
        }).catch(() => ({ stdout: "{}" }));
        const localResult = JSON.parse(localCheck.stdout);
        const localInstalled = localResult.dependencies?.["@playwright/mcp"] !== undefined;

        this.setStatus(localInstalled ? "installed" : "not_installed");
        return localInstalled;
      }

      this.setStatus("installed");
      return true;
    } catch (error) {
      this.log("Failed to check Playwright MCP installation:", error);
      this.setStatus("not_installed");
      return false;
    }
  }

  /**
   * Check if Chrome/Chromium is available
   */
  async isBrowserAvailable(): Promise<boolean> {
    try {
      // Check for common browser installations
      const commands = [
        "which google-chrome",
        "which chromium",
        "which chromium-browser",
        'ls "/Applications/Google Chrome.app"', // macOS
      ];

      for (const cmd of commands) {
        try {
          await exec(cmd, { timeout: 2000 });
          return true;
        } catch {
          // Continue to next command
        }
      }

      return false;
    } catch (error) {
      this.log("Failed to check browser availability:", error);
      return false;
    }
  }

  /**
   * Install @playwright/mcp
   */
  async install(): Promise<void> {
    if (this.status === "installing") {
      throw new Error("Installation already in progress");
    }

    // In packaged mode, @playwright/mcp is already bundled - no installation needed
    if (this.isPackaged) {
      this.log("Packaged mode: @playwright/mcp is bundled, skipping npm installation");
      this.emitEvent({
        type: "installation_progress",
        message: "Using bundled @playwright/mcp...",
      });

      // Check if system browser is available
      const browserAvailable = await this.isBrowserAvailable();
      if (!browserAvailable) {
        this.log("Warning: No system browser detected. Please install Chrome or Chromium.");
        this.emitEvent({
          type: "installation_progress",
          message: "Please ensure Chrome or Chromium is installed on your system.",
        });
      }

      this.setStatus("installed");
      this.emitEvent({ type: "installation_complete" });
      this.log("Packaged installation complete");
      return;
    }

    this.setStatus("installing");
    this.emitEvent({
      type: "installation_progress",
      message: "Installing @playwright/mcp...",
    });

    try {
      // Install using npm to ensure latest version
      const installCmd = "npm install -g @playwright/mcp";

      this.log("Running:", installCmd);

      const installProcess = spawn("npm", ["install", "-g", "@playwright/mcp"], {
        shell: true,
        stdio: this.verbose ? "inherit" : "pipe",
      });

      if (!this.verbose && installProcess.stdout) {
        installProcess.stdout.on("data", (data) => {
          const message = data.toString();
          this.log("Install output:", message);
          this.emitEvent({
            type: "installation_progress",
            message: message.trim(),
          });
        });
      }

      if (!this.verbose && installProcess.stderr) {
        installProcess.stderr.on("data", (data) => {
          this.log("Install stderr:", data.toString());
        });
      }

      await new Promise<void>((resolve, reject) => {
        installProcess.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Installation failed with code ${code}`));
          }
        });

        installProcess.on("error", reject);
      });

      // Also install Playwright browsers
      this.emitEvent({
        type: "installation_progress",
        message: "Installing Playwright browsers...",
      });

      const browserInstall = spawn("npx", ["playwright", "install", "chromium"], {
        shell: true,
        stdio: this.verbose ? "inherit" : "pipe",
      });

      await new Promise<void>((resolve, _reject) => {
        browserInstall.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            // Don't fail if browser install fails - it might already be installed
            this.log("Browser installation returned code", code);
            resolve();
          }
        });

        browserInstall.on("error", (err) => {
          this.log("Browser installation error:", err);
          resolve(); // Don't fail the whole process
        });
      });

      this.setStatus("installed");
      this.emitEvent({ type: "installation_complete" });
      this.log("Installation complete");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.setStatus("error");
      this.emitEvent({
        type: "installation_failed",
        error: errorMsg,
      });
      throw error;
    }
  }

  /**
   * Start the Playwright MCP server
   */
  async startServer(): Promise<void> {
    if (this.serverProcess) {
      throw new Error("Server is already running");
    }

    const isInstalled = await this.isInstalled();
    if (!isInstalled) {
      throw new Error(
        "@playwright/mcp is not installed. Call install() first."
      );
    }

    try {
      this.log("Starting Playwright MCP server...");

      // Determine how to start the server based on packaged mode
      let command: string;
      let args: string[];

      if (this.isPackaged) {
        // In packaged mode, use node to run the bundled @playwright/mcp CLI
        // The CLI entry is at node_modules/@playwright/mcp/cli.js
        command = "node";

        // Try to resolve the path to the bundled @playwright/mcp
        // In Electron packaged apps, modules are typically in app.asar/node_modules
        const mcpCliPath = require.resolve("@playwright/mcp/cli.js");
        args = [mcpCliPath];

        this.log(`Packaged mode: running node ${mcpCliPath}`);
      } else {
        // In development mode, use npx
        command = "npx";
        args = ["@playwright/mcp"];
      }

      // Start the server
      this.serverProcess = spawn(command, args, {
        shell: true,
        env: {
          ...process.env,
          PLAYWRIGHT_HEADLESS: this.headless ? "true" : "false",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Handle stdout
      if (this.serverProcess.stdout) {
        this.serverProcess.stdout.on("data", (data) => {
          const output = data.toString();
          this.log("Server output:", output);
          this.emitEvent({
            type: "server_output",
            data: output,
          });
        });
      }

      // Handle stderr
      if (this.serverProcess.stderr) {
        this.serverProcess.stderr.on("data", (data) => {
          const error = data.toString();
          this.log("Server stderr:", error);
          this.emitEvent({
            type: "server_error",
            error,
          });
        });
      }

      // Handle process events
      this.serverProcess.on("close", (code) => {
        this.log(`Server process exited with code ${code}`);
        this.serverProcess = null;
        this.setStatus("stopped");
        this.emitEvent({ type: "server_stopped" });
      });

      this.serverProcess.on("error", (error) => {
        this.log("Server process error:", error);
        this.emitEvent({
          type: "server_error",
          error: error.message,
        });
        this.serverProcess = null;
        this.setStatus("error");
      });

      this.setStatus("running");
      this.emitEvent({ type: "server_started" });
      this.log("Server started successfully");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.setStatus("error");
      this.emitEvent({
        type: "server_error",
        error: errorMsg,
      });
      throw error;
    }
  }

  /**
   * Stop the Playwright MCP server
   */
  async stopServer(): Promise<void> {
    if (!this.serverProcess) {
      return;
    }

    return new Promise<void>((resolve, _reject) => {
      if (!this.serverProcess) {
        resolve();
        return;
      }

      this.serverProcess.once("close", () => {
        this.serverProcess = null;
        this.setStatus("stopped");
        this.emitEvent({ type: "server_stopped" });
        resolve();
      });

      // Send SIGTERM
      this.serverProcess.kill("SIGTERM");

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.serverProcess) {
          this.log("Force killing server process");
          this.serverProcess.kill("SIGKILL");
        }
      }, 5000);
    });
  }

  /**
   * Subscribe to events
   */
  onEvent(handler: (event: PlaywrightMCPEvent) => void): () => void {
    this.on("playwright-mcp-event", handler);
    return () => this.off("playwright-mcp-event", handler);
  }

  /**
   * Internal: emit an event
   */
  private emitEvent(event: PlaywrightMCPEvent): void {
    this.emit("playwright-mcp-event", event);
  }

  /**
   * Internal: set status and emit event
   */
  private setStatus(status: PlaywrightMCPStatus): void {
    this.status = status;
    this.emitEvent({ type: "status_changed", status });
  }

  /**
   * Internal: log message (only if verbose)
   */
  private log(...args: any[]): void {
    if (this.verbose) {
      console.log("[PlaywrightMCPManager]", ...args);
    }
  }
}
