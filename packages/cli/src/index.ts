#!/usr/bin/env node

import { Command } from "commander";
import { JarvisClient, resolveProviderConfig, type JarvisEvent } from "@promptwright/core";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
import {
  printBanner,
  printWelcome,
  printSeparator,
  printExitMessage,
} from "./ui/banner.js";
import {
  printPrompt,
  printDelta,
  printToolStatus,
  printReasoning,
  createReadlineInterface,
} from "./ui/prompt.js";
import { printSuccess, printError, printInfo, printDebug } from "./ui/colors.js";

// Parse command line arguments
const program = new Command()
  .name("promptwright")
  .description("Promptwright - AI QA agent powered by GitHub Copilot")
  .version(version)
  .option("-w, --workdir <path>", "Working directory for Copilot operations")
  .option("-v, --verbose", "Show verbose output including debug logs")
  .option("-m, --model <name>", "Model to use (omit to use default)")
  .option("--provider-type <type>", "Custom provider type: azure | openai | anthropic")
  .option("--provider-url <url>", "Custom provider base URL")
  .option("--provider-key <key>", "Custom provider API key")
  .option("--provider-model <model>", "Custom provider model ID")
  .parse(process.argv);

const options = program.opts();

/**
 * Handle JarvisClient events
 */
function handleEvent(event: JarvisEvent, verbose: boolean): void {
  switch (event.type) {
    case "message_delta":
      printDelta(event.content);
      break;

    case "message_complete":
      // Message complete, will print prompt after session_idle
      break;

    case "reasoning_delta":
      if (verbose) {
        printReasoning(event.content);
      }
      break;

    case "reasoning_complete":
      if (verbose) {
        console.log(); // New line after reasoning
      }
      break;

    case "tool_start":
      if (verbose) {
        printToolStatus(event.toolName, "start");
      }
      break;

    case "tool_complete":
      if (verbose) {
        printToolStatus(event.toolCallId, "complete");
      }
      break;

    case "session_idle":
      console.log(); // Ensure we're on a new line
      printPrompt();
      break;

    case "session_error":
      printError(event.error);
      break;

    case "debug_log":
      if (verbose) {
        printDebug(event.message);
      }
      break;

    case "connecting":
      // Handled in main
      break;

    case "connected":
      // Handled in main
      break;

    case "disconnected":
      // Handled in cleanup
      break;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Determine options early
  const workDir = options.workdir || process.cwd();
  const verbose = options.verbose || false;
  const model = options.model; // undefined means use default

  // Print banner and welcome
  printBanner();
  printWelcome(model);

  if (verbose) {
    printInfo(`Working directory: ${workDir}`);
    printInfo(`Verbose mode: enabled`);
    if (model) {
      printInfo(`Requested model: ${model}`);
    } else {
      printInfo(`Model: using Copilot default`);
    }
  }

  // Build provider config (BYOK). CLI flags take precedence; env vars fill the
  // gaps via resolveProviderConfig, so a fully env-driven launch works too
  // (e.g. zero-cost local Ollama with PROMPTWRIGHT_PROVIDER_BASE_URL/_MODEL).
  const flagProvider = (options.providerType || options.providerUrl || options.providerModel || options.providerKey)
    ? {
        type: options.providerType as "azure" | "openai" | "anthropic" | undefined,
        baseUrl: options.providerUrl as string | undefined,
        apiKey: (options.providerKey as string) || undefined,
        model: options.providerModel as string | undefined,
      }
    : undefined;
  const providerOption = resolveProviderConfig(flagProvider);

  if (providerOption && verbose) {
    printInfo(`Custom provider: ${providerOption.type} @ ${providerOption.baseUrl} (model: ${providerOption.model})`);
  }

  // Create JARVIS client
  const client = new JarvisClient({
    workDir,
    verbose,
    model: providerOption?.model || model,
    provider: providerOption,
  });

  // Set up event handler
  client.onEvent((event) => handleEvent(event, verbose));

  // Set up signal handlers for graceful shutdown
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    printExitMessage();
    await client.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    // Start the client
    printInfo("Starting GitHub Copilot CLI...");
    await client.start();
    
    const activeModel = client.getActiveModel();
    printSuccess(`Connected! Model: ${activeModel || "default"}`);
    printSeparator();
    console.log();

    // Create readline interface
    const rl = createReadlineInterface();

    // Print initial prompt
    printPrompt();

    // Handle user input
    rl.on("line", async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        printPrompt();
        return;
      }

      // Handle special commands
      if (trimmed === "/exit" || trimmed === "/quit") {
        await shutdown();
        return;
      }

      if (trimmed === "/help") {
        printInfo("Type your questions or commands. Use /exit to quit.");
        printPrompt();
        return;
      }

      try {
        // Send message to Copilot (events will stream the response)
        await client.sendMessage(trimmed);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        printPrompt();
      }
    });

    // Handle readline close
    rl.on("close", shutdown);
  } catch (error) {
    printError(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  printError(`Unhandled error: ${error.message}`);
  process.exit(1);
});
