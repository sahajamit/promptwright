/**
 * Playwright CLI Skill Manager
 *
 * Manages the installation and configuration of the playwright-cli skill
 * for use with the Copilot SDK's skillDirectories feature.
 */

import { execFile } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import { createRequire } from "module";
import { homedir } from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const GLOBAL_SKILLS_DIR = path.join(homedir(), ".promptwright", "skills");
const CLI_SKILL_DIR = path.join(GLOBAL_SKILLS_DIR, "playwright-cli");
const CLI_SKILL_FILE = path.join(CLI_SKILL_DIR, "SKILL.md");
const IS_WINDOWS = process.platform === "win32";

export interface PlaywrightCLIProcessOptions {
  isPackaged?: boolean;
  appPath?: string;
  cwd?: string;
  timeoutMs?: number;
}

/**
 * JARVIS-specific additions appended to the upstream playwright-cli SKILL.md.
 * Inlined here to avoid .md file resolution issues across dev/packaged modes.
 */
const JARVIS_SKILL_ADDITIONS = `

## Promptwright Specific Rules

IMPORTANT: A Chrome browser is already launched with remote debugging on http://localhost:9222.

- You MUST start with \`playwright-cli attach --cdp=http://localhost:9222\` to attach to the already-running Chrome — this connects to the existing browser via CDP (it does NOT launch a new one). Do NOT use \`playwright-cli open\`, which would launch a separate browser the user cannot see.
- Then navigate using \`playwright-cli goto <url>\`
- Always use \`playwright-cli snapshot\` before interacting to get element refs
- Use element refs (e.g., e15) from snapshots for click, fill, type, etc.
- Only the \`attach\` command needs \`--cdp\`. Subsequent commands (goto, click, snapshot, etc.) do NOT need it.
- Do NOT pass \`--headed\` or \`--browser\` flags
- After completing all test steps, provide your final verdict in this EXACT format:
  - SUCCESS: "TEST PASSED: [brief summary of what was verified]"
  - FAILURE: "TEST FAILED: [which step failed and why]"
- The verdict text "TEST PASSED:" or "TEST FAILED:" is CRITICAL for UI rendering
`;

/**
 * Get the global skills directory path (~/.promptwright/skills)
 */
export function getGlobalSkillsDir(): string {
  return GLOBAL_SKILLS_DIR;
}

/**
 * Check if the playwright-cli skill is installed globally
 */
export function isPlaywrightCLISkillInstalled(): boolean {
  return existsSync(CLI_SKILL_FILE);
}

/**
 * Resolve playwright-cli entry script path for both dev and packaged runtime.
 */
export function resolvePlaywrightCLIEntry(
  options: PlaywrightCLIProcessOptions = {}
): string {
  const resolvedFromNode = require.resolve("@playwright/cli/playwright-cli.js");

  if (!options.isPackaged || !options.appPath) {
    return resolvedFromNode;
  }

  const appPath = options.appPath;
  const unpackedAppPath = appPath.replace("app.asar", "app.asar.unpacked");
  const candidates = [
    path.join(unpackedAppPath, "node_modules", "@playwright", "cli", "playwright-cli.js"),
    path.join(appPath, "node_modules", "@playwright", "cli", "playwright-cli.js"),
    resolvedFromNode,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `[JARVIS] Could not resolve playwright-cli entry in packaged mode. Checked: ${candidates.join(", ")}`
  );
}

/**
 * Create a local playwright-cli launcher script in the working directory.
 * This allows command execution without relying on global PATH installation.
 */
export async function ensurePlaywrightCLICommandInWorkDir(
  workDir: string,
  cliEntryPath: string
): Promise<string> {
  if (IS_WINDOWS) {
    const launcherPath = path.join(workDir, "playwright-cli.cmd");
    const content = `@echo off\r\nnode "${cliEntryPath}" %*\r\n`;
    await fs.writeFile(launcherPath, content, "utf-8");
    return launcherPath;
  }

  const launcherPath = path.join(workDir, "playwright-cli");
  const content = `#!/usr/bin/env sh\nnode "${cliEntryPath}" "$@"\n`;
  await fs.writeFile(launcherPath, content, "utf-8");
  await fs.chmod(launcherPath, 0o755);
  return launcherPath;
}

async function runPlaywrightCLICommand(
  args: string[],
  options: PlaywrightCLIProcessOptions = {}
): Promise<void> {
  const cliPath = resolvePlaywrightCLIEntry(options);
  await execFileAsync("node", [cliPath, ...args], {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? 30000,
  });
}

/**
 * Install the playwright-cli skill to the global skills directory.
 *
 * Uses `node playwright-cli.js install --skills` to generate the skill files,
 * then copies them to our global skills directory and appends JARVIS-specific additions.
 *
 * IMPORTANT: Uses system `node` binary instead of `process.execPath` because
 * in Electron, `process.execPath` is the Electron binary which causes ETIMEDOUT
 * errors when running Node.js scripts as subprocesses.
 */
export async function installPlaywrightCLISkill(
  options: PlaywrightCLIProcessOptions = {}
): Promise<void> {
  // Create a temporary working directory for the install command
  const tempDir = path.join(homedir(), ".promptwright", "temp", "cli-install");
  await fs.mkdir(tempDir, { recursive: true });

  try {
    await runPlaywrightCLICommand(["install", "--skills"], {
      ...options,
      cwd: tempDir,
      timeoutMs: options.timeoutMs ?? 30000,
    });

    // The command creates skills in <tempDir>/.claude/skills/playwright-cli/
    const generatedSkillDir = path.join(tempDir, ".claude", "skills", "playwright-cli");
    const generatedSkillFile = path.join(generatedSkillDir, "SKILL.md");

    if (!existsSync(generatedSkillFile)) {
      throw new Error(`playwright-cli install --skills did not create SKILL.md at ${generatedSkillFile}`);
    }

    // Create target directory
    await fs.mkdir(CLI_SKILL_DIR, { recursive: true });

    // Copy SKILL.md and append JARVIS additions
    let skillContent = await fs.readFile(generatedSkillFile, "utf-8");
    skillContent += JARVIS_SKILL_ADDITIONS;
    await fs.writeFile(CLI_SKILL_FILE, skillContent);

    // Copy references/ directory if it exists
    const refsDir = path.join(generatedSkillDir, "references");
    if (existsSync(refsDir)) {
      const targetRefsDir = path.join(CLI_SKILL_DIR, "references");
      await fs.mkdir(targetRefsDir, { recursive: true });
      const files = await fs.readdir(refsDir);
      for (const file of files) {
        await fs.copyFile(
          path.join(refsDir, file),
          path.join(targetRefsDir, file)
        );
      }
    }
  } finally {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Write a playwright-cli.json config file to the given directory.
 * Playwright-cli auto-discovers `playwright-cli.json` in its CWD.
 *
 * This must be written to the workDir used by the Copilot SDK's bash tool,
 * because env vars set on the Electron process may not be inherited by
 * the copilot CLI subprocess.
 */
export async function writePlaywrightCLIConfig(cdpEndpoint: string, workDir: string): Promise<void> {
  const config = {
    browser: {
      cdpEndpoint,
      isolated: false,  // Reuse default browser context so screencast captures frames
    },
    outputMode: "stdout",
  };

  const configPath = path.join(workDir, "playwright-cli.json");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Fetch the WebSocket debugger URL from Chrome's /json/version endpoint.
 * This gives us the exact ws:// URL to connect to, matching the proven approach
 * from independent testing.
 */
export async function fetchCDPWebSocketUrl(httpEndpoint: string): Promise<string> {
  const url = `${httpEndpoint}/json/version`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Chrome CDP returned HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text) {
    throw new Error("Chrome CDP returned empty response (browser may not be running)");
  }

  const json = JSON.parse(text) as { webSocketDebuggerUrl?: string };
  if (!json.webSocketDebuggerUrl) {
    throw new Error("Chrome CDP response missing webSocketDebuggerUrl");
  }

  return json.webSocketDebuggerUrl;
}

/**
 * Kill stale playwright-cli daemons from previous sessions.
 * Uses the bundled playwright-cli binary (not global npx) so it works
 * in both dev and packaged Electron modes.
 */
export async function killPlaywrightCLIDaemons(
  options: PlaywrightCLIProcessOptions = {}
): Promise<void> {
  try {
    await runPlaywrightCLICommand(["kill-all"], {
      ...options,
      timeoutMs: options.timeoutMs ?? 5000,
    });
    console.log("[JARVIS] Killed stale playwright-cli daemons");
  } catch {
    // Ignore — no daemons running or CLI not found
  }
}

/**
 * Get environment variables for playwright-cli CDP connection.
 * Set as belt-and-suspenders alongside the config file in workDir.
 */
export function getPlaywrightCLIEnvVars(cdpEndpoint: string): Record<string, string> {
  return {
    PLAYWRIGHT_MCP_CDP_ENDPOINT: cdpEndpoint,
    PLAYWRIGHT_CLI_SESSION: "jarvis-test",
  };
}
