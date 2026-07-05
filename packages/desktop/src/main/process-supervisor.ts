import { existsSync } from "fs";
import fs from "fs/promises";
import { spawnSync } from "child_process";
import path from "path";

type TrackedProcessType = "chrome-debugger" | "mcp-server" | "other";

interface TrackedProcessRecord {
  pid: number;
  type: TrackedProcessType;
  label: string;
  registeredAt: number;
}

interface ProcessRegistry {
  version: 1;
  records: TrackedProcessRecord[];
}

interface ProcessSupervisorOptions {
  registryPath: string;
  verbose?: boolean;
}

export class ProcessSupervisor {
  private readonly registryPath: string;
  private readonly verbose: boolean;
  private records: Map<number, TrackedProcessRecord> = new Map();

  constructor(options: ProcessSupervisorOptions) {
    this.registryPath = options.registryPath;
    this.verbose = options.verbose ?? false;
  }

  async initialize(): Promise<void> {
    await this.loadRegistry();
  }

  async reapStaleFromPreviousRun(): Promise<void> {
    await this.loadRegistry();
    if (this.records.size === 0) {
      this.log("No stale tracked processes to reap");
      return;
    }

    this.log(`Reaping ${this.records.size} stale tracked process(es)`);
    const stalePids = [...this.records.keys()];
    for (const pid of stalePids) {
      await this.killProcessTree(pid);
    }

    this.records.clear();
    await this.saveRegistry();
  }

  async registerProcess(pid: number, type: TrackedProcessType, label: string): Promise<void> {
    if (!Number.isFinite(pid) || pid <= 0) {
      return;
    }

    this.records.set(pid, {
      pid,
      type,
      label,
      registeredAt: Date.now(),
    });
    await this.saveRegistry();
    this.log(`Registered process ${pid} (${label})`);
  }

  async unregisterProcess(pid: number): Promise<void> {
    if (this.records.delete(pid)) {
      await this.saveRegistry();
      this.log(`Unregistered process ${pid}`);
    }
  }

  async terminateTrackedProcesses(): Promise<void> {
    if (this.records.size === 0) {
      return;
    }

    const pids = [...this.records.keys()];
    this.log(`Terminating ${pids.length} tracked process(es)`);
    for (const pid of pids) {
      await this.killProcessTree(pid);
    }

    this.records.clear();
    await this.saveRegistry();
  }

  async cleanupPlaywrightMcpProcesses(): Promise<number> {
    const pattern = "@playwright/mcp";
    const pids = this.findPidsByPattern(pattern);
    if (pids.length === 0) {
      return 0;
    }

    this.log(`Found ${pids.length} MCP process(es) to clean up`);
    for (const pid of pids) {
      await this.killProcessTree(pid);
    }

    return pids.length;
  }

  private async loadRegistry(): Promise<void> {
    this.records.clear();
    if (!existsSync(this.registryPath)) {
      return;
    }

    try {
      const raw = await fs.readFile(this.registryPath, "utf-8");
      const parsed = JSON.parse(raw) as ProcessRegistry;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
        return;
      }

      for (const record of parsed.records) {
        if (Number.isFinite(record.pid) && record.pid > 0) {
          this.records.set(record.pid, record);
        }
      }
    } catch (error) {
      this.log(`Failed to load process registry: ${String(error)}`);
    }
  }

  private async saveRegistry(): Promise<void> {
    const data: ProcessRegistry = {
      version: 1,
      records: [...this.records.values()],
    };

    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, JSON.stringify(data, null, 2), "utf-8");
  }

  private findPidsByPattern(pattern: string): number[] {
    if (process.platform === "win32") {
      const command = [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${pattern}*' } | Select-Object -ExpandProperty ProcessId`,
      ];
      const result = spawnSync("powershell", command, { encoding: "utf-8" });
      if (result.status !== 0 || !result.stdout) {
        return [];
      }

      return result.stdout
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0);
    }

    const result = spawnSync("pgrep", ["-f", pattern], { encoding: "utf-8" });
    if (result.status !== 0 || !result.stdout) {
      return [];
    }

    return result.stdout
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  }

  private async killProcessTree(pid: number): Promise<void> {
    if (!this.isPidAlive(pid)) {
      return;
    }

    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }

    const descendants = this.getDescendantPids(pid);
    for (const childPid of descendants) {
      this.killPid(childPid, "TERM");
    }
    this.killPid(pid, "TERM");

    await this.sleep(400);

    for (const childPid of descendants) {
      if (this.isPidAlive(childPid)) {
        this.killPid(childPid, "KILL");
      }
    }
    if (this.isPidAlive(pid)) {
      this.killPid(pid, "KILL");
    }
  }

  private getDescendantPids(parentPid: number): number[] {
    const seen = new Set<number>();
    const queue: number[] = [parentPid];
    const descendants: number[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }

      const output = spawnSync("pgrep", ["-P", String(current)], { encoding: "utf-8" });
      if (output.status !== 0 || !output.stdout) {
        continue;
      }

      const children = output.stdout
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0);

      for (const childPid of children) {
        if (seen.has(childPid)) {
          continue;
        }
        seen.add(childPid);
        descendants.push(childPid);
        queue.push(childPid);
      }
    }

    return descendants.reverse();
  }

  private killPid(pid: number, signal: "TERM" | "KILL"): void {
    spawnSync("kill", [`-${signal}`, String(pid)], { stdio: "ignore" });
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[ProcessSupervisor] ${message}`);
    }
  }
}

