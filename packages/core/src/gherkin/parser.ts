/**
 * Gherkin Parser
 *
 * Parses Gherkin text into AST for replay
 */

import type {
  GherkinFeature,
  GherkinScenario,
  GherkinStep,
  GherkinExamples,
  GherkinBackground,
  GherkinParseResult,
  StepKeyword,
} from "./types.js";

/**
 * Line with metadata
 */
interface ParsedLine {
  text: string;
  trimmed: string;
  indent: number;
  lineNumber: number;
}

/**
 * Gherkin Parser
 *
 * Simple parser for Gherkin feature files
 */
export class GherkinParser {
  private lines: ParsedLine[] = [];
  private currentLine = 0;
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Parse Gherkin text into a feature AST
   */
  parse(gherkinText: string): GherkinParseResult {
    this.errors = [];
    this.warnings = [];
    this.currentLine = 0;

    // Preprocess lines
    this.lines = gherkinText.split("\n").map((text, i) => ({
      text,
      trimmed: text.trim(),
      indent: text.length - text.trimStart().length,
      lineNumber: i + 1,
    }));

    // Skip empty lines and comments at the start
    this.skipWhitespaceAndComments();

    // Parse tags
    const tags = this.parseTags();

    // Expect Feature keyword
    const featureLine = this.currentLineData();
    if (!featureLine?.trimmed.startsWith("Feature:")) {
      this.errors.push(`Expected 'Feature:' at line ${featureLine?.lineNumber || 1}`);
      return {
        feature: this.createEmptyFeature(),
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    const featureName = featureLine.trimmed.replace(/^Feature:\s*/, "");
    this.advance();

    // Parse feature description
    const description = this.parseDescription();

    // Parse scenarios and background
    let background: GherkinBackground | undefined;
    const scenarios: GherkinScenario[] = [];

    while (this.currentLine < this.lines.length) {
      this.skipWhitespaceAndComments();

      const line = this.currentLineData();
      if (!line) break;

      // Check for tags
      const scenarioTags = this.parseTags();

      const currentLine = this.currentLineData();
      if (!currentLine) break;

      if (currentLine.trimmed.startsWith("Background:")) {
        if (background) {
          this.warnings.push(
            `Multiple backgrounds at line ${currentLine.lineNumber}, using first one`
          );
        } else {
          background = this.parseBackground();
        }
      } else if (
        currentLine.trimmed.startsWith("Scenario:") ||
        currentLine.trimmed.startsWith("Scenario Outline:")
      ) {
        const scenario = this.parseScenario(scenarioTags);
        if (scenario) {
          scenarios.push(scenario);
        }
      } else {
        this.advance(); // Skip unknown line
      }
    }

    return {
      feature: {
        name: featureName,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
        background,
        scenarios,
      },
      errors: this.errors.length > 0 ? this.errors : undefined,
      warnings: this.warnings.length > 0 ? this.warnings : undefined,
    };
  }

  /**
   * Get current line data
   */
  private currentLineData(): ParsedLine | undefined {
    return this.lines[this.currentLine];
  }

  /**
   * Advance to next line
   */
  private advance(): void {
    this.currentLine++;
  }

  /**
   * Skip whitespace and comments
   */
  private skipWhitespaceAndComments(): void {
    while (this.currentLine < this.lines.length) {
      const line = this.currentLineData();
      if (!line) break;

      if (line.trimmed === "" || line.trimmed.startsWith("#")) {
        this.advance();
      } else {
        break;
      }
    }
  }

  /**
   * Parse tags (lines starting with @)
   */
  private parseTags(): string[] {
    const tags: string[] = [];

    while (this.currentLine < this.lines.length) {
      const line = this.currentLineData();
      if (!line || !line.trimmed.startsWith("@")) break;

      const lineTags = line.trimmed.match(/@\w+/g);
      if (lineTags) {
        tags.push(...lineTags.map((t) => t.slice(1)));
      }
      this.advance();
    }

    return tags;
  }

  /**
   * Parse description (lines until next keyword)
   */
  private parseDescription(): string | null {
    const descriptionLines: string[] = [];

    while (this.currentLine < this.lines.length) {
      const line = this.currentLineData();
      if (!line) break;

      // Stop at keywords
      if (
        line.trimmed.startsWith("Background:") ||
        line.trimmed.startsWith("Scenario:") ||
        line.trimmed.startsWith("Scenario Outline:") ||
        line.trimmed.startsWith("@")
      ) {
        break;
      }

      // Skip empty lines at start of description
      if (descriptionLines.length === 0 && line.trimmed === "") {
        this.advance();
        continue;
      }

      descriptionLines.push(line.trimmed);
      this.advance();
    }

    // Trim trailing empty lines
    while (
      descriptionLines.length > 0 &&
      descriptionLines[descriptionLines.length - 1] === ""
    ) {
      descriptionLines.pop();
    }

    return descriptionLines.length > 0 ? descriptionLines.join("\n") : null;
  }

  /**
   * Parse background section
   */
  private parseBackground(): GherkinBackground {
    const line = this.currentLineData()!;
    const name = line.trimmed.replace(/^Background:\s*/, "") || undefined;
    this.advance();

    const steps = this.parseSteps();

    return { name, steps };
  }

  /**
   * Parse scenario or scenario outline
   */
  private parseScenario(tags: string[]): GherkinScenario | null {
    const line = this.currentLineData();
    if (!line) return null;

    const isOutline = line.trimmed.startsWith("Scenario Outline:");
    const type = isOutline ? "Scenario Outline" : "Scenario";
    const name = line.trimmed
      .replace(/^Scenario Outline:\s*/, "")
      .replace(/^Scenario:\s*/, "");

    this.advance();

    // Parse description
    const description = this.parseScenarioDescription();

    // Parse steps
    const steps = this.parseSteps();

    // Parse examples (for outline)
    let examples: GherkinExamples[] | undefined;
    if (isOutline) {
      examples = this.parseExamples();
    }

    return {
      type,
      name,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      steps,
      examples,
    };
  }

  /**
   * Parse scenario description (until first step)
   */
  private parseScenarioDescription(): string | null {
    const descriptionLines: string[] = [];

    while (this.currentLine < this.lines.length) {
      const line = this.currentLineData();
      if (!line) break;

      // Stop at step keywords
      if (this.isStepKeyword(line.trimmed)) {
        break;
      }

      // Stop at other keywords
      if (
        line.trimmed.startsWith("Background:") ||
        line.trimmed.startsWith("Scenario:") ||
        line.trimmed.startsWith("Scenario Outline:") ||
        line.trimmed.startsWith("Examples:") ||
        line.trimmed.startsWith("@")
      ) {
        break;
      }

      if (line.trimmed !== "") {
        descriptionLines.push(line.trimmed);
      }
      this.advance();
    }

    return descriptionLines.length > 0 ? descriptionLines.join("\n") : null;
  }

  /**
   * Check if line starts with a step keyword
   */
  private isStepKeyword(text: string): boolean {
    return /^(Given|When|Then|And|But)\s/.test(text);
  }

  /**
   * Parse step keyword
   */
  private parseStepKeyword(text: string): StepKeyword | null {
    const match = text.match(/^(Given|When|Then|And|But)\s/);
    return match ? (match[1] as StepKeyword) : null;
  }

  /**
   * Parse steps
   */
  private parseSteps(): GherkinStep[] {
    const steps: GherkinStep[] = [];

    while (this.currentLine < this.lines.length) {
      this.skipWhitespaceAndComments();

      const line = this.currentLineData();
      if (!line) break;

      const keyword = this.parseStepKeyword(line.trimmed);
      if (!keyword) break;

      const stepText = line.trimmed.replace(/^(Given|When|Then|And|But)\s+/, "");
      const step: GherkinStep = {
        keyword,
        text: stepText,
        line: line.lineNumber,
      };

      // Extract locator from comment on next line
      this.advance();
      const nextLine = this.currentLineData();
      if (nextLine?.trimmed.startsWith("# Locator:")) {
        step.locator = nextLine.trimmed.replace("# Locator:", "").trim();
        this.advance();
      }

      // Check for data table
      if (this.currentLineData()?.trimmed.startsWith("|")) {
        step.dataTable = this.parseDataTable();
      }

      // Check for doc string
      if (this.currentLineData()?.trimmed.startsWith('"""')) {
        step.docString = this.parseDocString();
      }

      // Infer action type from step text
      this.inferStepAction(step);

      steps.push(step);
    }

    return steps;
  }

  /**
   * Infer action type and value from step text
   */
  private inferStepAction(step: GherkinStep): void {
    const text = step.text.toLowerCase();

    if (text.includes("navigate") || text.includes("on the page")) {
      step.actionType = "navigate";
      const urlMatch = step.text.match(/"([^"]+)"/);
      if (urlMatch) step.actionValue = urlMatch[1];
    } else if (text.includes("click")) {
      step.actionType = "click";
    } else if (
      text.includes("type") ||
      text.includes("enter") ||
      text.includes("fill")
    ) {
      step.actionType = "type";
      const valueMatch = step.text.match(/"([^"]+)"/);
      if (valueMatch) step.actionValue = valueMatch[1];
    } else if (text.includes("select")) {
      step.actionType = "select";
      const valueMatch = step.text.match(/"([^"]+)"/);
      if (valueMatch) step.actionValue = valueMatch[1];
    } else if (text.includes("check") || text.includes("uncheck")) {
      step.actionType = "check";
    } else if (text.includes("scroll")) {
      step.actionType = "scroll";
    } else if (
      text.includes("should") ||
      text.includes("see") ||
      text.includes("verify")
    ) {
      step.actionType = "assert";
    }
  }

  /**
   * Parse data table
   */
  private parseDataTable(): string[][] {
    const rows: string[][] = [];

    while (this.currentLine < this.lines.length) {
      const line = this.currentLineData();
      if (!line?.trimmed.startsWith("|")) break;

      const cells = line.trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c !== "");

      rows.push(cells);
      this.advance();
    }

    return rows;
  }

  /**
   * Parse doc string
   */
  private parseDocString(): string {
    this.advance(); // Skip opening """

    const lines: string[] = [];

    while (this.currentLine < this.lines.length) {
      const line = this.currentLineData();
      if (!line) break;

      if (line.trimmed === '"""') {
        this.advance();
        break;
      }

      lines.push(line.text);
      this.advance();
    }

    return lines.join("\n");
  }

  /**
   * Parse examples section
   */
  private parseExamples(): GherkinExamples[] {
    const allExamples: GherkinExamples[] = [];

    while (this.currentLine < this.lines.length) {
      this.skipWhitespaceAndComments();

      const line = this.currentLineData();
      if (!line?.trimmed.startsWith("Examples:")) break;

      const name = line.trimmed.replace(/^Examples:\s*/, "") || undefined;
      this.advance();

      // Parse table
      const table = this.parseDataTable();
      if (table.length > 0) {
        allExamples.push({
          name,
          headers: table[0],
          rows: table.slice(1),
        });
      }
    }

    return allExamples;
  }

  /**
   * Create an empty feature (for error cases)
   */
  private createEmptyFeature(): GherkinFeature {
    return {
      name: "Unknown",
      scenarios: [],
    };
  }
}

/**
 * Parse Gherkin text
 */
export function parseGherkin(text: string): GherkinParseResult {
  const parser = new GherkinParser();
  return parser.parse(text);
}

/**
 * Expand scenario outline with examples
 *
 * Returns multiple scenarios with placeholders replaced
 */
export function expandScenarioOutline(
  scenario: GherkinScenario
): GherkinScenario[] {
  if (scenario.type !== "Scenario Outline" || !scenario.examples?.length) {
    return [scenario];
  }

  const expanded: GherkinScenario[] = [];

  for (const examples of scenario.examples) {
    for (let rowIndex = 0; rowIndex < examples.rows.length; rowIndex++) {
      const row = examples.rows[rowIndex];
      const values: Record<string, string> = {};

      // Map headers to values
      examples.headers.forEach((header, i) => {
        values[header] = row[i] || "";
      });

      // Create new scenario with placeholders replaced
      const newScenario: GherkinScenario = {
        type: "Scenario",
        name: `${scenario.name} (Example ${rowIndex + 1})`,
        description: scenario.description,
        tags: scenario.tags,
        steps: scenario.steps.map((step) => ({
          ...step,
          text: replacePlaceholders(step.text, values),
          actionValue: step.actionValue
            ? replacePlaceholders(step.actionValue, values)
            : undefined,
        })),
      };

      expanded.push(newScenario);
    }
  }

  return expanded;
}

/**
 * Replace <placeholder> with values
 */
function replacePlaceholders(
  text: string,
  values: Record<string, string>
): string {
  return text.replace(/<(\w+)>/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}
