import path from "path";
import { fileURLToPath } from "url";
import { API_TEST_EXECUTION_SYSTEM_PROMPT } from "./system-prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to the API test execution SKILL.md file.
 * Copied from src/ to dist/ by the build script (see package.json).
 */
export const API_TEST_EXECUTION_SKILL_PATH = path.join(__dirname, "SKILL.md");

export { API_TEST_EXECUTION_SYSTEM_PROMPT };
