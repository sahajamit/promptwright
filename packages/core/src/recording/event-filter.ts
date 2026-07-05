/**
 * Event Filter
 *
 * Filters CDP events based on recording mode configuration
 */

import type { RecordingModeConfig, RecordedAction } from "./types.js";

/**
 * Internal event types from CDP
 */
export type CDPEventType =
  | "click"
  | "input"
  | "navigation"
  | "submit"
  | "scroll"
  | "hover"
  | "focus"
  | "blur"
  | "mousemove"
  | "network";

/**
 * Pending scroll for significant scroll detection
 */
interface PendingScroll {
  action: RecordedAction;
  timestamp: number;
}

/**
 * Time window for significant scroll detection (ms)
 * A scroll is significant if an interaction follows within this window
 */
const SIGNIFICANT_SCROLL_WINDOW = 500;

/**
 * Event Filter
 *
 * Filters events based on recording mode configuration.
 * Handles significant scroll detection by tracking pending scrolls.
 */
export class EventFilter {
  private config: RecordingModeConfig;
  private pendingScrolls: PendingScroll[] = [];
  private confirmedScrolls: RecordedAction[] = [];

  constructor(config: RecordingModeConfig) {
    this.config = config;
  }

  /**
   * Update the filter configuration
   */
  setConfig(config: RecordingModeConfig): void {
    this.config = config;
  }

  /**
   * Check if an event type should be captured
   */
  shouldCapture(eventType: CDPEventType): boolean {
    switch (eventType) {
      case "click":
        return this.config.captureClicks;

      case "input":
        return this.config.captureTyping;

      case "navigation":
        return this.config.captureNavigation;

      case "submit":
        return this.config.captureFormSubmissions;

      case "scroll":
        // For scrolls, we need more complex logic
        return this.config.captureScrolls !== "none";

      case "hover":
        return this.config.captureHovers;

      case "focus":
      case "blur":
        return this.config.captureFocusBlur;

      case "mousemove":
        return this.config.captureMouseMovement;

      case "network":
        return this.config.captureNetworkRequests;

      default:
        return false;
    }
  }

  /**
   * Process a scroll event
   *
   * For "significant" mode, scrolls are held pending until
   * an interaction confirms them as significant.
   */
  processScroll(scrollAction: RecordedAction): RecordedAction | null {
    if (this.config.captureScrolls === "none") {
      return null;
    }

    if (this.config.captureScrolls === "all") {
      return scrollAction;
    }

    // "significant" mode - hold scroll pending
    this.pendingScrolls.push({
      action: scrollAction,
      timestamp: scrollAction.timestamp,
    });

    return null; // Don't emit yet
  }

  /**
   * Process an interaction event (click, type, submit)
   *
   * This may confirm pending scrolls as significant.
   * Returns any scrolls that should be emitted before this action.
   */
  processInteraction(interactionAction: RecordedAction): RecordedAction[] {
    if (this.config.captureScrolls !== "significant") {
      return [];
    }

    const now = interactionAction.timestamp;
    const significantScrolls: RecordedAction[] = [];

    // Check pending scrolls
    this.pendingScrolls = this.pendingScrolls.filter((pending) => {
      const age = now - pending.timestamp;

      if (age <= SIGNIFICANT_SCROLL_WINDOW) {
        // This scroll is significant - it precedes an interaction
        pending.action.isSignificantScroll = true;
        significantScrolls.push(pending.action);
        return false; // Remove from pending
      }

      if (age > SIGNIFICANT_SCROLL_WINDOW * 2) {
        // Too old, discard
        return false;
      }

      // Keep in pending for now
      return true;
    });

    return significantScrolls;
  }

  /**
   * Clear old pending scrolls that will never be confirmed
   */
  cleanupPendingScrolls(): void {
    const now = Date.now();
    this.pendingScrolls = this.pendingScrolls.filter((pending) => {
      return now - pending.timestamp <= SIGNIFICANT_SCROLL_WINDOW * 2;
    });
  }

  /**
   * Get all confirmed significant scrolls
   */
  getConfirmedScrolls(): RecordedAction[] {
    return [...this.confirmedScrolls];
  }

  /**
   * Reset the filter state
   */
  reset(): void {
    this.pendingScrolls = [];
    this.confirmedScrolls = [];
  }
}
