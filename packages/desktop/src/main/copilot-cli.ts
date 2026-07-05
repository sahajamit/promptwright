import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";

const IS_WINDOWS = process.platform === "win32";

/**
 * Resolve the Copilot CLI executable path from PATH.
 * Uses platform-aware lookup: `where` on Windows, `which` on Unix.
 */
export function resolveCopilotCLIPathFromPATH(): string | undefined {
  const resolverCommand = IS_WINDOWS ? "where" : "which";

  try {
    const result = spawnSync(resolverCommand, ["copilot"], {
      encoding: "utf8",
      timeout: 3000,
      env: process.env,
    });

    if (result.status !== 0 || !result.stdout.trim()) {
      return undefined;
    }

    const firstMatch = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return firstMatch || undefined;
  } catch (error) {
    console.warn(
      `[JARVIS] Could not locate copilot in PATH via ${resolverCommand}: ${error}`
    );
    return undefined;
  }
}

/**
 * Resolve the copilot executable path from a given override.
 * Handles both direct file paths and folder paths.
 * @returns Resolved executable path or null if invalid
 */
export async function resolveCopilotPath(
  overridePath: string
): Promise<string | null> {
  try {
    const stats = await fs.stat(overridePath);

    if (stats.isFile()) {
      return overridePath;
    }

    if (stats.isDirectory()) {
      const exeName = IS_WINDOWS ? "copilot.exe" : "copilot";
      const resolved = path.join(overridePath, exeName);

      try {
        const resolvedStats = await fs.stat(resolved);
        if (resolvedStats.isFile()) {
          return resolved;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Build the packaged Copilot native binary path from Electron app path.
 */
export function getPackagedCopilotCLIPath(appPath: string): string {
  const unpackedPath = appPath.replace("app.asar", "app.asar.unpacked");
  const platform = IS_WINDOWS ? "win32" : process.platform;
  const arch = process.arch;
  const binaryName = IS_WINDOWS ? "copilot.exe" : "copilot";

  return path.join(
    unpackedPath,
    "node_modules",
    "@github",
    `copilot-${platform}-${arch}`,
    binaryName
  );
}
