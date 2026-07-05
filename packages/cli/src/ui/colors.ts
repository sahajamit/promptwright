import chalk from "chalk";

/**
 * Color definitions for Promptwright branding
 */
export const colors = {
  // Primary Promptwright colors
  prompt: chalk.cyan.bold,
  banner: chalk.cyan.bold,

  // Status colors
  success: chalk.green,
  error: chalk.red.bold,
  warning: chalk.yellow,
  info: chalk.yellow,

  // Content colors
  output: chalk.white,
  muted: chalk.gray,
  highlight: chalk.cyan,

  // Tool execution
  toolName: chalk.magenta,
  toolStatus: chalk.blue,
};

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(colors.success(`✓ ${message}`));
}

/**
 * Print an error message
 */
export function printError(message: string): void {
  console.log(colors.error(`✗ Error: ${message}`));
}

/**
 * Print an info message
 */
export function printInfo(message: string): void {
  console.log(colors.info(`ℹ ${message}`));
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(colors.warning(`⚠ ${message}`));
}

/**
 * Print muted/secondary text
 */
export function printMuted(message: string): void {
  console.log(colors.muted(message));
}

/**
 * Print debug message (for verbose mode)
 */
export function printDebug(message: string): void {
  console.log(colors.muted(`[DEBUG] ${message}`));
}
