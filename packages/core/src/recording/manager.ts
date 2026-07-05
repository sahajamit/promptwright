/**
 * Recording Manager
 *
 * Coordinates the full recording lifecycle including AI processing
 */

import { EventEmitter } from "events";
import type {
  RecordedAction,
  RecordedSession,
  RecordingMode,
  RecordingState,
  RecordingStatus,
  RecordingEvent,
  GherkinResult,
  LocatorSet,
} from "./types.js";
import { Recorder } from "./recorder.js";
import { getAvailableModes, getDefaultMode } from "./mode-config.js";
import { RecordingTempStorage } from "./temp-storage.js";

/**
 * Recording Manager
 *
 * Coordinates recording, AI processing, and Gherkin generation
 */
export class RecordingManager extends EventEmitter {
  private recorder: Recorder;
  private state: RecordingState = "idle";
  private currentSession: RecordedSession | null = null;
  private currentGherkin: string | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private tempStorage: RecordingTempStorage;
  private currentTempFilePath: string | null = null;

  constructor() {
    super();
    this.recorder = new Recorder();
    this.tempStorage = new RecordingTempStorage();

    // Forward recorder events
    this.recorder.onEvent((event) => {
      this.handleRecorderEvent(event);
    });
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    return this.state;
  }

  /**
   * Get current status
   */
  getStatus(): RecordingStatus {
    return {
      state: this.state,
      mode: this.currentSession?.mode,
      actionCount: this.currentSession?.actions.length || 0,
      elapsedTime: this.recorder.getElapsedTime(),
      currentGherkin: this.currentGherkin || undefined,
    };
  }

  /**
   * Get available recording modes
   */
  getModes() {
    return getAvailableModes();
  }

  /**
   * Get the default recording mode
   */
  getDefaultMode(): RecordingMode {
    return getDefaultMode();
  }

  /**
   * Get the current session
   */
  getSession(): RecordedSession | null {
    return this.currentSession;
  }

  /**
   * Get current Gherkin content
   */
  getCurrentGherkin(): string | null {
    return this.currentGherkin;
  }

  /**
   * Start recording
   */
  async startRecording(
    mode: RecordingMode = "standard",
    startUrl?: string
  ): Promise<void> {
    if (this.state !== "idle") {
      throw new Error(`Cannot start recording in state: ${this.state}`);
    }

    this.setState("starting");

    try {
      await this.recorder.start(mode, startUrl);
      this.setState("recording");

      // Start elapsed time updates
      this.startElapsedTimer();
    } catch (error) {
      this.setState("idle");
      throw error;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<RecordedSession> {
    console.log("[RecordingManager] stopRecording called - current state:", this.state);
    if (this.state !== "recording") {
      throw new Error(`Cannot stop recording in state: ${this.state}`);
    }

    console.log("[RecordingManager] Setting state to 'stopping'");
    this.setState("stopping");
    this.stopElapsedTimer();

    try {
      console.log("[RecordingManager] Calling recorder.stop()...");
      const session = await this.recorder.stop();
      console.log("[RecordingManager] Recorder stopped, session:", session?.id);
      this.currentSession = session;
      
      // Save to temp file
      this.currentTempFilePath = await this.tempStorage.saveSession(session);
      console.log("[RecordingManager] Session saved to temp file:", this.currentTempFilePath);
      
      // Emit session_recorded with temp file path
      this.emitEvent({
        type: "session_recorded",
        session,
        tempFilePath: this.currentTempFilePath,
      });
      console.log("[RecordingManager] Emitted session_recorded event");
      
      // Set to idle after stopping - processing will start when user clicks Generate
      console.log("[RecordingManager] Setting state to 'idle' - dialog should show now");
      this.setState("idle");
      console.log("[RecordingManager] State set to 'idle', returning session");
      return session;
    } catch (error) {
      console.error("[RecordingManager] Error during stop:", error);
      this.setState("idle");
      throw error;
    }
  }

  /**
   * Generate Gherkin from the current session
   *
   * This would typically call the AI service
   */
  async generateGherkin(
    session?: RecordedSession,
    aiCallback?: (session: RecordedSession) => Promise<GherkinResult>
  ): Promise<GherkinResult> {
    const targetSession = session || this.currentSession;

    if (!targetSession) {
      throw new Error("No recording session available");
    }

    this.setState("processing");
    this.emitEvent({
      type: "state_changed",
      status: {
        ...this.getStatus(),
        processingStage: "generating",
      },
    });

    try {
      let result: GherkinResult;

      if (aiCallback) {
        result = await aiCallback(targetSession);
      } else {
        // Default: generate basic Gherkin without AI
        result = this.generateBasicGherkin(targetSession);
      }

      this.currentGherkin = result.gherkin;
      this.setState("review");

      this.emitEvent({
        type: "gherkin_updated",
        gherkin: result.gherkin,
      });

      return result;
    } catch (error) {
      this.emitEvent({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Refine Gherkin based on user instruction
   */
  async refineGherkin(
    instruction: string,
    aiCallback?: (
      currentGherkin: string,
      instruction: string,
      session: RecordedSession
    ) => Promise<GherkinResult>
  ): Promise<GherkinResult> {
    if (!this.currentGherkin) {
      throw new Error("No Gherkin content to refine");
    }

    this.emitEvent({
      type: "state_changed",
      status: {
        ...this.getStatus(),
        processingStage: "refining",
      },
    });

    try {
      let result: GherkinResult;

      if (aiCallback && this.currentSession) {
        result = await aiCallback(
          this.currentGherkin,
          instruction,
          this.currentSession
        );
      } else {
        // Without AI, just return current
        result = {
          gherkin: this.currentGherkin,
          summary: "No changes made (AI not available)",
        };
      }

      this.currentGherkin = result.gherkin;

      this.emitEvent({
        type: "gherkin_updated",
        gherkin: result.gherkin,
      });

      return result;
    } catch (error) {
      this.emitEvent({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Export Gherkin to a file
   *
   * Note: Actual file writing should be done by the caller (Electron main process)
   */
  getExportContent(): string {
    if (!this.currentGherkin) {
      throw new Error("No Gherkin content to export");
    }
    return this.currentGherkin;
  }

  /**
   * Discard current recording and reset
   */
  discard(): void {
    this.stopElapsedTimer();
    this.currentSession = null;
    this.currentGherkin = null;
    this.setState("idle");
  }

  /**
   * Clean up temp file when user exports
   */
  async cleanupTempFile(): Promise<void> {
    if (this.currentTempFilePath) {
      try {
        await this.tempStorage.deleteFile(this.currentTempFilePath);
        this.currentTempFilePath = null;
      } catch (error) {
        console.error("[RecordingManager] Failed to cleanup temp file:", error);
        // Don't throw - cleanup failure shouldn't break the flow
      }
    }
  }

  /**
   * Generate basic Gherkin without AI
   * (Fallback for when AI is not available)
   */
  private generateBasicGherkin(session: RecordedSession): GherkinResult {
    const lines: string[] = [];

    // Feature header
    lines.push(`Feature: Recorded Test Scenario`);
    lines.push(`  Recorded on ${new Date(session.startTime).toISOString()}`);
    lines.push(`  Starting URL: ${session.startUrl}`);
    lines.push(``);

    // Scenario
    lines.push(`  Scenario: User interaction flow`);

    // Given - starting state
    lines.push(`    Given I am on the page "${session.startUrl}"`);

    // Process actions
    for (const action of session.actions) {
      const step = this.actionToGherkinStep(action);
      if (step) {
        lines.push(`    ${step}`);
      }
    }

    return {
      gherkin: lines.join("\n"),
      summary: `Generated ${session.actions.length} steps from recorded actions`,
      suggestions: [
        "Use AI to enhance step descriptions",
        "Consider adding assertions (Then steps)",
        "Review locator strategies for stability",
      ],
    };
  }

  /**
   * Convert a recorded action to a Gherkin step
   */
  private actionToGherkinStep(action: RecordedAction): string | null {
    switch (action.type) {
      case "click":
        if (action.target) {
          const locator = this.getBestLocator(action.target.locators);
          return `When I click on "${locator}"`;
        }
        return `When I click at position (${action.metadata?.x}, ${action.metadata?.y})`;

      case "type":
        if (action.target && action.value) {
          const locator = this.getBestLocator(action.target.locators);
          return `When I type "${action.value}" into "${locator}"`;
        }
        return null;

      case "navigate":
        return `When I navigate to "${action.url}"`;

      case "scroll":
        if (action.isSignificantScroll) {
          return `When I scroll to position (${action.scrollPosition?.x}, ${action.scrollPosition?.y})`;
        }
        return null; // Skip non-significant scrolls

      case "select":
        if (action.target && action.value) {
          const locator = this.getBestLocator(action.target.locators);
          return `When I select "${action.value}" from "${locator}"`;
        }
        return null;

      case "submit":
        return `When I submit the form`;

      case "check":
        if (action.target) {
          const locator = this.getBestLocator(action.target.locators);
          return `When I check "${locator}"`;
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Get the best locator from a locator set
   */
  private getBestLocator(locators: LocatorSet): string {
    // Priority: testId > role > text > placeholder > label > css
    if (locators.testId) return locators.testId;
    if (locators.role && locators.text) return `${locators.role}:${locators.text}`;
    if (locators.text) return locators.text;
    if (locators.placeholder) return `[placeholder="${locators.placeholder}"]`;
    if (locators.label) return locators.label;
    if (locators.css) return locators.css;
    return "element";
  }

  /**
   * Set the current state and emit event
   */
  private setState(state: RecordingState): void {
    const prevState = this.state;
    this.state = state;
    console.log(`[RecordingManager] setState: ${prevState} -> ${state}`);
    const status = this.getStatus();
    console.log("[RecordingManager] Emitting state_changed event with status:", JSON.stringify(status));
    this.emitEvent({
      type: "state_changed",
      status,
    });
  }

  /**
   * Start elapsed time timer
   */
  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      if (this.state === "recording") {
        this.emitEvent({
          type: "state_changed",
          status: this.getStatus(),
        });
      }
    }, 1000);
  }

  /**
   * Stop elapsed time timer
   */
  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  /**
   * Handle events from recorder
   */
  private handleRecorderEvent(event: RecordingEvent): void {
    // Forward relevant events
    if (event.type === "action_recorded") {
      this.emitEvent(event);
    }
  }

  /**
   * Emit a recording event
   */
  private emitEvent(event: RecordingEvent): void {
    this.emit("recording-event", event);
  }

  /**
   * Subscribe to recording events
   */
  onEvent(handler: (event: RecordingEvent) => void): () => void {
    this.on("recording-event", handler);
    return () => this.off("recording-event", handler);
  }
}
