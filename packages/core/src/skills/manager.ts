/**
 * Skill Manager
 *
 * Loads and manages skill definitions from SKILL.md files.
 */

import { existsSync, readdirSync } from "fs";
import path from "path";
import { parseSkillFile } from "./parser.js";
import type { SkillDefinition, SkillMetadata } from "./types.js";
import { toSkillMetadata } from "./types.js";

export class SkillManager {
  private skills: Map<string, SkillDefinition> = new Map();

  /**
   * Load skills from one or more directories.
   * Each directory should contain a SKILL.md file, or subdirectories that do.
   */
  async loadSkills(directories: string[]): Promise<void> {
    for (const dir of directories) {
      if (!existsSync(dir)) continue;

      // Check if the directory itself contains SKILL.md
      const directSkill = path.join(dir, "SKILL.md");
      if (existsSync(directSkill)) {
        try {
          const skill = parseSkillFile(directSkill);
          this.skills.set(skill.name, skill);
        } catch (err) {
          console.error(`[SkillManager] Failed to load ${directSkill}:`, err);
        }
        continue;
      }

      // Otherwise scan subdirectories for SKILL.md
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillFile = path.join(dir, entry.name, "SKILL.md");
        if (!existsSync(skillFile)) continue;
        try {
          const skill = parseSkillFile(skillFile);
          this.skills.set(skill.name, skill);
        } catch (err) {
          console.error(`[SkillManager] Failed to load ${skillFile}:`, err);
        }
      }
    }
  }

  /**
   * Get a skill by name.
   */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all loaded skills.
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get metadata for all skills.
   */
  getMetadata(): SkillMetadata[] {
    return this.getAll().map(toSkillMetadata);
  }
}
