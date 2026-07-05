/**
 * Replay Executor
 *
 * Executes Gherkin scenarios using Playwright MCP
 */

import { EventEmitter } from "events";
import type {
  GherkinFeature,
  GherkinScenario,
  GherkinStep,
  StepExecutionResult,
  ScenarioExecutionResult,
  FeatureExecutionResult,
} from "../gherkin/types.js";
import { parseGherkin, expandScenarioOutline } from "../gherkin/parser.js";

/**
 * Replay event types
 */
export type ReplayEvent =
  | { type: "feature_started"; feature: GherkinFeature }
  | { type: "feature_completed"; result: FeatureExecutionResult }
  | { type: "scenario_started"; scenario: GherkinScenario; index: number }
  | { type: "scenario_completed"; result: ScenarioExecutionResult }
  | { type: "step_started"; step: GherkinStep; index: number }
  | { type: "step_completed"; result: StepExecutionResult }
  | { type: "error"; error: string };

/**
 * Step executor function type
 * This will be provided by the caller and use JarvisClient/Playwright MCP
 */
export type StepExecutor = (
  step: GherkinStep,
  context: StepContext
) => Promise<{ success: boolean; error?: string }>;

/**
 * Context passed to step executor
 */
export interface StepContext {
  currentUrl?: string;
  variables: Record<string, string>;
}

/**
 * Replay options
 */
export interface ReplayOptions {
  /** Stop on first failure */
  stopOnFailure?: boolean;
  /** Take screenshot after each step */
  screenshotAfterStep?: boolean;
  /** Timeout per step in milliseconds */
  stepTimeout?: number;
}

const DEFAULT_OPTIONS: ReplayOptions = {
  stopOnFailure: false,
  screenshotAfterStep: false,
  stepTimeout: 30000,
};

/**
 * Replay Executor
 *
 * Executes Gherkin scenarios step by step
 */
export class ReplayExecutor extends EventEmitter {
  private options: ReplayOptions;
  private stepExecutor: StepExecutor;
  private isRunning = false;
  private shouldStop = false;

  constructor(stepExecutor: StepExecutor, options: ReplayOptions = {}) {
    super();
    this.stepExecutor = stepExecutor;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Check if replay is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Stop the current replay
   */
  stop(): void {
    this.shouldStop = true;
  }

  /**
   * Execute a feature from Gherkin text
   */
  async executeGherkinText(gherkinText: string): Promise<FeatureExecutionResult> {
    const parseResult = parseGherkin(gherkinText);
    if (parseResult.errors?.length) {
      throw new Error(`Parse errors: ${parseResult.errors.join(", ")}`);
    }
    return this.executeFeature(parseResult.feature);
  }

  /**
   * Execute a feature
   */
  async executeFeature(feature: GherkinFeature): Promise<FeatureExecutionResult> {
    if (this.isRunning) {
      throw new Error("Replay already in progress");
    }

    this.isRunning = true;
    this.shouldStop = false;

    const startTime = Date.now();
    const scenarioResults: ScenarioExecutionResult[] = [];

    this.emitEvent({ type: "feature_started", feature });

    try {
      for (let i = 0; i < feature.scenarios.length; i++) {
        if (this.shouldStop) break;

        const scenario = feature.scenarios[i];

        // Expand scenario outline
        const expandedScenarios = expandScenarioOutline(scenario);

        for (let j = 0; j < expandedScenarios.length; j++) {
          if (this.shouldStop) break;

          const expandedScenario = expandedScenarios[j];
          this.emitEvent({
            type: "scenario_started",
            scenario: expandedScenario,
            index: i,
          });

          const result = await this.executeScenario(
            expandedScenario,
            feature.background
          );
          scenarioResults.push(result);

          this.emitEvent({ type: "scenario_completed", result });

          if (!result.passed && this.options.stopOnFailure) {
            break;
          }
        }
      }

      const endTime = Date.now();
      const featureResult: FeatureExecutionResult = {
        feature,
        scenarioResults,
        passed: scenarioResults.every((r) => r.passed),
        duration: endTime - startTime,
        startTime,
        endTime,
      };

      this.emitEvent({ type: "feature_completed", result: featureResult });

      return featureResult;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute a scenario
   */
  private async executeScenario(
    scenario: GherkinScenario,
    background?: { steps: GherkinStep[] }
  ): Promise<ScenarioExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepExecutionResult[] = [];
    const context: StepContext = { variables: {} };

    // Execute background steps first
    if (background?.steps) {
      for (const step of background.steps) {
        if (this.shouldStop) break;

        const result = await this.executeStep(step, context);
        stepResults.push(result);

        if (!result.passed && this.options.stopOnFailure) {
          break;
        }
      }
    }

    // Execute scenario steps
    for (let i = 0; i < scenario.steps.length; i++) {
      if (this.shouldStop) break;

      const step = scenario.steps[i];
      this.emitEvent({ type: "step_started", step, index: i });

      const result = await this.executeStep(step, context);
      stepResults.push(result);

      this.emitEvent({ type: "step_completed", result });

      if (!result.passed && this.options.stopOnFailure) {
        break;
      }
    }

    return {
      scenario,
      stepResults,
      passed: stepResults.every((r) => r.passed),
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: GherkinStep,
    context: StepContext
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();

    try {
      // Apply timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Step timeout")),
          this.options.stepTimeout
        );
      });

      const executionPromise = this.stepExecutor(step, context);
      const result = await Promise.race([executionPromise, timeoutPromise]);

      return {
        step,
        passed: result.success,
        error: result.error,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Emit a replay event
   */
  private emitEvent(event: ReplayEvent): void {
    this.emit("replay-event", event);
  }

  /**
   * Subscribe to replay events
   */
  onEvent(handler: (event: ReplayEvent) => void): () => void {
    this.on("replay-event", handler);
    return () => this.off("replay-event", handler);
  }
}

/**
 * Create a step executor that formats prompts for Playwright MCP
 */
export function createPlaywrightStepExecutor(
  sendMessage: (prompt: string) => Promise<string>
): StepExecutor {
  return async (step, _context) => {
    // Build the prompt for Playwright MCP
    let prompt = "";

    switch (step.actionType) {
      case "navigate":
        prompt = `Navigate to ${step.actionValue || step.text}`;
        break;

      case "click":
        prompt = `Click on the element: ${step.locator || step.text}`;
        break;

      case "type":
        prompt = `Type "${step.actionValue}" into the element: ${step.locator || step.text}`;
        break;

      case "select":
        prompt = `Select "${step.actionValue}" from the dropdown: ${step.locator || step.text}`;
        break;

      case "check":
        prompt = `Check/toggle the checkbox: ${step.locator || step.text}`;
        break;

      case "scroll":
        prompt = `Scroll the page as needed`;
        break;

      case "assert":
        prompt = `Verify that: ${step.text}`;
        break;

      default:
        // Try to interpret the step text
        prompt = `Execute this test step: ${step.keyword} ${step.text}`;
    }

    try {
      await sendMessage(prompt);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
