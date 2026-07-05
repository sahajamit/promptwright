import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { getConfig, resolveProviderConfig } from "@promptwright/core";
import { resolveCopilotPath } from "./copilot-cli.js";

const MIN_NODE_MAJOR = 22;
const IS_WINDOWS = process.platform === "win32";

interface SpawnCheckResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  stdout: string;
  stderr: string;
}

/**
 * Classify spawn result failure reason for debugging.
 */
function classifyFailure(result: SpawnCheckResult): string {
  if (result.error) {
    const errMsg = result.error.message.toLowerCase();
    if (errMsg.includes("enoent") || errMsg.includes("not found")) {
      return "not_found";
    }
    if (errMsg.includes("timeout")) {
      return "timeout";
    }
    return "spawn_error";
  }
  if (result.status !== 0) {
    return "non_zero_exit";
  }
  return "ok";
}

/**
 * Sanitize stderr for logging (first 200 chars, no sensitive paths).
 */
function sanitizeStderr(stderr: string): string {
  if (!stderr) return "";
  return stderr.trim().slice(0, 200);
}

/**
 * Run a command with optional Windows shell fallback.
 */
function runCommand(
  command: string,
  args: string[],
  label: string
): { result: SpawnCheckResult; attemptMode: string } {
  // First attempt: direct execution with normalized env
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    env: process.env,
    timeout: 5000,
  });

  const spawnResult: SpawnCheckResult = {
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };

  const classification = classifyFailure(spawnResult);

  console.log(
    `[PREREQ ${label}] attempt=direct, status=${result.status}, signal=${result.signal}, hasError=${!!result.error}, classification=${classification}`
  );

  if (classification === "not_found" && IS_WINDOWS) {
    // Windows fallback: try with shell resolution
    console.log(`[PREREQ ${label}] Retrying with shell=true on Windows`);
    const shellResult = spawnSync(command, args, {
      encoding: "utf-8",
      env: process.env,
      timeout: 5000,
      shell: true,
    });

    const shellSpawnResult: SpawnCheckResult = {
      status: shellResult.status,
      signal: shellResult.signal,
      error: shellResult.error,
      stdout: shellResult.stdout || "",
      stderr: shellResult.stderr || "",
    };

    const shellClassification = classifyFailure(shellSpawnResult);
    console.log(
      `[PREREQ ${label}] attempt=windows-shell-fallback, status=${shellResult.status}, signal=${shellResult.signal}, hasError=${!!shellResult.error}, classification=${shellClassification}`
    );

    if (shellResult.error) {
      console.log(
        `[PREREQ ${label}] stderr_snippet="${sanitizeStderr(shellResult.stderr)}"`
      );
    }

    return { result: shellSpawnResult, attemptMode: "windows-shell-fallback" };
  }

  if (result.error || result.status !== 0) {
    console.log(`[PREREQ ${label}] stderr_snippet="${sanitizeStderr(result.stderr)}"`);
  }

  return { result: spawnResult, attemptMode: "direct" };
}

export interface PrerequisiteCheckItem {
  ok: boolean;
  message: string;
  details?: string;
}

export interface PrerequisiteStatus {
  checkedAt: number;
  cached: boolean;
  passed: boolean;
  node: PrerequisiteCheckItem;
  copilotCli: PrerequisiteCheckItem;
  copilotAuth: PrerequisiteCheckItem;
  fixCommands: string[];
}

interface PrerequisiteCache {
  version: 1;
  passed: boolean;
  checkedAt: number;
}

/**
 * Detect whether the user has configured a bring-your-own-key (BYOK) provider.
 * When true, Promptwright runs login-less: no GitHub Copilot license, no global
 * `copilot` install, and no `copilot auth login` are required — Copilot is just
 * the bundled harness and the model comes from the user's own cloud key.
 */
function isByokConfigured(): boolean {
  // Resolve config.yaml + env together: true when a usable provider (baseUrl +
  // model) exists from either source. Covers the pure-env local path, e.g.
  // PROMPTWRIGHT_PROVIDER_BASE_URL=http://localhost:11434/v1 + _MODEL=gemma4:12b.
  return resolveProviderConfig(getConfig().provider) !== undefined;
}

function getFixCommands(byok: boolean): string[] {
  // BYOK path: no Copilot login/install needed — just point Promptwright at a
  // provider key. The Copilot runtime is bundled in the SDK.
  if (byok) {
    return [
      "node --version",
      "# Bring your own key — no Copilot login required.",
      "# Set a provider in Settings, or export an env var, e.g.:",
      "export PROMPTWRIGHT_PROVIDER_API_KEY=sk-...",
    ];
  }

  return [
    "node --version",
    "npm --version",
    "# Optional: use your own provider key instead (no Copilot login):",
    "export PROMPTWRIGHT_PROVIDER_API_KEY=sk-...",
    "# Or sign in with GitHub Copilot:",
    "npm install -g @github/copilot",
    "copilot auth login",
  ];
}

function parseNodeMajor(version: string): number | null {
  const match = version.trim().match(/^v?(\d+)\./);
  if (!match) {
    return null;
  }
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

function checkNodeVersion(): PrerequisiteCheckItem {
  const { result, attemptMode } = runCommand("node", ["--version"], "node");

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      message: "Node.js is not installed or not available in PATH.",
      details:
        result.error?.message || result.stderr || "Failed to execute node --version",
    };
  }

  const rawVersion = result.stdout.trim();
  const major = parseNodeMajor(rawVersion);
  if (major === null) {
    return {
      ok: false,
      message: "Unable to parse Node.js version.",
      details: `Detected: ${rawVersion}`,
    };
  }

  if (major < MIN_NODE_MAJOR) {
    return {
      ok: false,
      message: `Node.js ${MIN_NODE_MAJOR}+ is required.`,
      details: `Detected: ${rawVersion}`,
    };
  }

  console.log(`[PREREQ node] ✓ Check passed (mode=${attemptMode}, version=${rawVersion})`);
  return {
    ok: true,
    message: "Node.js version check passed.",
    details: `Detected: ${rawVersion}`,
  };
}

async function checkCopilotCli(): Promise<PrerequisiteCheckItem> {
  // Try override path from config first
  const config = getConfig();
  if (config.copilotCliPath) {
    console.log(`[PREREQ copilot-cli] Trying override path: ${config.copilotCliPath}`);
    const resolvedPath = await resolveCopilotPath(config.copilotCliPath);
    
    if (!resolvedPath) {
      return {
        ok: false,
        message: "Configured Copilot CLI path is invalid.",
        details: `Path not found: ${config.copilotCliPath}`,
      };
    }
    
    // Test the resolved path
    const { result, attemptMode } = runCommand(
      resolvedPath,
      ["--version"],
      "copilot-cli-override"
    );
    
    if (result.error || result.status !== 0) {
      return {
        ok: false,
        message: "Configured Copilot CLI path failed version check.",
        details:
          result.error?.message ||
          result.stderr ||
          `Failed to execute ${resolvedPath} --version`,
      };
    }
    
    const version = result.stdout.trim();
    console.log(
      `[PREREQ copilot-cli] ✓ Check passed using override (mode=${attemptMode}, version=${version}, path=${resolvedPath})`
    );
    return {
      ok: true,
      message: "Copilot CLI check passed (using configured path).",
      details: `${version} at ${resolvedPath}`,
    };
  }
  
  // Fallback to PATH resolution
  const { result, attemptMode } = runCommand(
    "copilot",
    ["--version"],
    "copilot-cli"
  );

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      message: "Copilot CLI is not installed or not available in PATH.",
      details:
        result.error?.message ||
        result.stderr ||
        "Failed to execute copilot --version",
    };
  }

  const version = result.stdout.trim();
  console.log(`[PREREQ copilot-cli] ✓ Check passed (mode=${attemptMode}, version=${version})`);
  return {
    ok: true,
    message: "Copilot CLI check passed.",
    details: version || "copilot --version succeeded",
  };
}

function checkCopilotAuth(): PrerequisiteCheckItem {
  const { result, attemptMode } = runCommand(
    "copilot",
    ["auth", "status"],
    "copilot-auth"
  );

  if (result.status === 0) {
    console.log(`[PREREQ copilot-auth] ✓ Check passed (mode=${attemptMode})`);
    return {
      ok: true,
      message: "Copilot authentication check passed.",
      details: "Verified via `copilot auth status`.",
    };
  }

  console.log(
    `[PREREQ copilot-auth] ✗ Check failed (non-blocking, mode=${attemptMode})`
  );
  return {
    ok: false,
    message: "Copilot auth could not be verified (non-blocking).",
    details:
      (result.stderr || result.stdout || "").trim() ||
      "If Copilot requests fail later, run `copilot auth login`.",
  };
}

async function loadCache(cachePath: string): Promise<PrerequisiteCache | null> {
  try {
    const content = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(content) as PrerequisiteCache;
    if (parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function saveCache(cachePath: string): Promise<void> {
  const data: PrerequisiteCache = {
    version: 1,
    passed: true,
    checkedAt: Date.now(),
  };
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function evaluatePrerequisites(options: {
  cachePath: string;
  force?: boolean;
}): Promise<PrerequisiteStatus> {
  const { cachePath, force = false } = options;

  const byok = isByokConfigured();

  if (!force) {
    const cache = await loadCache(cachePath);
    if (cache?.passed) {
      console.log("[PREREQ] Using cached result: passed=true");
      return {
        checkedAt: cache.checkedAt,
        cached: true,
        passed: true,
        node: { ok: true, message: "Skipped (cached pass)." },
        copilotCli: { ok: true, message: "Skipped (cached pass)." },
        copilotAuth: {
          ok: true,
          message: "Skipped (cached pass, non-blocking check).",
        },
        fixCommands: getFixCommands(byok),
      };
    }
  }

  console.log(`[PREREQ] Running prerequisite checks... (byok=${byok})`);
  const node = checkNodeVersion();
  const copilotCli = await checkCopilotCli();
  const copilotAuth = copilotCli.ok
    ? checkCopilotAuth()
    : {
        ok: false,
        message: byok
          ? "Copilot CLI not found (not required in BYOK mode)."
          : "Skipped because Copilot CLI is not available.",
        details: byok
          ? "Promptwright uses the bundled runtime + your provider key."
          : "Install Copilot CLI first, or configure a provider key for BYOK.",
      };

  // Startup gate. Node is always required. The Copilot CLI is required ONLY when
  // the user is NOT bringing their own key: in BYOK mode the runtime is bundled
  // in the SDK and the user's provider key replaces the Copilot login entirely.
  const passed = node.ok && (byok || copilotCli.ok);

  // Log comprehensive summary for debugging
  const failureReasons: string[] = [];
  if (!node.ok) failureReasons.push("node_check_failed");
  if (!copilotCli.ok) {
    failureReasons.push(
      byok ? "copilot_cli_missing_but_byok" : "copilot_cli_check_failed"
    );
  }
  if (!copilotAuth.ok) failureReasons.push("copilot_auth_advisory_only");

  console.log(
    JSON.stringify(
      {
        label: "PREREQ_SUMMARY",
        passed,
        cached: false,
        byok,
        node_ok: node.ok,
        copilot_cli_ok: copilotCli.ok,
        copilot_auth_ok: copilotAuth.ok,
        blockers: failureReasons.filter(
          (r) => !r.includes("auth_advisory") && !r.includes("but_byok")
        ),
        all_reasons: failureReasons,
      },
      null,
      2
    )
  );

  if (passed) {
    await saveCache(cachePath);
    console.log("[PREREQ] ✓ All required checks passed, cache saved");
  } else {
    console.log("[PREREQ] ✗ Prerequisites not met, app will be blocked");
  }

  return {
    checkedAt: Date.now(),
    cached: false,
    passed,
    node,
    copilotCli,
    copilotAuth,
    fixCommands: getFixCommands(byok),
  };
}
