/**
 * Gherkin Types
 *
 * Types for Gherkin AST and parsing
 */

/**
 * Gherkin step keyword
 */
export type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

/**
 * A single Gherkin step
 */
export interface GherkinStep {
  /** Step keyword (Given, When, Then, And, But) */
  keyword: StepKeyword;
  /** Step text/description */
  text: string;
  /** Optional data table */
  dataTable?: string[][];
  /** Optional doc string */
  docString?: string;
  /** Line number in original file */
  line?: number;
  /** Original locator info (for replay) */
  locator?: string;
  /** Action type hint (for replay) */
  actionType?: "navigate" | "click" | "type" | "select" | "check" | "scroll" | "assert";
  /** Action value (for type/select) */
  actionValue?: string;
}

/**
 * Examples table for Scenario Outline
 */
export interface GherkinExamples {
  /** Examples table name */
  name?: string;
  /** Table headers */
  headers: string[];
  /** Table rows */
  rows: string[][];
  /** Tags for this examples block */
  tags?: string[];
}

/**
 * A Gherkin scenario or scenario outline
 */
export interface GherkinScenario {
  /** Scenario type */
  type: "Scenario" | "Scenario Outline";
  /** Scenario name */
  name: string;
  /** Scenario description */
  description?: string;
  /** Tags (e.g., @smoke, @login) */
  tags?: string[];
  /** Steps in the scenario */
  steps: GherkinStep[];
  /** Examples (for Scenario Outline) */
  examples?: GherkinExamples[];
}

/**
 * Background steps (run before each scenario)
 */
export interface GherkinBackground {
  /** Background name */
  name?: string;
  /** Background steps */
  steps: GherkinStep[];
}

/**
 * A Gherkin feature file
 */
export interface GherkinFeature {
  /** Feature name */
  name: string;
  /** Feature description */
  description?: string;
  /** Tags (e.g., @regression) */
  tags?: string[];
  /** Background (optional) */
  background?: GherkinBackground;
  /** Scenarios */
  scenarios: GherkinScenario[];
  /** Comments in the file */
  comments?: string[];
}

/**
 * Parse result
 */
export interface GherkinParseResult {
  /** Parsed feature */
  feature: GherkinFeature;
  /** Any parse errors */
  errors?: string[];
  /** Any warnings */
  warnings?: string[];
}

/**
 * Step execution result (for replay)
 */
export interface StepExecutionResult {
  /** Step that was executed */
  step: GherkinStep;
  /** Whether the step passed */
  passed: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Screenshot after step (base64) */
  screenshot?: string;
}

/**
 * Scenario execution result
 */
export interface ScenarioExecutionResult {
  /** Scenario that was executed */
  scenario: GherkinScenario;
  /** Results for each step */
  stepResults: StepExecutionResult[];
  /** Overall pass/fail */
  passed: boolean;
  /** Total duration */
  duration: number;
  /** Example row index (for Scenario Outline) */
  exampleIndex?: number;
}

/**
 * Feature execution result
 */
export interface FeatureExecutionResult {
  /** Feature that was executed */
  feature: GherkinFeature;
  /** Results for each scenario */
  scenarioResults: ScenarioExecutionResult[];
  /** Overall pass/fail */
  passed: boolean;
  /** Total duration */
  duration: number;
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
}
