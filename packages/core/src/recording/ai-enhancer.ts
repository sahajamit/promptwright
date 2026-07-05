/**
 * AI Enhancer
 *
 * Enhances recorded sessions using AI to generate better Gherkin
 */

import type {
  RecordedSession,
  RecordedAction,
  GherkinResult,
} from "./types.js";
import { GherkinGenerator } from "../gherkin/generator.js";

/**
 * Maximum actions per chunk for AI processing
 */
const MAX_ACTIONS_PER_CHUNK = 50;

/**
 * Chunked session for AI processing
 */
export interface ChunkedSession {
  chunks: RecordedAction[][];
  totalActions: number;
  chunkCount: number;
}

/**
 * AI callback type for Gherkin generation
 */
export type AIGenerateCallback = (
  prompt: string,
  session: RecordedSession
) => Promise<string>;

/**
 * AI callback type for Gherkin refinement
 */
export type AIRefineCallback = (
  prompt: string,
  currentGherkin: string,
  instruction: string
) => Promise<string>;

/**
 * Progress callback
 */
export type ProgressCallback = (current: number, total: number) => void;

/**
 * AI Enhancer
 *
 * Uses AI to enhance recorded actions and generate better Gherkin
 */
export class AIEnhancer {
  private generator: GherkinGenerator;

  constructor() {
    this.generator = new GherkinGenerator();
  }

  /**
   * Chunk recorded actions for AI processing
   */
  chunkSession(session: RecordedSession): ChunkedSession {
    const actions = session.actions;
    const chunks: RecordedAction[][] = [];

    if (actions.length <= MAX_ACTIONS_PER_CHUNK) {
      return {
        chunks: [actions],
        totalActions: actions.length,
        chunkCount: 1,
      };
    }

    // Try to split at natural boundaries (navigation events)
    let currentChunk: RecordedAction[] = [];

    for (const action of actions) {
      currentChunk.push(action);

      // Split at navigation or when chunk is full
      const isNaturalBoundary = action.type === "navigate";
      const isChunkFull = currentChunk.length >= MAX_ACTIONS_PER_CHUNK;

      if ((isNaturalBoundary || isChunkFull) && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }

    // Add remaining actions
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return {
      chunks,
      totalActions: actions.length,
      chunkCount: chunks.length,
    };
  }

  /**
   * Generate Gherkin from recorded session using AI
   */
  async generateGherkin(
    session: RecordedSession,
    aiCallback?: AIGenerateCallback,
    onProgress?: ProgressCallback
  ): Promise<GherkinResult> {
    // If no AI callback, use basic generation
    if (!aiCallback) {
      const gherkin = this.generator.generateFromSession(session);
      return {
        gherkin,
        summary: `Generated ${session.actions.length} steps from recorded actions`,
        suggestions: [
          "Consider using AI to enhance step descriptions",
          "Review locators for stability",
        ],
      };
    }

    const chunked = this.chunkSession(session);

    // If single chunk, process directly
    if (chunked.chunkCount === 1) {
      onProgress?.(1, 1);
      return this.processChunkWithAI(session, chunked.chunks[0], aiCallback);
    }

    // Multi-chunk processing
    const chunkResults: string[] = [];

    for (let i = 0; i < chunked.chunks.length; i++) {
      onProgress?.(i + 1, chunked.chunkCount);

      const chunkSession: RecordedSession = {
        ...session,
        actions: chunked.chunks[i],
      };

      const result = await this.processChunkWithAI(
        chunkSession,
        chunked.chunks[i],
        aiCallback
      );
      chunkResults.push(result.gherkin);
    }

    // Merge chunks
    const mergedGherkin = await this.mergeChunks(chunkResults, session, aiCallback);

    return {
      gherkin: mergedGherkin,
      summary: `Generated from ${chunked.chunkCount} chunks (${session.actions.length} total actions)`,
      suggestions: [
        "Review the merged scenario for consistency",
        "Consider splitting into multiple scenarios if the flow is complex",
      ],
    };
  }

  /**
   * Process a single chunk with AI
   */
  private async processChunkWithAI(
    session: RecordedSession,
    actions: RecordedAction[],
    aiCallback: AIGenerateCallback
  ): Promise<GherkinResult> {
    const prompt = this.buildGenerationPrompt(session, actions);

    try {
      const response = await aiCallback(prompt, session);
      const gherkin = this.extractGherkinFromResponse(response);

      return {
        gherkin,
        summary: `Generated ${actions.length} steps`,
      };
    } catch (error) {
      // Fallback to basic generation
      const fallbackGherkin = this.generator.generateFromSession({
        ...session,
        actions,
      });

      return {
        gherkin: fallbackGherkin,
        summary: "AI processing failed, using basic generation",
      };
    }
  }

  /**
   * Merge multiple chunks into a single Gherkin scenario
   */
  private async mergeChunks(
    chunkResults: string[],
    session: RecordedSession,
    aiCallback: AIGenerateCallback
  ): Promise<string> {
    const prompt = this.buildMergePrompt(chunkResults, session);

    try {
      const response = await aiCallback(prompt, session);
      return this.extractGherkinFromResponse(response);
    } catch {
      // Fallback: simple concatenation
      return chunkResults.join("\n\n");
    }
  }

  /**
   * Refine Gherkin based on user instruction
   */
  async refineGherkin(
    currentGherkin: string,
    instruction: string,
    session: RecordedSession,
    aiCallback?: AIRefineCallback
  ): Promise<GherkinResult> {
    if (!aiCallback) {
      return {
        gherkin: currentGherkin,
        summary: "No changes made (AI not available)",
      };
    }

    const prompt = this.buildRefinementPrompt(currentGherkin, instruction, session);

    try {
      const response = await aiCallback(prompt, currentGherkin, instruction);
      const gherkin = this.extractGherkinFromResponse(response);

      return {
        gherkin,
        summary: `Refined based on: "${instruction}"`,
      };
    } catch (error) {
      return {
        gherkin: currentGherkin,
        summary: `Refinement failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Build prompt for Gherkin generation
   */
  private buildGenerationPrompt(
    session: RecordedSession,
    actions: RecordedAction[]
  ): string {
    const actionsJson = JSON.stringify(
      actions.map((a) => ({
        type: a.type,
        target: a.target
          ? {
              tagName: a.target.tagName,
              locators: a.target.locators,
              textContent: a.target.textContent?.slice(0, 50),
            }
          : undefined,
        value: a.value,
        url: a.url,
      })),
      null,
      2
    );

    return `Convert the following recorded browser actions into a well-structured Gherkin feature file.

## Recording Info
- Start URL: ${session.startUrl}
- Recording Mode: ${session.mode}
- Total Actions: ${actions.length}

## Recorded Actions
\`\`\`json
${actionsJson}
\`\`\`

## Requirements
1. Create a Feature with a descriptive name based on the actions
2. Write human-readable step descriptions (describe WHAT, not HOW)
3. Use Scenario Outline with Examples table if there's input data
4. Select the best locator for each element:
   - Prefer: data-testid > ARIA role > text > placeholder > CSS
5. Include locator comments for complex selectors
6. Group related actions into logical steps

## Output Format
Output only the Gherkin feature file content, no explanation.`;
  }

  /**
   * Build prompt for merging chunks
   */
  private buildMergePrompt(chunks: string[], session: RecordedSession): string {
    return `Merge the following Gherkin chunks into a single cohesive feature file.

## Recording Info
- Start URL: ${session.startUrl}
- Total Chunks: ${chunks.length}

## Chunks to Merge
${chunks.map((c, i) => `### Chunk ${i + 1}\n\`\`\`gherkin\n${c}\n\`\`\``).join("\n\n")}

## Requirements
1. Combine all chunks into a single Feature
2. Remove duplicate steps or navigation
3. Ensure logical flow from Given to When to Then
4. Keep all Examples data combined in one table
5. Use consistent step descriptions

## Output Format
Output only the merged Gherkin feature file content, no explanation.`;
  }

  /**
   * Build prompt for refinement
   */
  private buildRefinementPrompt(
    currentGherkin: string,
    instruction: string,
    session: RecordedSession
  ): string {
    return `Refine the following Gherkin feature file based on the user's instruction.

## Current Gherkin
\`\`\`gherkin
${currentGherkin}
\`\`\`

## User Instruction
${instruction}

## Available Locators from Recording
${this.getLocatorSummary(session)}

## Requirements
1. Make the requested changes while preserving overall structure
2. Keep all other content intact
3. Ensure the result is valid Gherkin syntax
4. If adding new steps, use appropriate locators from the recording

## Output Format
Output only the updated Gherkin feature file content, no explanation.`;
  }

  /**
   * Get summary of available locators
   */
  private getLocatorSummary(session: RecordedSession): string {
    const locators: string[] = [];

    for (const action of session.actions) {
      if (action.target?.locators) {
        const loc = action.target.locators;
        if (loc.testId) locators.push(`[data-testid="${loc.testId}"]`);
        if (loc.label) locators.push(`label: ${loc.label}`);
        if (loc.placeholder) locators.push(`placeholder: ${loc.placeholder}`);
      }
    }

    return [...new Set(locators)].slice(0, 20).join("\n");
  }

  /**
   * Extract Gherkin content from AI response
   */
  private extractGherkinFromResponse(response: string): string {
    // Try to extract from code block
    const codeBlockMatch = response.match(/```gherkin?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find Feature keyword
    const featureMatch = response.match(/(Feature:[\s\S]*)/);
    if (featureMatch) {
      return featureMatch[1].trim();
    }

    // Return as-is
    return response.trim();
  }
}

/**
 * Create an AI enhancer instance
 */
export function createAIEnhancer(): AIEnhancer {
  return new AIEnhancer();
}
