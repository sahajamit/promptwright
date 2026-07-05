/**
 * Agent Definition Parser
 *
 * Parses .agent.md files with YAML frontmatter + markdown body.
 * Uses a simple regex-based parser (no external dependency).
 */

import { readFileSync } from "fs";
import { parse as parseYAML } from "yaml";
import type { AgentDefinition } from "./types.js";

/**
 * Frontmatter fields expected in .agent.md files.
 */
interface AgentFrontmatter {
  name: string;
  displayName: string;
  tag?: string;
  description: string;
  model?: string;
  tools?: string[];
  category: string;
  mcpServers?: Record<string, any>;
  skills?: string[];
  enabled?: boolean;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse an .agent.md file into an AgentDefinition.
 */
export function parseAgentFile(filePath: string, builtIn: boolean): AgentDefinition {
  const content = readFileSync(filePath, "utf-8");
  return parseAgentContent(content, filePath, builtIn);
}

/**
 * Parse .agent.md content string into an AgentDefinition.
 */
export function parseAgentContent(
  content: string,
  filePath: string | undefined,
  builtIn: boolean,
): AgentDefinition {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new Error(`Invalid .agent.md format: missing YAML frontmatter in ${filePath ?? "content"}`);
  }

  const [, yamlStr, markdownBody] = match;
  const frontmatter = parseYAML(yamlStr) as AgentFrontmatter;

  // Validate required fields
  if (!frontmatter.name) throw new Error(`Agent file missing 'name': ${filePath}`);
  if (!frontmatter.displayName) throw new Error(`Agent file missing 'displayName': ${filePath}`);
  if (!frontmatter.description) throw new Error(`Agent file missing 'description': ${filePath}`);
  if (!frontmatter.category) throw new Error(`Agent file missing 'category': ${filePath}`);

  return {
    name: frontmatter.name,
    displayName: frontmatter.displayName,
    tag: frontmatter.tag,
    description: frontmatter.description,
    model: frontmatter.model,
    tools: frontmatter.tools,
    category: frontmatter.category,
    mcpServers: frontmatter.mcpServers,
    skills: frontmatter.skills,
    prompt: markdownBody.trim(),
    enabled: frontmatter.enabled !== false,
    builtIn,
    filePath,
  };
}
