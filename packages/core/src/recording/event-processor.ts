/**
 * Event Processor
 *
 * Processes CDP events into normalized recorded actions
 */

import type { CDPClient } from "../cdp/client.js";
import type { RecordedAction, ElementTarget } from "./types.js";
import { LocatorExtractor } from "./locator-extractor.js";

/**
 * Input consolidation for typing
 */
interface PendingInput {
  target: ElementTarget;
  value: string;
  startTimestamp: number;
  lastTimestamp: number;
}

/**
 * Consolidation timeout for typing (ms)
 */
const INPUT_CONSOLIDATION_TIMEOUT = 500;

/**
 * Event Processor
 *
 * Processes raw CDP events into normalized RecordedAction objects
 */
export class EventProcessor {
  private locatorExtractor: LocatorExtractor;
  private pendingInput: PendingInput | null = null;
  private lastMousePosition = { x: 0, y: 0 };

  constructor(cdp: CDPClient) {
    this.locatorExtractor = new LocatorExtractor(cdp);
  }

  /**
   * Process a mouse click event
   */
  async processClick(
    x: number,
    y: number,
    button: string,
    clickCount: number
  ): Promise<RecordedAction | null> {
    // First, flush any pending input (side effect - clears pending state)
    this.flushPendingInput();

    const target = await this.locatorExtractor.extractAtPoint(x, y);

    const action: RecordedAction = {
      type: "click",
      timestamp: Date.now(),
      target: target || undefined,
      metadata: {
        button,
        clickCount,
        x,
        y,
      },
    };

    // Check if this is a checkbox/radio
    if (target?.tagName === "input") {
      const inputType = target.attributes?.type?.toLowerCase();
      if (inputType === "checkbox" || inputType === "radio") {
        action.type = inputType === "checkbox" ? "check" : "click";
      }
    }

    // Check if this is a form submit button
    if (
      target?.tagName === "button" &&
      target.attributes?.type === "submit"
    ) {
      action.type = "submit";
    }

    return action;
  }

  /**
   * Process a keyboard input event
   */
  async processKeyInput(
    _key: string,
    _text: string,
    value: string,
    x?: number,
    y?: number
  ): Promise<RecordedAction | null> {
    // Get the target element at the input position
    let target: ElementTarget | null = null;

    if (x !== undefined && y !== undefined) {
      try {
        target = await this.locatorExtractor.extractAtPoint(x, y);
      } catch (error) {
        console.warn("[EventProcessor] Failed to extract element at input position:", error);
      }
    }

    if (!target) {
      console.warn("[EventProcessor] No target element found for input event at", x, y);
      return null;
    }
    
    console.log("[EventProcessor] Found input target:", target.locators.css);

    // Consolidate typing into single action
    const now = Date.now();

    if (this.pendingInput) {
      // Check if this is the same target and within timeout
      const sameTarget = this.pendingInput.target.locators.css === target.locators.css;
      const withinTimeout =
        now - this.pendingInput.lastTimestamp < INPUT_CONSOLIDATION_TIMEOUT;

      if (sameTarget && withinTimeout) {
        // Update the value with the latest complete value from the input field
        this.pendingInput.value = value || this.pendingInput.value;
        this.pendingInput.lastTimestamp = now;
        console.log(`[EventProcessor] Consolidating input: "${this.pendingInput.value}"`);
        return null; // Don't emit yet
      } else {
        // Different target or timeout - flush pending and return it
        console.log(`[EventProcessor] Target changed or timeout - flushing pending input`);
        const flushedAction = this.flushPendingInput();
        
        // Start new pending input for this keystroke
        this.pendingInput = {
          target,
          value: value,
          startTimestamp: now,
          lastTimestamp: now,
        };
        
        // Return the flushed action so it gets recorded
        return flushedAction;
      }
    }

    // Start new pending input
    console.log(`[EventProcessor] Starting new pending input for target: ${target.locators.css}`);
    this.pendingInput = {
      target,
      value: value,
      startTimestamp: now,
      lastTimestamp: now,
    };
    return null; // Don't emit yet
  }

  /**
   * Flush pending input and return the action
   */
  flushPendingInput(): RecordedAction | null {
    if (!this.pendingInput) {
      console.log("[EventProcessor] No pending input to flush");
      return null;
    }

    if (!this.pendingInput.value) {
      console.warn("[EventProcessor] Pending input has no value, discarding");
      this.pendingInput = null;
      return null;
    }

    console.log(`[EventProcessor] Flushing pending input: "${this.pendingInput.value}" for ${this.pendingInput.target.locators.css}`);

    const action: RecordedAction = {
      type: "type",
      timestamp: this.pendingInput.startTimestamp,
      target: this.pendingInput.target,
      value: this.pendingInput.value,
    };

    this.pendingInput = null;
    return action;
  }

  /**
   * Process a navigation event
   */
  processNavigation(url: string, frameId?: string): RecordedAction {
    return {
      type: "navigate",
      timestamp: Date.now(),
      url,
      metadata: {
        frameId,
      },
    };
  }

  /**
   * Process a scroll event
   */
  async processScroll(x: number, y: number): Promise<RecordedAction> {
    return {
      type: "scroll",
      timestamp: Date.now(),
      scrollPosition: { x, y },
    };
  }

  /**
   * Process a hover/mousemove event
   */
  async processHover(x: number, y: number): Promise<RecordedAction | null> {
    // Debounce - only record if moved significantly
    const dx = Math.abs(x - this.lastMousePosition.x);
    const dy = Math.abs(y - this.lastMousePosition.y);

    if (dx < 10 && dy < 10) {
      return null;
    }

    this.lastMousePosition = { x, y };

    const target = await this.locatorExtractor.extractAtPoint(x, y);

    return {
      type: "hover",
      timestamp: Date.now(),
      target: target || undefined,
      metadata: { x, y },
    };
  }

  /**
   * Process a focus event
   */
  async processFocus(nodeId: number): Promise<RecordedAction | null> {
    try {
      const target = await this.locatorExtractor.extractForNode(nodeId);
      if (!target) return null;

      return {
        type: "focus",
        timestamp: Date.now(),
        target,
      };
    } catch {
      return null;
    }
  }

  /**
   * Process a blur event
   */
  async processBlur(nodeId: number): Promise<RecordedAction | null> {
    // Flush any pending input first
    this.flushPendingInput();

    try {
      const target = await this.locatorExtractor.extractForNode(nodeId);
      if (!target) return null;

      return {
        type: "blur",
        timestamp: Date.now(),
        target,
      };
    } catch {
      return null;
    }
  }

  /**
   * Process a select change event
   */
  async processSelectChange(
    nodeId: number,
    value: string
  ): Promise<RecordedAction | null> {
    try {
      const target = await this.locatorExtractor.extractForNode(nodeId);
      if (!target) return null;

      return {
        type: "select",
        timestamp: Date.now(),
        target,
        value,
      };
    } catch {
      return null;
    }
  }

  /**
   * Process a form submit event
   */
  async processFormSubmit(nodeId?: number): Promise<RecordedAction> {
    let target: ElementTarget | undefined;

    if (nodeId) {
      try {
        target = (await this.locatorExtractor.extractForNode(nodeId)) || undefined;
      } catch {
        // Ignore
      }
    }

    return {
      type: "submit",
      timestamp: Date.now(),
      target,
    };
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.pendingInput = null;
    this.lastMousePosition = { x: 0, y: 0 };
  }
}
