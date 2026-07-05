import {
    // CDP exports
    CDPClient,
    ChromeLauncher,
    ensurePlaywrightCLICommandInWorkDir,
    fetchCDPWebSocketUrl,
    getPlaywrightCLIEnvVars,
    // Recording exports
    getAvailableModes,
    getConfig,
    getDefaultMode,
    getPlaywrightMCPConfig,
    initConfig,
    killPlaywrightCLIDaemons,
    // Client exports
    JarvisClient,
    resolvePlaywrightCLIEntry,
    type JarvisConfig,
    type JarvisEvent,
    PlaywrightMCPManager,
    type RecordingEvent,
    RecordingManager,
    type RecordingMode,
    resolveProviderConfig,
    saveConfig,
    ScreencastRecorder,
    writePlaywrightCLIConfig,
} from "@promptwright/core";

import { app, BrowserWindow, dialog, ipcMain, nativeImage } from "electron";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  getPackagedCopilotCLIPath,
  resolveCopilotCLIPathFromPATH,
  resolveCopilotPath,
} from "./copilot-cli.js";
import { ProcessSupervisor } from "./process-supervisor.js";
import { evaluatePrerequisites, type PrerequisiteStatus } from "./prerequisites.js";

// Set the application name FIRST before anything else (use kebab-case for path safety)
app.setName("Promptwright");

// Global error handlers to prevent Electron process from crashing on unhandled errors.
// Without these, any unhandled promise rejection (e.g., from MCP subprocess or Copilot SDK
// streaming) will terminate the entire Electron process silently.
process.on("uncaughtException", (error) => {
  console.error("[JARVIS] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[JARVIS] Unhandled promise rejection:", reason);
});

// Enforce single instance — prevents duplicate processes when opening packaged app.
// Without this, macOS can spawn multiple Electron instances (each with GPU/renderer/utility
// subprocesses), all competing for Chrome debug port 9222 and causing a stuck loading screen.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance already holds the lock — quit immediately
  app.quit();
}

// When a second instance is attempted, focus the existing window instead of launching a new one
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find the correct icon path by trying multiple locations
 */
function findIconPath(iconName: string): string | null {
  const possiblePaths = [
    // Development: from dist/main/
    path.join(__dirname, "../../assets", iconName),
    // Alternative: from project root
    path.join(process.cwd(), "assets", iconName),
    // Alternative: from packages/desktop
    path.join(process.cwd(), "packages/desktop/assets", iconName),
  ];

  for (const iconPath of possiblePaths) {
    console.log("Trying icon path:", iconPath);
    if (existsSync(iconPath)) {
      console.log("✓ Found icon at:", iconPath);
      return iconPath;
    }
  }

  console.error("✗ Icon not found. Tried:", possiblePaths);
  return null;
}

let mainWindow: BrowserWindow | null = null;
let jarvisClient: JarvisClient | null = null;
let prerequisiteStatus: PrerequisiteStatus | null = null;
let detectedCopilotModel: string | null = null; // Actual model detected from first usage_update

// Platform detection constants for cross-platform debugging
const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";

// Log platform information for debugging
console.log(`[JARVIS] Platform: ${process.platform} (Windows: ${IS_WINDOWS}, Mac: ${IS_MAC}, Linux: ${IS_LINUX})`);
console.log(`[JARVIS] Process execPath: ${process.execPath}`);
console.log(`[JARVIS] __dirname: ${__dirname}`);
console.log(`[JARVIS] app.isPackaged: ${app.isPackaged}`);
if (app.isReady()) {
  console.log(`[JARVIS] app.getAppPath(): ${app.getAppPath()}`);
}

/**
 * Build MCP servers configuration from persona's requiredMCPs array
 * This allows any persona to specify its required MCP servers dynamically
 * 
 * In packaged mode, we need to use Electron with the resolved path to the 
 * bundled @playwright/mcp instead of `npx` which isn't available.
 * 
 * Enhanced with extensive Windows debugging to diagnose MCP connection issues.
 */
function buildMCPServersConfig(
  requiredMCPs: Array<{
    id: string;
    packageName: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>
): Record<string, any> {
  const mcpServers: Record<string, any> = {};
  const isPackaged = app.isPackaged;
  const platform = process.platform;

  console.log(`[JARVIS MCP] Building MCP config for platform: ${platform}, packaged: ${isPackaged}`);

  for (const mcp of requiredMCPs) {
    let command = mcp.command;
    let args = [...(mcp.args || [])];

    // In packaged mode, replace npx commands with direct node execution
    if (isPackaged && mcp.command === "npx" && mcp.packageName === "@playwright/mcp") {
      console.log(`[JARVIS MCP] Configuring ${mcp.id} for packaged mode on ${platform}`);

      try {
        // Step 1: Resolve MCP CLI path (ESM-compatible — no require.resolve)
        console.log(`[JARVIS MCP] Attempting to resolve @playwright/mcp/cli.js...`);
        const appPath = app.getAppPath();
        const mcpCliPath = path.join(appPath, "node_modules", "@playwright", "mcp", "cli.js");
        console.log(`[JARVIS MCP] ✓ Resolved MCP CLI path: ${mcpCliPath}`);

        // Step 2: Verify file exists
        const fileExists = existsSync(mcpCliPath);
        console.log(`[JARVIS MCP] File exists check: ${fileExists}`);

        if (!fileExists) {
          console.error(`[JARVIS MCP] ✗ ERROR: MCP CLI file does not exist at resolved path!`);
          throw new Error(`MCP CLI not found at ${mcpCliPath}`);
        }

        // Step 3: Get app path and check ASAR status
        const isInAsar = mcpCliPath.includes('.asar');
        console.log(`[JARVIS MCP] App path: ${appPath}`);
        console.log(`[JARVIS MCP] MCP CLI in ASAR: ${isInAsar}`);

        // Step 4: Build command that runs Electron binary as Node.js
        //
        // The copilot CLI binary ignores the `env` field from the MCP server
        // config when spawning subprocesses. Without ELECTRON_RUN_AS_NODE=1,
        // the Electron binary launches as a full GUI app, corrupting the
        // JSON-RPC stdio protocol with startup logs.
        //
        // Solution: Use /usr/bin/env (macOS/Linux) or cmd.exe (Windows) as the
        // command to inject ELECTRON_RUN_AS_NODE=1 into the process environment
        // before exec'ing the Electron binary.
        const electronPath = process.execPath;
        console.log(`[JARVIS MCP] Electron execPath: ${electronPath}`);

        // Collect extra args (like --cdp-endpoint) before building the command
        const originalArgs = mcp.args || [];
        const extraArgs = originalArgs.slice(1); // Skip the package name
        if (extraArgs.length > 0) {
          console.log(`[JARVIS MCP] Extra args: ${JSON.stringify(extraArgs)}`);
        }

        if (platform === "win32") {
          // Windows: use cmd /c to set env var and run Electron in one shell command.
          // All args must be inside the single cmd /c string.
          const allArgs = [mcpCliPath, ...extraArgs].map(a => `"${a}"`).join(" ");
          command = "cmd";
          args = ["/c", `set ELECTRON_RUN_AS_NODE=1 && "${electronPath}" ${allArgs}`];
        } else {
          // macOS/Linux: use /usr/bin/env to set the var and exec Electron.
          // Each arg is a separate array element — env handles this correctly.
          command = "/usr/bin/env";
          args = ["ELECTRON_RUN_AS_NODE=1", electronPath, mcpCliPath, ...extraArgs];
        }

        console.log(`[JARVIS MCP] Command: ${command}`);
        console.log(`[JARVIS MCP] Args: ${JSON.stringify(args)}`);
        console.log(`[JARVIS MCP] ✓ MCP config complete for ${mcp.id}`);
        console.log(`[JARVIS MCP] Final command: ${command} ${args.join(" ")}`);

      } catch (err) {
        console.error(`[JARVIS MCP] ✗✗✗ CRITICAL ERROR: Failed to resolve @playwright/mcp path`);
        console.error(`[JARVIS MCP] Error type: ${err instanceof Error ? err.constructor.name : typeof err}`);
        console.error(`[JARVIS MCP] Error message: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`[JARVIS MCP] Error stack:`, err instanceof Error ? err.stack : 'N/A');

        // Additional Windows-specific diagnostics
        if (platform === "win32") {
          console.error(`[JARVIS MCP] Windows-specific diagnostics:`);
          console.error(`[JARVIS MCP]   - CWD: ${process.cwd()}`);
          console.error(`[JARVIS MCP]   - app.getPath('exe'): ${app.getPath('exe')}`);
          console.error(`[JARVIS MCP]   - app.getPath('userData'): ${app.getPath('userData')}`);

          // Try to list what's in node_modules
          try {
            const nodeModulesPath = path.join(app.getAppPath(), 'node_modules', '@playwright');
            console.error(`[JARVIS MCP]   - Checking ${nodeModulesPath}`);
            if (existsSync(nodeModulesPath)) {
              const contents = readdirSync(nodeModulesPath);
              console.error(`[JARVIS MCP]   - @playwright folder contents: ${contents.join(', ')}`);
            } else {
              console.error(`[JARVIS MCP]   - @playwright folder does not exist!`);
            }
          } catch (listErr) {
            console.error(`[JARVIS MCP]   - Failed to list node_modules:`, listErr);
          }
        }

        // Fall back to npx (will likely fail, but provides better error message)
        console.error(`[JARVIS MCP] Falling back to npx (will likely fail on Windows)`);
      }
    }

    const config: any = {
      type: "local",
      command,
      args,
      env: {
        ...process.env,
        ...(mcp.env || {}),
      },
      tools: ["*"], // Include all tools from the server
    };

    mcpServers[mcp.id] = config;

    // Log a sanitized summary (do NOT print env values).
    console.log(
      `[JARVIS MCP] Final config for ${mcp.id}: command=${config.command}, args=${JSON.stringify(config.args)}, tools=${JSON.stringify(config.tools)}`
    );
  }

  console.log(`[JARVIS MCP] Total MCP servers configured: ${Object.keys(mcpServers).length}`);
  return mcpServers;
}
let activeSystemPrompt: string | null = null;
let playwrightMCPManager: PlaywrightMCPManager | null = null;
let recordingManager: RecordingManager | null = null;
let processSupervisor: ProcessSupervisor | null = null;

// Execution recording management
let chromeLauncher: ChromeLauncher | null = null;
let trackedChromePid: number | null = null;

// Client initialization lock to prevent concurrent initializations
let isInitializing = false;

// Monotonically increasing version counter for client initialization.
// Both initializeClient() and reconfigureForApiIntent() increment this at the start.
// Before assigning jarvisClient, they check if their version is still current.
// If a newer initialization started in the meantime, the stale one bails out.
let clientInitVersion = 0;
let isQuitting = false;
let cleanupInFlight: Promise<void> | null = null;
let cdpClient: CDPClient | null = null;
let screencastRecorder: ScreencastRecorder | null = null;
let currentRecordingPath: string | null = null;
let appIconPath: string | null = null;

const CHROME_DEBUG_PORT = 9222;
const PREREQUISITES_CACHE_FILE = "prerequisites.json";
const COMMON_PATH_SEGMENTS_MAC = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

/**
 * Get common Windows PATH segments for Node.js and npm.
 * Returns paths that exist on the filesystem.
 */
function getWindowsCommonPaths(): string[] {
  const segments: string[] = [];
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;

  // npm global binaries
  if (appData) {
    segments.push(path.join(appData, "npm"));
  }

  // Node.js install locations
  if (programFiles) {
    segments.push(path.join(programFiles, "nodejs"));
  }
  if (localAppData) {
    segments.push(path.join(localAppData, "Programs", "nodejs"));
  }

  return segments;
}

/**
 * Merge PATH strings while preserving order and deduplicating entries.
 * Cross-platform: uses path.delimiter (: on Unix, ; on Windows).
 */
function mergePathLists(...pathValues: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  const delimiter = path.delimiter;

  for (const value of pathValues) {
    if (!value) continue;
    for (const segment of value.split(delimiter)) {
      const trimmed = segment.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
  }

  return merged.join(delimiter);
}

async function resolveCopilotCLIPathForRuntime(
  copilotCliPathOverride?: string
): Promise<string | undefined> {
  if (app.isPackaged) {
    const packagedCliPath = getPackagedCopilotCLIPath(app.getAppPath());
    if (existsSync(packagedCliPath)) {
      console.log(`[JARVIS] Using native Copilot CLI binary (packaged): ${packagedCliPath}`);
      return packagedCliPath;
    }

    console.warn(
      `[JARVIS] Packaged Copilot CLI binary missing at expected path: ${packagedCliPath}`
    );
  }

  if (copilotCliPathOverride) {
    const resolvedOverride = await resolveCopilotPath(copilotCliPathOverride);
    if (resolvedOverride) {
      console.log(`[JARVIS] Using Copilot CLI from configured override: ${resolvedOverride}`);
      return resolvedOverride;
    }

    console.warn(
      `[JARVIS] Configured copilotCliPath is invalid, skipping: ${copilotCliPathOverride}`
    );
  }

  const resolvedPath = resolveCopilotCLIPathFromPATH();
  if (resolvedPath) {
    const mode = app.isPackaged ? "packaged fallback" : "dev";
    console.log(`[JARVIS] Using Copilot CLI from PATH (${mode}): ${resolvedPath}`);
    return resolvedPath;
  }

  return undefined;
}

async function preparePlaywrightCLICommandRuntime(
  workDir: string
): Promise<Record<string, string | undefined>> {
  const cdpHttpEndpoint = `http://localhost:${CHROME_DEBUG_PORT}`;
  let cdpEndpoint = cdpHttpEndpoint;

  try {
    cdpEndpoint = await fetchCDPWebSocketUrl(cdpHttpEndpoint);
  } catch (error) {
    console.warn("[JARVIS] Failed to fetch WS URL, falling back to HTTP:", error);
  }

  const cliEntryPath = resolvePlaywrightCLIEntry({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
  });
  await ensurePlaywrightCLICommandInWorkDir(workDir, cliEntryPath);
  await writePlaywrightCLIConfig(cdpEndpoint, workDir);
  await killPlaywrightCLIDaemons({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
  });

  return {
    ...getPlaywrightCLIEnvVars(cdpEndpoint),
    PATH: mergePathLists(workDir, process.env.PATH),
  };
}

/**
 * Finder/Explorer launches can miss shell PATH/custom env.
 * Normalize process env early so Copilot SDK + MCP child processes are stable.
 */
function normalizeLaunchEnvironment(): void {
  const shouldNormalize = (IS_MAC || IS_WINDOWS) && app.isPackaged;
  if (!shouldNormalize) {
    return;
  }

  const originalPath = process.env.PATH || "";
  const delimiter = path.delimiter;
  const originalPathCount = originalPath.split(delimiter).filter(Boolean).length;

  console.log(
    `[JARVIS ENV] Platform: ${process.platform}, packaged: ${app.isPackaged}, normalization: starting`
  );

  let mergedPath = originalPath;
  let normalizationRan = false;

  if (IS_MAC) {
    // macOS: read login shell PATH
    const shell = process.env.SHELL || "/bin/zsh";
    let shellPath = "";

    try {
      // Login shell gives us the same PATH users get in Terminal.
      shellPath = execFileSync(shell, ["-ilc", "printf %s \"$PATH\""], {
        encoding: "utf8",
        env: {
          ...process.env,
          TERM: "dumb",
        },
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch (error) {
      console.warn("[JARVIS ENV] Could not read login shell PATH:", error);
    }

    mergedPath = mergePathLists(
      originalPath,
      shellPath,
      COMMON_PATH_SEGMENTS_MAC.join(delimiter)
    );

    process.env.HOME = process.env.HOME || app.getPath("home");
    process.env.SHELL = process.env.SHELL || shell;
    process.env.LANG = process.env.LANG || "en_US.UTF-8";
    normalizationRan = true;
  } else if (IS_WINDOWS) {
    // Windows: add common Node.js and npm paths
    const windowsPaths = getWindowsCommonPaths();
    const windowsPathsStr = windowsPaths.join(delimiter);

    mergedPath = mergePathLists(originalPath, windowsPathsStr);
    normalizationRan = true;

    // Log presence of key Windows segments for debugging
    const hasNpmPath = windowsPaths.some((p) => p.includes("npm"));
    const hasNodejsPath = windowsPaths.some((p) => p.includes("nodejs"));
    console.log(
      `[JARVIS ENV] Windows PATH segments: npm=${hasNpmPath}, nodejs=${hasNodejsPath}, count=${windowsPaths.length}`
    );
  }

  if (normalizationRan) {
    process.env.PATH = mergedPath;
    const mergedPathCount = mergedPath.split(delimiter).filter(Boolean).length;

    console.log(
      `[JARVIS ENV] Launch environment normalized for packaged ${IS_MAC ? "macOS" : "Windows"}`
    );
    console.log(
      `[JARVIS ENV] PATH entries: ${originalPathCount} -> ${mergedPathCount}`
    );

    // Verify copilot detection after PATH normalization
    try {
      const copilotCheck = spawnSync("copilot", ["--version"], {
        encoding: "utf8",
        env: process.env,
        timeout: 3000,
      });
      if (copilotCheck.status === 0) {
        console.log("[JARVIS ENV] Copilot CLI detected:", copilotCheck.stdout.trim());
      } else {
        console.warn(
          "[JARVIS ENV] Copilot CLI check failed:",
          copilotCheck.stderr?.trim() || `exit=${copilotCheck.status}`
        );
      }
    } catch (error) {
      console.warn("[JARVIS ENV] Copilot CLI check threw:", error);
    }
  }
}

/**
 * Create the main application window
 */
function createWindow(): void {
  // Determine preload script path based on environment
  const preloadPath =
    process.env.NODE_ENV === "development"
      ? path.join(__dirname, "../../src/preload.js")
      : path.join(__dirname, "../preload.js");

  // Determine icon filename based on platform
  // Note: Using PNG for all platforms as it's more reliable
  // The .icns/.ico are for production builds only
  const iconName = "icon.png";

  console.log("Platform:", process.platform);
  console.log("__dirname:", __dirname);
  console.log("process.cwd():", process.cwd());

  const iconPath = findIconPath(iconName);
  appIconPath = iconPath; // Store globally for dialog use

  // Set dock icon for macOS (must be set before window creation)
  if (iconPath && process.platform === "darwin" && app.dock) {
    try {
      const icon = nativeImage.createFromPath(iconPath);
      console.log("Icon size:", icon.getSize());
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
        console.log("✓ Dock icon set successfully");
      } else {
        console.error("✗ Icon image is empty");
      }
    } catch (error) {
      console.error("✗ Failed to set dock icon:", error);
    }
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Promptwright",
    icon: iconPath || undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#FFFFFF",
  });

  // Set Content Security Policy
  // Skip CSP for file:// URLs to allow recording playback with inline scripts
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      // Don't apply CSP to file:// URLs (allows recording HTML to work)
      if (details.url.startsWith("file://")) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            process.env.NODE_ENV === "development"
              ? // Development: Allow Vite dev server requirements + data URIs for screenshots + file: for recordings
              "default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: http://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; frame-src 'self' file:;"
              : // Production: Strict CSP with file: for recording playback
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; frame-src 'self' file:;",
          ],
        },
      });
    }
  );

  // Load the app
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5273");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  // Windows-specific: Add diagnostic logging in browser console
  mainWindow.webContents.on('did-finish-load', () => {
    if (IS_WINDOWS) {
      mainWindow!.webContents.executeJavaScript(`
        console.log("[JARVIS RENDERER] === WINDOWS DIAGNOSTICS ===");
        console.log("[JARVIS RENDERER] Platform: Windows");
        console.log("[JARVIS RENDERER] User Agent:", navigator.userAgent);
        console.log("[JARVIS RENDERER] If you see 'bash' tools instead of 'playwright_navigate', 'playwright_click', etc. in execution logs, MCP is not connected");
        console.log("[JARVIS RENDERER] Check Electron console (View → Toggle Developer Tools → Console tab) for [JARVIS MCP] errors");
      `);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Initialize recording manager
 */
function initializeRecordingManager(): void {
  recordingManager = new RecordingManager();

  // Forward recording events to renderer
  recordingManager.onEvent((event: RecordingEvent) => {
    console.log("[JARVIS IPC] Forwarding recording event to renderer:", event.type, 
      event.type === "state_changed" ? `(state: ${(event as any).status?.state})` : "");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("recording-event", event);
    }
  });
}

/**
 * Initialize Playwright MCP manager
 */
function initializePlaywrightMCP(): void {
  // Pass isPackaged flag so the manager knows whether to use bundled package or npx
  playwrightMCPManager = new PlaywrightMCPManager({
    verbose: true,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });

  console.log(`[JARVIS] PlaywrightMCPManager initialized with isPackaged=${app.isPackaged}`);

  // Forward MCP events to renderer
  playwrightMCPManager.onEvent((event: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("playwright-mcp-event", event);
    }
  });
}

/**
 * Initialize execution recording components
 */
function initializeExecutionRecording(): void {
  chromeLauncher = new ChromeLauncher();
  cdpClient = new CDPClient();

  chromeLauncher.onEvent((event) => {
    if (!processSupervisor) {
      return;
    }

    if (event.type === "started") {
      trackedChromePid = event.pid;
      void processSupervisor.registerProcess(event.pid, "chrome-debugger", "Chrome remote debug process");
    } else if (event.type === "stopped" && trackedChromePid) {
      void processSupervisor.unregisterProcess(trackedChromePid);
      trackedChromePid = null;
    }
  });

  // Create recordings directory in app data (persists across app updates)
  const recordingsDir = path.join(app.getPath("userData"), "recordings");
  screencastRecorder = new ScreencastRecorder({
    outputDir: recordingsDir,
    maxWidth: 1280, // Match viewport width
    maxHeight: 720, // Match viewport height
    everyNthFrame: 3,
    quality: 50,
    frameDelay: 100,
    // Stream frames to renderer in real-time
    frameCallback: (frame: { data: string; metadata: any; timestamp: number }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('execution:screencast-frame', {
          data: frame.data,
          timestamp: frame.timestamp,
        });
      }
    },
  });

  console.log("[ExecutionRecording] Initialized with recordings dir:", recordingsDir);
}

function assertPrerequisitesPassed(): void {
  if (!prerequisiteStatus?.passed) {
    throw new Error("App prerequisites are not met. Complete setup to continue.");
  }
}

async function runPrerequisiteChecks(force = false): Promise<PrerequisiteStatus> {
  const userDataPath = app.getPath("userData");
  const cachePath = path.join(userDataPath, PREREQUISITES_CACHE_FILE);
  prerequisiteStatus = await evaluatePrerequisites({
    cachePath,
    force,
  });

  console.log(
    `[JARVIS] Prerequisite check (${force ? "forced" : "startup"}) -> passed=${prerequisiteStatus.passed}, cached=${prerequisiteStatus.cached}`
  );
  return prerequisiteStatus;
}

/**
 * Initialize JARVIS client with given working directory.
 * Always uses orchestrator mode — the orchestrator routes to the right agent.
 */
async function initializeClient(
  workDir: string,
  copilotSessionId?: string
): Promise<void> {
  // Guard against concurrent initializations (fixes double-click race condition)
  if (isInitializing) {
    console.log("[JARVIS] Already initializing, waiting for completion...");
    const maxWait = 10000;
    const startTime = Date.now();
    while (isInitializing && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isInitializing) {
      console.error("[JARVIS] Initialization timeout - forcing unlock");
      isInitializing = false;
      throw new Error("Client initialization timeout");
    }
    console.log("[JARVIS] Previous initialization complete, re-initializing with updated config");
  }

  isInitializing = true;
  const myInitVersion = ++clientInitVersion;

  try {
    console.log(`[JARVIS] ==========================================`);
    console.log(`[JARVIS] Initializing client (orchestrator mode)`);
    console.log(`[JARVIS] workDir: ${workDir}`);
    console.log(`[JARVIS] copilotSessionId: ${copilotSessionId || 'new'}`);
    console.log(`[JARVIS] jarvisClient exists: ${jarvisClient !== null}`);
    console.log(`[JARVIS] app.isPackaged: ${app.isPackaged}`);
    console.log(`[JARVIS] ==========================================`);

    detectedCopilotModel = null; // Reset detected model on reinit

    // Stop existing client if any
    if (jarvisClient) {
      console.log("[JARVIS] Stopping existing client...");
      try {
        await jarvisClient.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("[JARVIS] Error stopping previous client:", error);
      }

      if (myInitVersion !== clientInitVersion) {
        console.log("[JARVIS] Initialization superseded during client stop, bailing out");
        return;
      }

      jarvisClient = null;
    }

    const config = getConfig();
    const orchConfig = config.orchestrator;
    const automationMode = config.browser?.automationMode || "playwright-mcp";
    activeSystemPrompt = null;

    console.log("[JARVIS] ========== Creating Jarvis client (orchestrator) ==========");

    // Build provider config (BYOK). Layers env vars over config.yaml so the app
    // can run login-less from env alone (e.g. zero-cost local Ollama), and so all
    // provider fields (bearerToken, wireApi, headers, ...) are passed through.
    const providerOption = resolveProviderConfig(config.provider);

    // Runtime: with a BYOK provider, use the SDK's BUNDLED Copilot runtime (login-less,
    // version-matched). Forcing the externally-installed `copilot` CLI here caused a
    // SDK/CLI version mismatch that broke the tool permission protocol ("Unhandled
    // permission result kind"). Only fall back to the external CLI for the
    // Copilot-login path (no BYOK provider).
    const cliPath = providerOption
      ? undefined
      : await resolveCopilotCLIPathForRuntime(config.copilotCliPath);
    const defaultCommandEnv = {
      PATH: mergePathLists(workDir, process.env.PATH),
    };
    let pwCliCommandEnv: Record<string, string | undefined> | undefined;

    if (automationMode === "playwright-cli") {
      pwCliCommandEnv = await preparePlaywrightCLICommandRuntime(workDir);
    }

    if (myInitVersion !== clientInitVersion) {
      console.log("[JARVIS] Initialization superseded by newer init, bailing out");
      return;
    }

    // With a BYOK provider, the orchestrator's route_to_agent / built-in tools
    // are unreliable (the model's tool calls fail), so for web automation we go
    // straight to the matching web agent via directAgent. This spawns the
    // sub-agent directly (the proven-working path) and uses its custom
    // run_command tool. Copilot-login (no provider) keeps full orchestrator routing.
    const directWebAgent = providerOption
      ? automationMode === "playwright-cli"
        ? "pw-cli-agent"
        : "pw-mcp-agent"
      : undefined;

    jarvisClient = new JarvisClient({
      workDir,
      verbose: true,
      copilotSessionId,
      cliPath,
      // Always use orchestrator mode
      useOrchestrator: true,
      directAgent: directWebAgent,
      orchestratorModel: orchConfig?.model,
      reasoningEffort: orchConfig?.reasoningEffort,
      automationMode,
      agentOverrides: config.agents,
      provider: providerOption,
      getAgentRuntimeContext: (agentName: string) => {
        if (agentName === "api-test-agent") {
          return { workDir, env: defaultCommandEnv, useCommandTool: true };
        }

        if (agentName === "pw-cli-agent" && pwCliCommandEnv) {
          return { workDir, env: pwCliCommandEnv, useCommandTool: true };
        }

        return undefined;
      },
      getMCPOverrides: () => {
        const latestConfig = getConfig();
        const cdpEndpoint = `http://localhost:${CHROME_DEBUG_PORT}`;
        const headlessEnv = latestConfig.browser.headless ? "true" : "false";
        const playwrightMCP = getPlaywrightMCPConfig(cdpEndpoint);
        return buildMCPServersConfig([{
          ...playwrightMCP,
          env: { ...playwrightMCP.env, PLAYWRIGHT_HEADLESS: headlessEnv },
        }]);
      },
    });

    // Forward events to renderer
    jarvisClient.onEvent((event: JarvisEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("jarvis-event", event);

        if (event.type === 'usage_update') {
          mainWindow.webContents.send('session:usage-update', event.data);
          // Capture the real model name from the first response (Copilot default may not appear in listModels)
          if (event.data.model && !detectedCopilotModel) {
            detectedCopilotModel = event.data.model;
            console.log(`[JARVIS] Detected active Copilot model: ${detectedCopilotModel}`);
          }
        }
      }
    });

    console.log("[JARVIS] ========== Starting Jarvis client session ==========");

    try {
      await jarvisClient.start();

      if (myInitVersion !== clientInitVersion) {
        console.log("[JARVIS] Initialization superseded after start(), stopping stale client");
        try { await jarvisClient.stop(); } catch { /* ignore */ }
        jarvisClient = null;
        return;
      }

      console.log("[JARVIS] ✓ Client session started successfully");
    } catch (startError) {
      console.error("[JARVIS] ✗ ERROR starting client session:");
      console.error("[JARVIS] Error:", startError instanceof Error ? startError.message : String(startError));

      if (mainWindow && !mainWindow.isDestroyed()) {
        const errorMsg = startError instanceof Error ? startError.message : String(startError);
        mainWindow.webContents.executeJavaScript(`console.error("[MAIN PROCESS] ✗ Error starting Copilot session: ${errorMsg.replace(/"/g, '\\"')}")`);
      }

      throw startError;
    }

    console.log("[JARVIS] ✓ Client initialized and ready");
    const sessionId = jarvisClient.getCopilotSessionId();
    console.log(`[JARVIS] Copilot session ID: ${sessionId}`);
  } finally {
    isInitializing = false;
  }
}

async function cleanupRuntimeResources(reason: string): Promise<void> {
  if (cleanupInFlight) {
    return cleanupInFlight;
  }

  cleanupInFlight = (async () => {
    console.log(`[JARVIS] Starting runtime cleanup (${reason})...`);

    if (jarvisClient) {
      console.log("[JARVIS] Stopping JarvisClient...");
      try {
        await jarvisClient.stop();
      } catch (error) {
        console.error("[JARVIS] Error stopping client:", error);
      }
      jarvisClient = null;
    }

    if (processSupervisor) {
      try {
        const cleaned = await processSupervisor.cleanupPlaywrightMcpProcesses();
        if (cleaned > 0) {
          console.log(`[JARVIS] Cleaned ${cleaned} orphan MCP process(es)`);
        }
      } catch (error) {
        console.error("[JARVIS] Error cleaning MCP processes:", error);
      }

      try {
        await processSupervisor.terminateTrackedProcesses();
      } catch (error) {
        console.error("[JARVIS] Error terminating tracked processes:", error);
      }
    }

    if (chromeLauncher) {
      console.log("[JARVIS] Killing Chrome browser on port", CHROME_DEBUG_PORT);
      try {
        await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
      } catch (error) {
        console.log("[JARVIS] No Chrome to kill");
      }
    }

    // Kill playwright-cli sessions if in CLI mode
    const currentConfig = getConfig();
    if (currentConfig.browser.automationMode === 'playwright-cli') {
      console.log("[JARVIS] Cleaning up playwright-cli sessions...");
      await killPlaywrightCLIDaemons({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
      });
    }
  })();

  try {
    await cleanupInFlight;
  } finally {
    cleanupInFlight = null;
  }
}

// App lifecycle
app.whenReady().then(async () => {
  // Normalize env first so all downstream child processes inherit stable values.
  normalizeLaunchEnvironment();

  try {
    await runPrerequisiteChecks(false);
  } catch (error) {
    console.error("[JARVIS] Prerequisite checks failed unexpectedly:", error);
    prerequisiteStatus = {
      checkedAt: Date.now(),
      cached: false,
      passed: false,
      node: { ok: false, message: "Prerequisite check failed unexpectedly." },
      copilotCli: { ok: false, message: "Prerequisite check failed unexpectedly." },
      copilotAuth: { ok: false, message: "Prerequisite check failed unexpectedly." },
      fixCommands: [
        "node --version",
        "npm --version",
        "npm install -g @github/copilot",
        "copilot auth login",
      ],
    };
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (!prerequisiteStatus?.passed) {
    console.log("[JARVIS] Startup blocked: prerequisites are not met.");
  }

  const userDataPath = app.getPath("userData");
  processSupervisor = new ProcessSupervisor({
    registryPath: path.join(userDataPath, "process-supervisor.json"),
    verbose: true,
  });
  await processSupervisor.initialize();

  // Reap tracked processes from previous unclean exits.
  try {
    await processSupervisor.reapStaleFromPreviousRun();
  } catch (error) {
    console.error("[JARVIS] Failed to reap stale tracked processes:", error);
  }

  // Cleanup orphan MCP processes from previous runs.
  try {
    const cleaned = await processSupervisor.cleanupPlaywrightMcpProcesses();
    if (cleaned > 0) {
      console.log(`[JARVIS] Startup cleanup removed ${cleaned} orphan MCP process(es)`);
    }
  } catch (error) {
    console.error("[JARVIS] Failed to cleanup orphan MCP processes:", error);
  }

  // Kill any Chrome process on the debug port from previous sessions
  // This handles force quit scenarios where cleanup handlers didn't run
  console.log("[JARVIS] Checking for stale Chrome processes on port", CHROME_DEBUG_PORT);
  try {
    const tempLauncher = new ChromeLauncher();
    await tempLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
    console.log("[JARVIS] ✓ Cleaned up stale Chrome processes");
  } catch (error) {
    console.log("[JARVIS] No stale Chrome processes found");
  }

  // Initialize remaining managers
  initializePlaywrightMCP();
  initializeRecordingManager();
  initializeExecutionRecording();

  // Initialize configuration with userData path
  console.log(`[JARVIS] Initializing config with userData: ${userDataPath}`);
  const config = initConfig(userDataPath);
  console.log(`[JARVIS] Config loaded (sections): ${Object.keys(config).join(", ")}`);

  // Migrate legacy sessions (delete those without Copilot session IDs)
  try {
    const sessionsDir = path.join(userDataPath, "sessions");
    const sessionFiles = await fs.readdir(sessionsDir).catch(() => []);
    let legacyCount = 0;
    
    for (const file of sessionFiles) {
      if (file.endsWith(".json")) {
        try {
          const sessionPath = path.join(sessionsDir, file);
          const data = await fs.readFile(sessionPath, "utf-8");
          const session = JSON.parse(data);
          
          // Check if session has copilotSessionId
          if (!session.copilotSessionId) {
            console.log(`[JARVIS Migration] Deleting legacy session: ${session.id || file}`);
            await fs.unlink(sessionPath);
            
            // Also delete associated recording if exists
            if (session.executionData?.recordingPath) {
              try {
                await fs.unlink(session.executionData.recordingPath);
              } catch (err) {
                // Recording may not exist
              }
            }
            legacyCount++;
          }
        } catch (err) {
          console.error(`[JARVIS Migration] Error processing session ${file}:`, err);
        }
      }
    }
    
    if (legacyCount > 0) {
      console.log(`[JARVIS Migration] Deleted ${legacyCount} legacy session(s)`);
    } else {
      console.log("[JARVIS Migration] No legacy sessions found");
    }
  } catch (error) {
    console.error("[JARVIS Migration] Migration failed:", error);
  }

  // CRITICAL: Add delay to ensure all async initialization completes
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log("[JARVIS] ✓ App fully ready, accepting initialization requests");
});

app.on("window-all-closed", async () => {
  console.log("[JARVIS] All windows closed, cleaning up resources...");
  await cleanupRuntimeResources("window-all-closed");

  // On macOS, app stays running in dock; on other platforms, quit
  if (process.platform !== "darwin") {
    app.quit();
  } else {
    console.log("[JARVIS] macOS: App will stay running in background (dock)");
  }
});

// Handle app quit (Cmd+Q on macOS, or from dock menu)
app.on("before-quit", async (event) => {
  if (isQuitting) {
    return;
  }

  console.log("[JARVIS] App quitting, performing cleanup...");

  // Prevent default quit to perform async cleanup
  event.preventDefault();
  isQuitting = true;
  await cleanupRuntimeResources("before-quit");
  console.log("[JARVIS] Cleanup complete, exiting...");

  // Now actually quit
  app.exit(0);
});

// IPC Handlers

// ==================
// Configuration IPC Handlers
// ==================

/**
 * Get current configuration
 */
ipcMain.handle("config:get", () => {
  return getConfig();
});

/**
 * Update configuration
 */
ipcMain.handle("config:set", async (_, patch: Partial<JarvisConfig>) => {
  const userDataPath = app.getPath("userData");
  saveConfig(patch, userDataPath);
  return getConfig();
});

/**
 * Update configuration and apply model changes without restart
 */
ipcMain.handle("config:set-and-apply", async (_, patch: Partial<JarvisConfig>) => {
  const userDataPath = app.getPath("userData");
  const oldConfig = getConfig();
  saveConfig(patch, userDataPath);
  const newConfig = getConfig();

  // Reinitialize if orchestrator model, reasoning effort, or automation mode changed
  if (jarvisClient || isInitializing) {
    const oldOrcModel = oldConfig.orchestrator?.model;
    const newOrcModel = newConfig.orchestrator?.model;
    const oldReasoningEffort = oldConfig.orchestrator?.reasoningEffort;
    const newReasoningEffort = newConfig.orchestrator?.reasoningEffort;
    const oldAutomationMode = oldConfig.browser?.automationMode || 'playwright-mcp';
    const newAutomationMode = newConfig.browser?.automationMode || 'playwright-mcp';
    const oldProvider = JSON.stringify(oldConfig.provider || null);
    const newProvider = JSON.stringify(newConfig.provider || null);

    if (oldOrcModel !== newOrcModel || oldReasoningEffort !== newReasoningEffort || oldAutomationMode !== newAutomationMode || oldProvider !== newProvider) {
      console.log(`[JARVIS] Config changed (model: ${oldOrcModel || "default"} -> ${newOrcModel || "default"}, effort: ${oldReasoningEffort || "none"} -> ${newReasoningEffort || "none"}, mode: ${oldAutomationMode} -> ${newAutomationMode}, provider: ${oldProvider !== newProvider ? "changed" : "same"}), reinitializing...`);
      const workDir = app.getPath("home");
      await initializeClient(workDir);
    }
  }

  return newConfig;
});

/**
 * Get user data path (for debugging)
 */
ipcMain.handle("config:get-path", () => {
  return app.getPath("userData");
});

// ==================
// JARVIS Core IPC Handlers
// ==================

// ==================
// Models IPC Handlers
// ==================

/**
 * Get current prerequisite status for startup gating UI.
 */
ipcMain.handle("prereq:get-status", async () => {
  if (!prerequisiteStatus) {
    return await runPrerequisiteChecks(false);
  }
  return prerequisiteStatus;
});

/**
 * Run prerequisite checks on demand (manual recheck from UI).
 */
ipcMain.handle("prereq:run-check", async () => {
  return await runPrerequisiteChecks(true);
});

/**
 * Pick Copilot CLI executable file via file picker dialog.
 */
ipcMain.handle("prereq:pick-copilot-file", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Copilot CLI Executable",
    buttonLabel: "Select",
    properties: ["openFile"],
    filters: [
      { name: "Executable", extensions: process.platform === "win32" ? ["exe"] : ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * Pick Copilot CLI installation folder via folder picker dialog.
 */
ipcMain.handle("prereq:pick-copilot-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select Copilot CLI Installation Folder",
    buttonLabel: "Select",
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * Validate a Copilot CLI path by attempting to run it.
 * @returns { valid: boolean, version?: string, error?: string }
 */
ipcMain.handle("prereq:validate-copilot-path", async (_, pickedPath: string) => {
  try {
    const execPath = await resolveCopilotPath(pickedPath);
    if (!execPath) {
      return {
        valid: false,
        error: "Invalid Copilot CLI path. Select the executable or a folder containing it.",
      };
    }

    const result = spawnSync(execPath, ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    
    if (result.error || result.status !== 0) {
      return {
        valid: false,
        error: result.error?.message || result.stderr || "Failed to execute copilot --version",
      };
    }
    
    return {
      valid: true,
      version: result.stdout.trim(),
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

/**
 * Save Copilot CLI path override to config and re-run prereqs.
 */
ipcMain.handle("prereq:save-copilot-path", async (_, copilotPath: string) => {
  const userDataPath = app.getPath("userData");
  saveConfig({ copilotCliPath: copilotPath }, userDataPath);
  console.log(`[JARVIS] Saved Copilot CLI override path: ${copilotPath}`);
  
  // Re-run prerequisite checks with new config
  return await runPrerequisiteChecks(true);
});

/**
 * List available models from Copilot SDK
 */
ipcMain.handle("models:list", async () => {
  try {
    // If a custom provider is configured (config or env), return its model at the top
    const config = getConfig();
    const resolvedProvider = resolveProviderConfig(config.provider);
    if (resolvedProvider) {
      const providerModel = {
        id: resolvedProvider.model,
        name: resolvedProvider.displayName || `${resolvedProvider.type}: ${resolvedProvider.model}`,
        isDefault: false,
        supportsReasoningEffort: false,
        supportedReasoningEfforts: [],
      };
      // Still list Copilot models alongside provider model
      let copilotModels: any[] = [];
      if (jarvisClient) {
        copilotModels = await jarvisClient.listModels();
      }
      const ids = new Set(copilotModels.map((m: any) => m.id));
      if (!ids.has(providerModel.id)) {
        return [providerModel, ...copilotModels];
      }
      return copilotModels;
    }

    if (jarvisClient) {
      // Use existing client if available
      return await jarvisClient.listModels();
    }

    // Create a temporary client to list models
    console.log("[JARVIS] Creating temporary client to list models...");
    const tempClient = new JarvisClient({ verbose: false });
    try {
      await tempClient.start();
      const models = await tempClient.listModels();
      await tempClient.stop();
      console.log(`[JARVIS] Listed ${models.length} available models`);
      return models;
    } catch (error) {
      console.error("[JARVIS] Failed to list models:", error);
      await tempClient.stop();
      return [];
    }
  } catch (error) {
    console.error("[JARVIS] Failed to list models:", error);
    return [];
  }
});

/**
 * Get active model for current session
 * Returns the orchestrator model from config or detected default
 */
ipcMain.handle("models:get-active", async () => {
  if (!jarvisClient) {
    return null;
  }

  const config = getConfig();
  if (config.orchestrator?.model) {
    return config.orchestrator.model;
  }

  // Return detected model from first usage_update (most accurate), then fall back
  return detectedCopilotModel || jarvisClient.getActiveModel();
});



/**
 * Send a message to JARVIS
 */
ipcMain.handle("jarvis:send-message", async (_, prompt: string) => {
  assertPrerequisitesPassed();

  // Safety net: if client is still initializing, wait for it
  if (!jarvisClient && isInitializing) {
    const maxWait = 30000;
    const start = Date.now();
    while (!jarvisClient && isInitializing && Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  if (!jarvisClient) {
    throw new Error("Promptwright client not initialized");
  }

  const retrySend = async (): Promise<string> => {
    console.log("[JARVIS] Retrying send after brief delay (session may still be initializing)...");
    await new Promise(resolve => setTimeout(resolve, 1500));
    try {
      return await jarvisClient!.sendMessage(prompt);
    } catch (retryError) {
      console.log("[JARVIS] Retry on same session failed, performing full recovery...");
    }

    // Full recovery — recreate the client and session
    await initializeClient(app.getPath("home"));
    return await jarvisClient!.sendMessage(prompt);
  };

  try {
    return await jarvisClient.sendMessage(prompt);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (
      errorMsg.includes("Session not found") ||
      errorMsg.includes("Session not started")
    ) {
      console.log(`[JARVIS] Session error: ${errorMsg}`);
      try {
        return await retrySend();
      } catch (retryError) {
        console.error("[JARVIS] Failed to recover session:", retryError);
        throw retryError;
      }
    }
    throw error;
  }
});

/**
 * Abort current message processing
 */
ipcMain.handle("jarvis:abort", async () => {
  if (jarvisClient) {
    await jarvisClient.abort();
  }
});

/**
 * Get current client state
 */
ipcMain.handle("jarvis:get-state", () => {
  return jarvisClient?.getState() ?? "disconnected";
});

/**
 * Initialize JARVIS with optional copilot session ID.
 * Fire-and-forget: returns immediately, pushes jarvis:session-ready or
 * jarvis:session-error when the Copilot session is established.
 */
ipcMain.handle("jarvis:initialize", async (_, workDir: string, _personaId?: string, copilotSessionId?: string, uiSessionId?: string) => {
  assertPrerequisitesPassed();

  // Fire and forget — don't await.
  initializeClient(workDir, copilotSessionId)
    .then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("jarvis:session-ready", {
          uiSessionId,
          copilotSessionId: jarvisClient?.getCopilotSessionId() || null,
        });
      }
    })
    .catch((error) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("jarvis:session-error", {
          uiSessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

  return null; // Return immediately
});

/**
 * Get current Copilot readiness state
 */
ipcMain.handle("jarvis:get-readiness", () => {
  if (jarvisClient?.getState() === "connected") return "ready";
  if (isInitializing) return "initializing";
  return "idle";
});

/**
 * Get current Copilot session ID
 */
ipcMain.handle("copilot:get-session-id", async () => {
  return jarvisClient?.getCopilotSessionId() || null;
});

/**
 * Delete a Copilot session from CLI
 */
ipcMain.handle("copilot:delete-session", async (_, sessionId: string) => {
  if (!jarvisClient) {
    throw new Error("Promptwright client not initialized");
  }
  await jarvisClient.deleteCopilotSession(sessionId);
});

/**
 * Change working directory
 */
ipcMain.handle("jarvis:set-workdir", async (_, workDir: string) => {
  assertPrerequisitesPassed();
  await initializeClient(workDir);
  return workDir;
});

// Legacy persona IPC handlers — return empty/null for backward compatibility
ipcMain.handle("persona:list", () => []);
ipcMain.handle("persona:get-active", () => null);
ipcMain.handle("persona:select", async () => null);
ipcMain.handle("config:get-last-used-persona", () => null);
ipcMain.handle("config:set-last-used-persona", async () => getConfig());

/**
 * Open folder picker dialog
 */
ipcMain.handle("jarvis:pick-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Select Working Directory",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    await initializeClient(selectedPath);
    return selectedPath;
  }


  return null;
});

/**
 * Get current working directory
 */
ipcMain.handle("jarvis:get-workdir", () => {
  return process.cwd();
});

/**
 * Get current system prompt (for debugging)
 */
ipcMain.handle("jarvis:get-system-prompt", () => {
  return activeSystemPrompt;
});

/**
 * Get Electron app path
 */
ipcMain.handle("jarvis:get-path", (_, name: string) => {
  try {
    return app.getPath(name as any);
  } catch (error) {
    console.error(`[JARVIS] Failed to get path '${name}':`, error);
    return null;
  }
});

/**
 * Show a message dialog with the Jarvis icon
 */
ipcMain.handle(
  "dialog:show-message",
  async (
    _,
    options: {
      type?: "none" | "info" | "error" | "question" | "warning";
      title?: string;
      message: string;
      detail?: string;
      buttons?: string[];
    }
  ) => {
    if (!mainWindow) {
      return { response: 0 };
    }

    const dialogOptions: Electron.MessageBoxOptions = {
      type: options.type || "info",
      title: options.title || "Promptwright",
      message: options.message,
      detail: options.detail,
      buttons: options.buttons || ["OK"],
      icon: appIconPath ? nativeImage.createFromPath(appIconPath) : undefined,
    };

    const result = await dialog.showMessageBox(mainWindow, dialogOptions);
    return { response: result.response };
  }
);

// ==================
// Session Storage Configuration
// ==================

const MAX_SESSIONS = 10;

/**
 * Get sessions directory path (in userData for proper app data isolation)
 * This ensures data persists across app upgrades
 */
function getSessionsDir(): string {
  return path.join(app.getPath("userData"), "sessions");
}

/**
 * Ensure sessions directory exists
 */
async function ensureSessionsDir(): Promise<void> {
  const sessionsDir = getSessionsDir();
  try {
    await fs.access(sessionsDir);
  } catch {
    await fs.mkdir(sessionsDir, { recursive: true });
  }
}

/**
 * Enforce maximum session limit
 * Deletes oldest sessions beyond the limit, including associated recordings
 */
async function enforceSessionLimit(): Promise<void> {
  const sessionsDir = getSessionsDir();

  try {
    const files = await fs.readdir(sessionsDir);
    const sessions: Array<{ file: string; session: any; path: string }> = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const sessionPath = path.join(sessionsDir, file);
          const data = await fs.readFile(sessionPath, "utf-8");
          const session = JSON.parse(data);
          sessions.push({ file, session, path: sessionPath });
        } catch (err) {
          console.error(`[Sessions] Failed to read session ${file}:`, err);
          // Delete corrupted session file
          try {
            await fs.unlink(path.join(sessionsDir, file));
            console.log(`[Sessions] Deleted corrupted session file: ${file}`);
          } catch (unlinkErr) {
            console.error(`[Sessions] Failed to delete corrupted session: ${file}`, unlinkErr);
          }
        }
      }
    }

    // Sort by updatedAt descending (most recent first)
    sessions.sort((a, b) => b.session.updatedAt - a.session.updatedAt);

    // Delete sessions beyond the limit
    if (sessions.length > MAX_SESSIONS) {
      const toDelete = sessions.slice(MAX_SESSIONS);

      for (const { file, session, path: sessionPath } of toDelete) {
        console.log(`[Sessions] Removing old session: ${session.title || file}`);

        // Delete Copilot session if exists
        if (session.copilotSessionId && jarvisClient) {
          try {
            await jarvisClient.deleteCopilotSession(session.copilotSessionId);
            console.log(`[Sessions] Deleted Copilot session: ${session.copilotSessionId}`);
          } catch (err) {
            console.error(`[Sessions] Failed to delete Copilot session ${session.copilotSessionId}:`, err);
          }
        }

        // Delete associated recording if exists
        if (session.executionData?.recordingPath) {
          try {
            await fs.unlink(session.executionData.recordingPath);
            console.log(`[Sessions] Deleted recording: ${session.executionData.recordingPath}`);
          } catch (err) {
            // Recording may already be deleted or path invalid
            console.log(`[Sessions] Could not delete recording: ${session.executionData.recordingPath}`);
          }
        }

        // Delete session file
        try {
          await fs.unlink(sessionPath);
          console.log(`[Sessions] Deleted session file: ${sessionPath}`);
        } catch (err) {
          console.error(`[Sessions] Failed to delete session file: ${sessionPath}`, err);
        }
      }
    }
  } catch (error) {
    console.error("[Sessions] Failed to enforce session limit:", error);
  }
}

/**
 * Save chat session to file
 */
ipcMain.handle("session:save", async (_, sessionId: string, data: string) => {
  await ensureSessionsDir();
  const sessionPath = path.join(getSessionsDir(), `${sessionId}.json`);
  await fs.writeFile(sessionPath, data, "utf-8");

  // Enforce session limit after saving
  await enforceSessionLimit();

  return sessionPath;
});

/**
 * Load chat session from file
 */
ipcMain.handle("session:load", async (_, sessionId: string) => {
  const sessionPath = path.join(getSessionsDir(), `${sessionId}.json`);
  try {
    const data = await fs.readFile(sessionPath, "utf-8");
    return data;
  } catch (error) {
    return null;
  }
});

/**
 * List all chat sessions
 */
ipcMain.handle("session:list", async () => {
  await ensureSessionsDir();
  const sessionsDir = getSessionsDir();
  const files = await fs.readdir(sessionsDir);
  const sessions = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const sessionPath = path.join(sessionsDir, file);
        const data = await fs.readFile(sessionPath, "utf-8");
        const session = JSON.parse(data);
        sessions.push(session);
      } catch (error) {
        console.error(`[Sessions] Error reading session ${file}:`, error);
        // Delete corrupted session file
        try {
          await fs.unlink(path.join(sessionsDir, file));
          console.log(`[Sessions] Deleted corrupted session file: ${file}`);
        } catch (unlinkErr) {
          console.error(`[Sessions] Failed to delete corrupted session: ${file}`, unlinkErr);
        }
      }
    }
  }

  // Sort by updatedAt, most recent first
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return sessions;
});

/**
 * Delete chat session and associated data
 */
ipcMain.handle("session:delete", async (_, sessionId: string) => {
  const sessionPath = path.join(getSessionsDir(), `${sessionId}.json`);
  try {
    // First, read the session to get recording path
    try {
      const data = await fs.readFile(sessionPath, "utf-8");
      const session = JSON.parse(data);

      // Delete associated recording if exists
      if (session.executionData?.recordingPath) {
        try {
          await fs.unlink(session.executionData.recordingPath);
          console.log(`[Sessions] Deleted associated recording: ${session.executionData.recordingPath}`);
        } catch (err) {
          console.log(`[Sessions] Could not delete recording: ${session.executionData.recordingPath}`);
        }
      }
    } catch (err) {
      // Session file may not exist or be readable
    }

    // Delete the session file
    await fs.unlink(sessionPath);
    return true;
  } catch (error) {
    console.error(`Error deleting session ${sessionId}:`, error);
    return false;
  }
});

/**
 * Export session as HTML file
 */
ipcMain.handle("session:export-html", async (_, sessionId: string, htmlContent: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Export Test Report",
    defaultPath: `jarvis-test-report-${sessionId}.html`,
    filters: [{ name: "HTML Files", extensions: ["html"] }],
  });

  if (!result.canceled && result.filePath) {
    await fs.writeFile(result.filePath, htmlContent, "utf-8");
    console.log(`[Sessions] Exported session ${sessionId} to: ${result.filePath}`);
    return result.filePath;
  }

  return null;
});

// ============================
// Agent Orchestration IPC Handlers
// ============================

/**
 * List all registered agents (metadata only)
 */
ipcMain.handle("agent:list", () => {
  const registry = jarvisClient?.getRegistry();
  if (!registry) return [];
  return registry.getEnabledMetadata();
});

/**
 * Get the currently active sub-agent name
 */
ipcMain.handle("agent:get-active", () => {
  return jarvisClient?.getActiveAgent() ?? null;
});

/**
 * Get orchestrator state
 */
ipcMain.handle("orchestrator:get-state", () => {
  if (!jarvisClient?.isOrchestratorMode()) return null;
  const config = getConfig();
  return {
    model: config.orchestrator?.model,
    autoRoute: config.orchestrator?.autoRoute !== false,
  };
});

/**
 * Get full agent detail including prompt
 */
ipcMain.handle("agent:get", (_: Electron.IpcMainInvokeEvent, name: string) => {
  const registry = jarvisClient?.getRegistry();
  if (!registry) return null;
  const agent = registry.get(name);
  if (!agent) return null;
  return {
    name: agent.name,
    displayName: agent.displayName,
    tag: agent.tag,
    description: agent.description,
    category: agent.category,
    model: agent.model,
    tools: agent.tools ?? [],
    mcpServers: agent.mcpServers ? Object.keys(agent.mcpServers) : [],
    skills: agent.skills ?? [],
    prompt: agent.prompt,
    enabled: agent.enabled,
    builtIn: agent.builtIn,
  };
});

/**
 * List all loaded skills (metadata only)
 */
ipcMain.handle("skill:list", () => {
  const skillManager = jarvisClient?.getSkillManager();
  if (!skillManager) return [];
  return skillManager.getMetadata();
});

/**
 * Get full skill detail including prompt
 */
ipcMain.handle("skill:get", (_: Electron.IpcMainInvokeEvent, name: string) => {
  const skillManager = jarvisClient?.getSkillManager();
  if (!skillManager) return null;
  const skill = skillManager.get(name);
  if (!skill) return null;
  return {
    name: skill.name,
    description: skill.description,
    tools: skill.tools ?? [],
    prompt: skill.prompt,
  };
});

// Playwright MCP IPC Handlers

/**
 * Check if Playwright MCP is installed
 */
ipcMain.handle("playwright:check-installed", async () => {
  if (!playwrightMCPManager) {
    return false;
  }
  return await playwrightMCPManager.isInstalled();
});

/**
 * Install Playwright MCP
 */
ipcMain.handle("playwright:install", async () => {
  if (!playwrightMCPManager) {
    throw new Error("Playwright MCP manager not initialized");
  }
  await playwrightMCPManager.install();
  return true;
});

/**
 * Check if browser is available
 */
ipcMain.handle("playwright:check-browser", async () => {
  if (!playwrightMCPManager) {
    return false;
  }
  return await playwrightMCPManager.isBrowserAvailable();
});

/**
 * Get Playwright MCP status
 */
ipcMain.handle("playwright:get-status", () => {
  if (!playwrightMCPManager) {
    return "not_installed";
  }
  return playwrightMCPManager.getStatus();
});

// Execution Recording IPC Handlers

/**
 * Start execution recording
 * Launches Chrome with CDP, starts screencast
 */
ipcMain.handle("execution:start-recording", async () => {
  assertPrerequisitesPassed();
  if (!chromeLauncher || !cdpClient || !screencastRecorder) {
    throw new Error("Execution recording components not initialized");
  }

  try {
    console.log("[ExecutionRecording] Starting recording...");

    // Kill any existing Chrome on the debug port
    await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);

    // Launch Chrome with remote debugging
    // Use headless setting from config
    const config = getConfig();
    await chromeLauncher.launch({
      port: CHROME_DEBUG_PORT,
      startingUrl: "about:blank",
      headless: config.browser.headless,
    });

    console.log(`[ExecutionRecording] Chrome launched on port ${CHROME_DEBUG_PORT} (headless: ${config.browser.headless})`);

    // Wait a bit for Chrome to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Connect CDP client
    await cdpClient.connect({ port: CHROME_DEBUG_PORT });

    console.log("[ExecutionRecording] CDP client connected");

    // Start screencast recording
    await screencastRecorder.start(cdpClient);

    console.log("[ExecutionRecording] Screencast recording started");

    return { success: true, port: CHROME_DEBUG_PORT };
  } catch (error) {
    console.error("[ExecutionRecording] Failed to start recording:", error);
    throw error;
  }
});

/**
 * Stop execution recording
 * Stops screencast, generates GIF, returns file path
 */
ipcMain.handle("execution:stop-recording", async () => {
  if (!screencastRecorder || !cdpClient) {
    throw new Error("Execution recording not active");
  }

  try {
    console.log("[ExecutionRecording] Stopping recording...");

    // Stop screencast and save GIF
    const gifPath = await screencastRecorder.stop();

    console.log(`[ExecutionRecording] Recording saved to: ${gifPath}`);

    // Disconnect CDP client (but don't kill Chrome - MCP is using it)
    await cdpClient.disconnect();

    console.log("[ExecutionRecording] CDP client disconnected");

    // Store the recording path
    currentRecordingPath = gifPath;

    return { success: true, path: gifPath };
  } catch (error) {
    console.error("[ExecutionRecording] Failed to stop recording:", error);
    throw error;
  }
});

/**
 * Get current recording path
 */
ipcMain.handle("execution:get-recording-path", () => {
  return currentRecordingPath;
});

/**
 * Close Chrome browser on debug port
 * Used when starting a new test to ensure fresh browser state
 */
ipcMain.handle("execution:close-browser", async () => {
  if (!chromeLauncher) {
    console.log("[ExecutionRecording] Chrome launcher not initialized");
    return { success: true };
  }

  try {
    console.log("[ExecutionRecording] Closing Chrome browser...");
    await chromeLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
    console.log("[ExecutionRecording] Chrome browser closed");
    return { success: true };
  } catch (error) {
    console.error("[ExecutionRecording] Failed to close Chrome:", error);
    // Don't throw - it's okay if Chrome wasn't running
    return { success: true };
  }
});

/**
 * Get recording data for iframe
 * In packaged mode: returns file:// URL (works with file: protocol)
 * In dev mode: returns HTML content (file:// blocked when loading from http://localhost)
 */
ipcMain.handle("execution:get-recording-data", async (_, filePath: string) => {
  try {
    console.log(`[ExecutionRecording] Getting recording data for: ${filePath}`);
    console.log(`[ExecutionRecording] app.isPackaged: ${app.isPackaged}`);

    // Verify file exists
    await fs.access(filePath);

    if (app.isPackaged) {
      // Packaged mode: use file:// URL
      console.log("[ExecutionRecording] Packaged mode: returning file:// URL");
      return { type: "url", data: `file://${filePath}` };
    } else {
      // Dev mode: return HTML content (file:// blocked from http://localhost)
      console.log("[ExecutionRecording] Dev mode: returning HTML content");
      const content = await fs.readFile(filePath, "utf-8");
      console.log(`[ExecutionRecording] HTML content length: ${content.length} chars`);
      return { type: "html", data: content };
    }
  } catch (error) {
    console.error("[ExecutionRecording] Failed to get recording data:", error);
    throw error;
  }
});

/**
 * Cancel execution recording without saving
 */
ipcMain.handle("execution:cancel-recording", async () => {
  if (!screencastRecorder || !cdpClient) {
    return { success: true };
  }

  try {
    await screencastRecorder.cancel();
    await cdpClient.disconnect();
    currentRecordingPath = null;
    return { success: true };
  } catch (error) {
    console.error("[ExecutionRecording] Failed to cancel recording:", error);
    throw error;
  }
});

// Recording IPC Handlers

/**
 * Get available recording modes
 */
ipcMain.handle("recording:get-modes", () => {
  return getAvailableModes();
});

/**
 * Get default recording mode
 */
ipcMain.handle("recording:get-default-mode", () => {
  return getDefaultMode();
});

/**
 * Start recording
 */
ipcMain.handle("recording:start", async (_, mode: RecordingMode, startUrl?: string) => {
  assertPrerequisitesPassed();
  if (!recordingManager) {
    throw new Error("Recording manager not initialized");
  }

  // Defensive pre-clean: persona switching can leave a stale listener on 9222
  // from previous MCP/Chrome sessions. Reclaim it before observer start.
  try {
    const tempLauncher = new ChromeLauncher();
    await tempLauncher.killExistingOnPort(CHROME_DEBUG_PORT);
  } catch {
    // Ignore - if nothing is listening, recorder start will proceed normally.
  }

  await recordingManager.startRecording(mode, startUrl);
  return { success: true };
});

/**
 * Stop recording
 */
ipcMain.handle("recording:stop", async () => {
  console.log("[JARVIS IPC] recording:stop called");
  if (!recordingManager) {
    throw new Error("Recording manager not initialized");
  }
  console.log("[JARVIS IPC] Calling recordingManager.stopRecording()...");
  const session = await recordingManager.stopRecording();
  console.log("[JARVIS IPC] recording:stop completed, session id:", session?.id);
  console.log("[JARVIS IPC] Returning session to renderer - dialog should show after this");

  // Note: session_recorded event is automatically emitted by RecordingManager
  // with the temp file path included

  return session;
});

/**
 * Extract Gherkin content from AI response
 */
function extractGherkinFromResponse(response: string): string {
  // Try to extract from code block
  const codeBlockMatch = response.match(/```(?:gherkin|feature)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find Feature keyword and extract from there
  const featureMatch = response.match(/(Feature:[\s\S]*)/);
  if (featureMatch) {
    // Clean up any trailing explanatory text
    let gherkin = featureMatch[1];
    // Stop at common end patterns
    const endPatterns = ['\n\nThis ', '\n\nNote:', '\n\nI ', '\n\n---', '\n\n**'];
    for (const pattern of endPatterns) {
      const idx = gherkin.indexOf(pattern);
      if (idx > 0) {
        gherkin = gherkin.slice(0, idx);
      }
    }
    return gherkin.trim();
  }

  // Return as-is if no pattern found
  return response.trim();
}

/**
 * Generate Gherkin from recorded session
 */
ipcMain.handle("recording:generate-gherkin", async (_, customInstructions?: string) => {
  console.log("[IPC] recording:generate-gherkin called with custom instructions:", customInstructions ? "yes" : "no");

  if (!recordingManager) {
    throw new Error("Recording manager not initialized");
  }

  // Use JarvisClient for AI processing if available
  const result = await recordingManager.generateGherkin(
    undefined,
    jarvisClient
      ? async (session) => {
        console.log("[IPC] Generating Gherkin for session with", session.actions.length, "actions");

        // Format the session for AI - build prompt in parts
        let prompt = `Convert the following recorded browser actions into a well-structured Gherkin feature file.

Recording Info:
- Start URL: ${session.startUrl}
- Recording Mode: ${session.mode}
- Total Actions: ${session.actions.length}

Recorded Actions:
${JSON.stringify(session.actions.map(a => ({
          type: a.type,
          target: a.target ? {
            tagName: a.target.tagName,
            locators: a.target.locators,
            textContent: a.target.textContent?.slice(0, 50),
          } : undefined,
          value: a.value,
          url: a.url,
        })), null, 2)}`;

        // Append custom instructions if provided
        if (customInstructions && customInstructions.trim()) {
          prompt += `\n\nADDITIONAL INSTRUCTIONS FROM USER:
${customInstructions.trim()}

Please incorporate these instructions when generating the Gherkin feature file.`;
        }

        // Add format requirements
        prompt += `\n\nIMPORTANT: Output ONLY the Gherkin feature file content. Do not include any explanations or markdown formatting. Start directly with "Feature:" and end after the last step or Examples table.

Requirements:
1. Descriptive feature and scenario names
2. Human-readable step descriptions (describe WHAT not HOW)
3. Use regular Scenario with inline values (NOT Scenario Outline) - write actual values directly in steps
4. Include locator comments BEFORE each step (# Locator: ...)
5. Add a comment at the top of the scenario: "# Note: UI locators are shown as comments before each step for test automation"
6. Use proper Gherkin keywords: Feature, Scenario, Given, When, Then, And`;

        console.log("[IPC] Sending prompt to AI...");
        // Use sendAndWait to get the actual content (not message ID)
        const response = await jarvisClient!.sendAndWait(prompt, 120000);
        console.log("[IPC] AI response received, length:", response?.length || 0);

        const gherkin = extractGherkinFromResponse(response || "");
        console.log("[IPC] Extracted Gherkin, length:", gherkin.length);
        console.log("[IPC] Gherkin preview:", gherkin.substring(0, 200));

        return {
          gherkin,
          summary: "Generated by AI",
        };
      }
      : undefined
  );

  console.log("[IPC] Returning result with gherkin length:", result?.gherkin?.length || 0);
  return result;
});

/**
 * Refine Gherkin based on user instruction
 */
ipcMain.handle("recording:refine-gherkin", async (_, instruction: string) => {
  if (!recordingManager) {
    throw new Error("Recording manager not initialized");
  }

  const result = await recordingManager.refineGherkin(
    instruction,
    jarvisClient
      ? async (currentGherkin, instr, _session) => {
        const prompt = `Refine the following Gherkin feature file based on the user's instruction.

Current Gherkin:
\`\`\`gherkin
${currentGherkin}
\`\`\`

User Instruction:
${instr}

IMPORTANT: Output ONLY the updated Gherkin feature file content. Do not include any explanations or markdown formatting. Start directly with "Feature:" and end after the last step or Examples table.`;

        // Use sendAndWait to get the actual content
        const response = await jarvisClient!.sendAndWait(prompt, 120000);
        const gherkin = extractGherkinFromResponse(response || "");

        return {
          gherkin: gherkin || currentGherkin,
          summary: `Refined: ${instr}`,
        };
      }
      : undefined
  );

  return result;
});

/**
 * Get current recording status
 */
ipcMain.handle("recording:get-status", () => {
  if (!recordingManager) {
    return { state: "idle" };
  }
  return recordingManager.getStatus();
});

/**
 * Get current Gherkin content
 */
ipcMain.handle("recording:get-gherkin", () => {
  if (!recordingManager) {
    return null;
  }
  return recordingManager.getCurrentGherkin();
});

/**
 * Discard current recording
 */
ipcMain.handle("recording:discard", () => {
  if (recordingManager) {
    recordingManager.discard();
  }
  return { success: true };
});

/**
 * Export Gherkin to file
 */
ipcMain.handle("recording:export", async (_, gherkin: string, filePath: string) => {
  await fs.writeFile(filePath, gherkin, "utf-8");

  // Clean up temp file after successful export
  if (recordingManager) {
    await recordingManager.cleanupTempFile();
  }

  return { success: true, path: filePath };
});

/**
 * Clean up temp recording file
 */
ipcMain.handle("recording:cleanup-temp", async () => {
  if (!recordingManager) {
    throw new Error("Recording manager not initialized");
  }
  await recordingManager.cleanupTempFile();
  return { success: true };
});

/**
 * Pick export file path
 */
ipcMain.handle("recording:pick-export-path", async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "Save Feature File",
    defaultPath: "test.feature",
    filters: [
      { name: "Gherkin Feature Files", extensions: ["feature"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (!result.canceled && result.filePath) {
    return result.filePath;
  }

  return null;
});

/**
 * Load feature file for replay
 */
ipcMain.handle("recording:load-feature", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Open Feature File",
    filters: [
      { name: "Gherkin Feature Files", extensions: ["feature"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, "utf-8");
    return { path: filePath, content };
  }

  return null;
});

/**
 * Generate Gherkin from manual test execution logs
 */
ipcMain.handle("execution:generate-gherkin", async (_, testInput: string, executionLogs: string) => {
  console.log("[IPC] execution:generate-gherkin called");
  
  if (!jarvisClient) {
    throw new Error("Promptwright client not initialized");
  }

  try {
    const prompt = `You are analyzing a test execution to generate a refined, repeatable Gherkin feature file.

**Original Test Intent (user's vague instructions):**
${testInput}

**Detailed Execution Logs (AI's actions during execution):**
${executionLogs}

Generate a Gherkin feature file with these requirements:

1. **Feature/Scenario naming**: Capture the test intent from the original instructions, not implementation details
2. **Step structure**: Use concrete values that actually worked during execution (specific product names, sizes, URLs, button text, etc.)
3. **Locator comments**: Add \`# Locator:\` comments BEFORE each interactive step with the selector strategy that worked
4. **Navigation context**: Add comments about any popups, modals, overlays, or navigation nuances encountered
5. **Data-driven**: Use actual test data from execution logs (e.g., "Fluffy Maracas" instead of "random product", "36-40" instead of "random size")
6. **Predictable steps**: Include ALL necessary steps discovered during execution, even if not in original instructions (e.g., closing popups, clicking back buttons)

Format example:
\`\`\`gherkin
Feature: [Descriptive name based on test intent]

  # Note: Locators and navigation hints are provided as comments for reliable automation
  Scenario: [Specific scenario name]
    # Locator: text="Women"
    Given I navigate to "https://example.com"
    # Locator: text="Product Name"
    When I click on "Product Name"
    # Navigation: Popup may appear after adding to cart
    # Locator: button[aria-label="Close"]
    And I close the popup if present
\`\`\`

IMPORTANT: 
- Output ONLY the Gherkin feature file content
- Start directly with "Feature:"
- Do NOT include explanations before or after the Gherkin content
- Use specific values from execution logs, not generic placeholders
- Add locator comments before steps that interact with UI elements`;

    console.log("[IPC] Sending prompt to AI for execution Gherkin generation...");
    const response = await jarvisClient.sendAndWait(prompt, 120000);
    console.log("[IPC] AI response received, length:", response?.length || 0);

    const gherkin = extractGherkinFromResponse(response || "");
    console.log("[IPC] Extracted Gherkin, length:", gherkin.length);

    return {
      gherkin,
      summary: "Generated from execution logs",
    };
  } catch (error) {
    console.error("[IPC] Failed to generate Gherkin:", error);
    throw new Error(`Failed to generate Gherkin: ${error instanceof Error ? error.message : String(error)}`);
  }
});

/**
 * Refine Gherkin from manual test execution based on user instruction
 */
ipcMain.handle("execution:refine-gherkin", async (_, currentGherkin: string, instruction: string, testInput: string) => {
  console.log("[IPC] execution:refine-gherkin called with instruction:", instruction);
  
  if (!jarvisClient) {
    throw new Error("Promptwright client not initialized");
  }

  try {
    const prompt = `Refine the following Gherkin feature file based on the user's instruction.

**Original Test Intent:**
${testInput}

**Current Gherkin:**
\`\`\`gherkin
${currentGherkin}
\`\`\`

**User Instruction:**
${instruction}

IMPORTANT: 
- Output ONLY the updated Gherkin feature file content
- Start directly with "Feature:"
- Do NOT include explanations or markdown formatting
- Maintain locator comments and navigation hints unless instructed otherwise
- Keep the same level of detail and specificity`;

    console.log("[IPC] Sending refinement prompt to AI...");
    const response = await jarvisClient.sendAndWait(prompt, 120000);
    const gherkin = extractGherkinFromResponse(response || "");

    return {
      gherkin: gherkin || currentGherkin,
      summary: `Refined: ${instruction}`,
    };
  } catch (error) {
    console.error("[IPC] Failed to refine Gherkin:", error);
    throw new Error(`Failed to refine Gherkin: ${error instanceof Error ? error.message : String(error)}`);
  }
});
