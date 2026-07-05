/**
 * Skill Definition Types
 *
 * Skills are additional instruction sets that can be injected into agent sessions.
 * Each skill is a SKILL.md file with YAML frontmatter + markdown body.
 */

/**
 * Full skill definition parsed from a SKILL.md file.
 */
export interface SkillDefinition {
  /** Unique skill name */
  name: string;
  /** Short description */
  description: string;
  /** Tool names this skill provides or requires */
  tools?: string[];
  /** Full skill prompt (markdown body) */
  prompt: string;
  /** Directory containing the SKILL.md file */
  dirPath: string;
}

/**
 * Lightweight skill metadata for listing.
 */
export interface SkillMetadata {
  name: string;
  description: string;
  tools?: string[];
}

/**
 * Extract metadata from a skill definition.
 */
export function toSkillMetadata(skill: SkillDefinition): SkillMetadata {
  return {
    name: skill.name,
    description: skill.description,
    tools: skill.tools,
  };
}
