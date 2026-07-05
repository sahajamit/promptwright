/**
 * Skill Parser
 *
 * Parses SKILL.md files with YAML frontmatter + markdown body.
 */

import { readFileSync } from "fs";
import path from "path";
import { parse as parseYAML } from "yaml";
import type { SkillDefinition } from "./types.js";

interface SkillFrontmatter {
  name: string;
  description: string;
  tools?: string[];
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a SKILL.md file into a SkillDefinition.
 */
export function parseSkillFile(filePath: string): SkillDefinition {
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    // Legacy SKILL.md files without frontmatter — use filename-based defaults
    const dirPath = path.dirname(filePath);
    const dirName = path.basename(dirPath);
    return {
      name: dirName,
      description: `Skill from ${dirName}`,
      prompt: content.trim(),
      dirPath,
    };
  }

  const [, yamlStr, markdownBody] = match;
  const frontmatter = parseYAML(yamlStr) as SkillFrontmatter;

  if (!frontmatter.name) throw new Error(`Skill file missing 'name': ${filePath}`);
  if (!frontmatter.description) throw new Error(`Skill file missing 'description': ${filePath}`);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    tools: frontmatter.tools,
    prompt: markdownBody.trim(),
    dirPath: path.dirname(filePath),
  };
}
