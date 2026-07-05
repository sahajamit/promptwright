/**
 * Agent Registry
 *
 * Manages agent definitions loaded from .agent.md files.
 * Supports built-in agents (shipped with the app) and external agents
 * (user-defined in ~/.promptwright/agents/).
 */

import { existsSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseAgentFile } from "./parser.js";
import type { AgentDefinition, AgentMetadata } from "./types.js";
import { toAgentMetadata } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentRegistry {
  private agents: Map<string, AgentDefinition> = new Map();

  /**
   * Load built-in agents from the built-in/ directory.
   */
  async loadBuiltInAgents(): Promise<void> {
    const builtInDir = path.join(__dirname, "built-in");
    await this.loadAgentsFromDir(builtInDir, true);
  }

  /**
   * Load external (user-provided) agents from a directory.
   */
  async loadExternalAgents(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    await this.loadAgentsFromDir(dir, false);
  }

  /**
   * Scan a directory for .agent.md files and load them.
   */
  private async loadAgentsFromDir(dir: string, builtIn: boolean): Promise<void> {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir).filter((f) => f.endsWith(".agent.md"));
    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const agent = parseAgentFile(filePath, builtIn);
        this.agents.set(agent.name, agent);
      } catch (err) {
        console.error(`[AgentRegistry] Failed to load ${file}:`, err);
      }
    }
  }

  /**
   * Register an agent definition directly.
   */
  register(agent: AgentDefinition): void {
    this.agents.set(agent.name, agent);
  }

  /**
   * Unregister an agent by name.
   */
  unregister(name: string): void {
    this.agents.delete(name);
  }

  /**
   * Get an agent by name.
   */
  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  /**
   * Get all registered agents.
   */
  getAll(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all enabled agents (excludes orchestrator).
   */
  getEnabled(): AgentDefinition[] {
    return this.getAll().filter((a) => a.enabled && a.name !== "orchestrator");
  }

  /**
   * Get agents by category.
   */
  getByCategory(category: string): AgentDefinition[] {
    return this.getAll().filter((a) => a.category === category);
  }

  /**
   * Get lightweight metadata for all agents.
   */
  getMetadata(): AgentMetadata[] {
    return this.getAll().map(toAgentMetadata);
  }

  /**
   * Get metadata for enabled (non-orchestrator) agents only.
   */
  getEnabledMetadata(): AgentMetadata[] {
    return this.getEnabled().map(toAgentMetadata);
  }

  /**
   * Apply per-agent config overrides (model, enabled).
   */
  applyConfigOverrides(overrides: Record<string, { model?: string; enabled?: boolean }>): void {
    for (const [name, override] of Object.entries(overrides)) {
      const agent = this.agents.get(name);
      if (!agent) continue;
      if (override.model !== undefined) agent.model = override.model;
      if (override.enabled !== undefined) agent.enabled = override.enabled;
    }
  }
}
