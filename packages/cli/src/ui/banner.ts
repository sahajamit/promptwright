import { colors, printInfo } from "./colors.js";

/**
 * ASCII art banner for Promptwright
 */
const BANNER = `
──────────────────────────────────────────────────────────
   ◆  P R O M P T W R I G H T
      AI QA agent · prompt or record your browser flows
──────────────────────────────────────────────────────────
`;

/**
 * Print the Promptwright banner
 */
export function printBanner(): void {
  console.log(colors.banner(BANNER));
}

/**
 * Print welcome message with optional model info
 */
export function printWelcome(model?: string): void {
  printInfo("Promptwright is initializing...");
  printInfo("Connecting to GitHub Copilot...");
  if (model) {
    printInfo(`Requested model: ${model}`);
  }
  console.log();
}

/**
 * Print a separator line
 */
export function printSeparator(): void {
  console.log(colors.muted("─".repeat(60)));
}

/**
 * Print exit message
 */
export function printExitMessage(): void {
  console.log();
  printInfo("Promptwright shutting down...");
  console.log(colors.success("✓ Goodbye!"));
}

/**
 * Print help information
 */
export function printHelp(): void {
  console.log();
  console.log(colors.banner("═".repeat(60)));
  console.log(colors.prompt("Promptwright - Command Line Assistant"));
  console.log(colors.banner("═".repeat(60)));

  console.log("\nUsage:");
  console.log("  promptwright [flags]");

  console.log("\nFlags:");
  console.log(colors.info("  -w, --workdir <path>    Set working directory (default: current)"));
  console.log(colors.info("  -v, --verbose           Show verbose output"));
  console.log(colors.info("  -m, --model <name>      Model to use (default: gpt-5)"));
  console.log(colors.info("  -h, --help              Show this help message"));

  console.log("\nExamples:");
  console.log(colors.success("  promptwright                     # Start in current directory"));
  console.log(colors.success("  promptwright -w /path/to/project # Start in specific directory"));
  console.log(colors.success("  promptwright -v                  # Start with verbose output"));

  console.log("\nControls:");
  console.log("  Ctrl+C                           Exit Promptwright");
  console.log("  Type your questions at the promptwright> prompt");

  console.log("\n" + colors.banner("═".repeat(60)) + "\n");
}
