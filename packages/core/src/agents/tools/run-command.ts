import { spawnSync } from "child_process";
import type { Tool, ToolInvocation } from "@github/copilot-sdk";

export interface RunCommandArgs {
  command: string;
  description?: string;
  cwd?: string;
  timeoutSeconds?: number;
}

export interface RunCommandToolOptions {
  defaultCwd?: string;
  env?: Record<string, string | undefined>;
}

export function createRunCommandTool(
  options: RunCommandToolOptions = {}
): Tool<RunCommandArgs> {
  return {
    name: "run_command",
    description:
      "Execute a shell command in a cross-platform way. Uses cmd.exe on Windows and /bin/sh on macOS/Linux.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to execute",
        },
        description: {
          type: "string",
          description: "Short description of what this command does",
        },
        cwd: {
          type: "string",
          description: "Optional working directory override",
        },
        timeoutSeconds: {
          type: "number",
          description: "Optional timeout in seconds (default: 30, max: 300)",
        },
      },
      required: ["command"],
    } as any,
    handler: async (args: RunCommandArgs, _invocation: ToolInvocation): Promise<string> => {
      const timeoutSeconds = Math.max(
        1,
        Math.min(300, Math.floor(args.timeoutSeconds ?? 30))
      );
      const cwd = args.cwd || options.defaultCwd || process.cwd();
      const env = { ...process.env, ...(options.env || {}) };

      const result = process.platform === "win32"
        ? spawnSync("cmd.exe", ["/d", "/s", "/c", args.command], {
            cwd,
            env,
            encoding: "utf-8",
            timeout: timeoutSeconds * 1000,
          })
        : spawnSync("/bin/sh", ["-lc", args.command], {
            cwd,
            env,
            encoding: "utf-8",
            timeout: timeoutSeconds * 1000,
          });

      return JSON.stringify({
        ok: !result.error && result.status === 0,
        status: result.status,
        signal: result.signal,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        error: result.error?.message,
      });
    },
  };
}
