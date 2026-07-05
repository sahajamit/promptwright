/**
 * Gherkin Generator
 *
 * Generates Gherkin text from AST or recorded actions
 */

import type {
  GherkinFeature,
  GherkinScenario,
  GherkinStep,
  GherkinBackground,
} from "./types.js";
import type { RecordedSession, RecordedAction, LocatorSet } from "../recording/types.js";

/**
 * Gherkin Generator Options
 */
export interface GherkinGeneratorOptions {
  /** Feature name */
  featureName?: string;
  /** Feature description */
  featureDescription?: string;
  /** Scenario name */
  scenarioName?: string;
  /** Tags to add */
  tags?: string[];
  /** Include comments with locators */
  includeLocatorComments?: boolean;
  /** Use Scenario Outline for parameterized data */
  useScenarioOutline?: boolean;
  /** Indent size (spaces) */
  indentSize?: number;
}

const DEFAULT_OPTIONS: GherkinGeneratorOptions = {
  featureName: "Recorded Test Scenario",
  scenarioName: "User interaction flow",
  includeLocatorComments: true,
  useScenarioOutline: true,
  indentSize: 2,
};

/**
 * Gherkin Generator
 */
export class GherkinGenerator {
  private options: GherkinGeneratorOptions;

  constructor(options: GherkinGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate Gherkin text from a feature AST
   */
  generateFromFeature(feature: GherkinFeature): string {
    const lines: string[] = [];
    const indent = " ".repeat(this.options.indentSize || 2);

    // Tags
    if (feature.tags?.length) {
      lines.push(feature.tags.map((t) => `@${t}`).join(" "));
    }

    // Feature
    lines.push(`Feature: ${feature.name}`);
    if (feature.description) {
      for (const line of feature.description.split("\n")) {
        lines.push(`${indent}${line}`);
      }
    }
    lines.push("");

    // Background
    if (feature.background) {
      lines.push(...this.generateBackground(feature.background, indent));
      lines.push("");
    }

    // Scenarios
    for (const scenario of feature.scenarios) {
      lines.push(...this.generateScenario(scenario, indent));
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  /**
   * Generate Gherkin text from a recorded session
   */
  generateFromSession(session: RecordedSession): string {
    const feature = this.sessionToFeature(session);
    return this.generateFromFeature(feature);
  }

  /**
   * Convert a recorded session to a Gherkin feature
   */
  sessionToFeature(session: RecordedSession): GherkinFeature {
    const steps = this.actionsToSteps(session.actions);
    const testData = this.extractTestData(session.actions);

    const scenario: GherkinScenario = {
      type: testData.length > 0 && this.options.useScenarioOutline 
        ? "Scenario Outline" 
        : "Scenario",
      name: this.options.scenarioName || "User interaction flow",
      steps,
    };

    // Add examples if we have test data
    if (testData.length > 0 && this.options.useScenarioOutline) {
      scenario.examples = [{
        headers: testData.map((d) => d.name),
        rows: [testData.map((d) => d.value)],
      }];

      // Replace values in steps with placeholders
      for (const step of scenario.steps) {
        for (const data of testData) {
          if (step.actionValue === data.value) {
            step.text = step.text.replace(`"${data.value}"`, `"<${data.name}>"`);
          }
        }
      }
    }

    return {
      name: this.options.featureName || "Recorded Test Scenario",
      description: this.options.featureDescription ||
        `Recorded on ${new Date(session.startTime).toISOString()}\nStarting URL: ${session.startUrl}`,
      tags: this.options.tags,
      scenarios: [scenario],
    };
  }

  /**
   * Convert recorded actions to Gherkin steps
   */
  private actionsToSteps(actions: RecordedAction[]): GherkinStep[] {
    const steps: GherkinStep[] = [];
    let isFirst = true;

    for (const action of actions) {
      const step = this.actionToStep(action, isFirst);
      if (step) {
        steps.push(step);
        isFirst = false;
      }
    }

    return steps;
  }

  /**
   * Convert a single action to a Gherkin step
   */
  private actionToStep(action: RecordedAction, isFirst: boolean): GherkinStep | null {
    const stepKeyword: GherkinStep["keyword"] = isFirst ? "Given" : "When";

    switch (action.type) {
      case "navigate":
        return {
          keyword: stepKeyword,
          text: `I am on the page "${action.url}"`,
          actionType: "navigate",
          actionValue: action.url,
        };

      case "click":
        if (action.target) {
          const locator = this.getBestLocator(action.target.locators);
          const description = this.getElementDescription(action.target);
          return {
            keyword: "When",
            text: `I click on ${description}`,
            locator,
            actionType: "click",
          };
        }
        return null;

      case "type":
        if (action.target && action.value) {
          const locator = this.getBestLocator(action.target.locators);
          const description = this.getElementDescription(action.target);
          return {
            keyword: "When",
            text: `I enter "${action.value}" into ${description}`,
            locator,
            actionType: "type",
            actionValue: action.value,
          };
        }
        return null;

      case "select":
        if (action.target && action.value) {
          const locator = this.getBestLocator(action.target.locators);
          const description = this.getElementDescription(action.target);
          return {
            keyword: "When",
            text: `I select "${action.value}" from ${description}`,
            locator,
            actionType: "select",
            actionValue: action.value,
          };
        }
        return null;

      case "check":
      case "uncheck":
        if (action.target) {
          const locator = this.getBestLocator(action.target.locators);
          const description = this.getElementDescription(action.target);
          return {
            keyword: "When",
            text: `I ${action.type} ${description}`,
            locator,
            actionType: "check",
          };
        }
        return null;

      case "submit":
        return {
          keyword: "When",
          text: "I submit the form",
          actionType: "click",
        };

      case "scroll":
        if (action.isSignificantScroll) {
          return {
            keyword: "When",
            text: `I scroll to position (${action.scrollPosition?.x}, ${action.scrollPosition?.y})`,
            actionType: "scroll",
          };
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Get a human-readable element description
   */
  private getElementDescription(target: RecordedAction["target"]): string {
    if (!target) return "the element";

    const { locators, tagName, textContent, attributes } = target;

    // Button with text
    if (tagName === "button" && textContent) {
      return `the "${textContent}" button`;
    }

    // Link with text
    if (tagName === "a" && textContent) {
      return `the "${textContent}" link`;
    }

    // Input with label or placeholder
    if (["input", "textarea"].includes(tagName)) {
      if (locators.label) {
        return `the "${locators.label}" field`;
      }
      if (locators.placeholder) {
        return `the "${locators.placeholder}" field`;
      }
      if (attributes?.name) {
        return `the "${attributes.name}" field`;
      }
      if (attributes?.type) {
        return `the ${attributes.type} field`;
      }
    }

    // Select with label
    if (tagName === "select") {
      if (locators.label) {
        return `the "${locators.label}" dropdown`;
      }
      return "the dropdown";
    }

    // Test ID
    if (locators.testId) {
      return `the element [${locators.testId}]`;
    }

    // Fallback
    return `the ${tagName} element`;
  }

  /**
   * Get the best locator from a locator set
   */
  private getBestLocator(locators: LocatorSet): string {
    // Priority: testId > role+text > text > placeholder > label > css
    if (locators.testId) return locators.testId;
    if (locators.role && locators.text) return `${locators.role}:has-text("${locators.text}")`;
    if (locators.text) return `text="${locators.text}"`;
    if (locators.placeholder) return `[placeholder="${locators.placeholder}"]`;
    if (locators.label) return `label:has-text("${locators.label}")`;
    if (locators.css) return locators.css;
    return "element";
  }

  /**
   * Extract test data (typed values) from actions
   */
  private extractTestData(
    actions: RecordedAction[]
  ): Array<{ name: string; value: string }> {
    const data: Array<{ name: string; value: string }> = [];

    for (const action of actions) {
      if (action.type === "type" && action.value && action.target) {
        const name = this.inferFieldName(action.target);
        if (name && !data.some((d) => d.name === name)) {
          data.push({ name, value: action.value });
        }
      }
    }

    return data;
  }

  /**
   * Infer a field name from an element target
   */
  private inferFieldName(target: RecordedAction["target"]): string | null {
    if (!target) return null;

    const { locators, attributes } = target;

    // Use label first
    if (locators.label) {
      return locators.label.toLowerCase().replace(/\s+/g, "_");
    }

    // Then placeholder
    if (locators.placeholder) {
      return locators.placeholder.toLowerCase().replace(/\s+/g, "_");
    }

    // Then name attribute
    if (attributes?.name) {
      return attributes.name;
    }

    // Then id
    if (attributes?.id) {
      return attributes.id;
    }

    // Input type as fallback
    if (attributes?.type) {
      return attributes.type;
    }

    return null;
  }

  /**
   * Generate background section
   */
  private generateBackground(
    background: GherkinBackground,
    indent: string
  ): string[] {
    const lines: string[] = [];
    lines.push(`${indent}Background:${background.name ? " " + background.name : ""}`);
    for (const step of background.steps) {
      lines.push(`${indent}${indent}${step.keyword} ${step.text}`);
    }
    return lines;
  }

  /**
   * Generate scenario section
   */
  private generateScenario(scenario: GherkinScenario, indent: string): string[] {
    const lines: string[] = [];

    // Tags
    if (scenario.tags?.length) {
      lines.push(`${indent}${scenario.tags.map((t) => `@${t}`).join(" ")}`);
    }

    // Scenario header
    lines.push(`${indent}${scenario.type}: ${scenario.name}`);

    // Description
    if (scenario.description) {
      for (const line of scenario.description.split("\n")) {
        lines.push(`${indent}${indent}${line}`);
      }
    }

    // Steps
    for (const step of scenario.steps) {
      let stepLine = `${indent}${indent}${step.keyword} ${step.text}`;
      lines.push(stepLine);

      // Locator comment
      if (this.options.includeLocatorComments && step.locator) {
        lines.push(`${indent}${indent}# Locator: ${step.locator}`);
      }

      // Data table
      if (step.dataTable) {
        for (const row of step.dataTable) {
          lines.push(`${indent}${indent}${indent}| ${row.join(" | ")} |`);
        }
      }

      // Doc string
      if (step.docString) {
        lines.push(`${indent}${indent}${indent}"""`);
        for (const line of step.docString.split("\n")) {
          lines.push(`${indent}${indent}${indent}${line}`);
        }
        lines.push(`${indent}${indent}${indent}"""`);
      }
    }

    // Examples
    if (scenario.examples?.length) {
      for (const examples of scenario.examples) {
        lines.push("");
        lines.push(`${indent}${indent}Examples:${examples.name ? " " + examples.name : ""}`);
        lines.push(
          `${indent}${indent}${indent}| ${examples.headers.join(" | ")} |`
        );
        for (const row of examples.rows) {
          lines.push(`${indent}${indent}${indent}| ${row.join(" | ")} |`);
        }
      }
    }

    return lines;
  }
}

/**
 * Create a generator with default options
 */
export function createGherkinGenerator(
  options?: GherkinGeneratorOptions
): GherkinGenerator {
  return new GherkinGenerator(options);
}
