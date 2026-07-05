import * as readline from "readline";
import { colors } from "./colors.js";

const PROMPT_TEXT = "promptwright> ";

/**
 * Print the Promptwright prompt
 */
export function printPrompt(): void {
  process.stdout.write(colors.prompt(PROMPT_TEXT));
}

/**
 * Clear the current line and reprint prompt
 */
export function clearAndPrintPrompt(): void {
  process.stdout.write("\r" + " ".repeat(80) + "\r");
  printPrompt();
}

/**
 * Create a readline interface for user input
 */
export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
}

/**
 * Print streaming delta content (no newline)
 */
export function printDelta(content: string): void {
  process.stdout.write(content);
}

/**
 * Print tool execution status
 */
export function printToolStatus(toolName: string, status: "start" | "complete"): void {
  if (status === "start") {
    console.log(colors.toolStatus(`  ⚙ Running: ${colors.toolName(toolName)}`));
  } else {
    console.log(colors.toolStatus(`  ✓ Completed: ${colors.toolName(toolName)}`));
  }
}

/**
 * Print reasoning/thinking content
 */
export function printReasoning(content: string): void {
  process.stdout.write(colors.muted(content));
}
