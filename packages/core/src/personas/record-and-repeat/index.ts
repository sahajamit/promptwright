import path from "path";
import { fileURLToPath } from "url";
import type { Persona } from "../types.js";
import { PLAYWRIGHT_MCP_CONFIG } from "./mcp-config.js";
import { RECORD_AND_REPEAT_SYSTEM_PROMPT, buildCLISystemPromptForObserver } from "./system-prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Workflow Observer Persona
 *
 * AI observes browser workflows, learns from user interactions via CDP,
 * and creates intelligent documentation including feature specs and Gherkin test scenarios.
 */
export const RECORD_AND_REPEAT_PERSONA: Persona = {
  id: "record-and-repeat",
  name: "Workflow Observer",
  description:
    "AI observes your browser workflows and creates intelligent documentation like feature specs and test scenarios based on what it learns.",
  icon: "👁️", // Eye for observation/watching
  systemPrompt: RECORD_AND_REPEAT_SYSTEM_PROMPT,
  requiredMCPs: [PLAYWRIGHT_MCP_CONFIG],
  skillPath: path.join(__dirname, "SKILL.md"),
  enabled: true,
};

// Export CLI system prompt builder for use in main process
export { buildCLISystemPromptForObserver };
