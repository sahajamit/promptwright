/**
 * Recording Types
 *
 * Types for browser recording sessions
 */

/**
 * Recording mode - determines what events are captured
 */
export type RecordingMode = "standard" | "detailed";

/**
 * Recording mode configuration
 */
export interface RecordingModeConfig {
  mode: RecordingMode;
  captureClicks: boolean;
  captureTyping: boolean;
  captureNavigation: boolean;
  captureFormSubmissions: boolean;
  captureScrolls: "none" | "significant" | "all";
  captureHovers: boolean;
  captureFocusBlur: boolean;
  captureMouseMovement: boolean;
  captureNetworkRequests: boolean;
}

/**
 * Recording mode information for UI display
 */
export interface RecordingModeInfo {
  mode: RecordingMode;
  name: string;
  description: string;
  isDefault: boolean;
}

/**
 * Locator set - multiple strategies for finding an element
 */
export interface LocatorSet {
  /** CSS selector */
  css: string;
  /** XPath selector */
  xpath: string;
  /** data-testid attribute if present */
  testId?: string;
  /** Text content based locator */
  text?: string;
  /** ARIA role based locator */
  role?: string;
  /** Placeholder text if applicable */
  placeholder?: string;
  /** Label text for form elements */
  label?: string;
}

/**
 * Element target information
 */
export interface ElementTarget {
  /** Multiple locator strategies */
  locators: LocatorSet;
  /** HTML tag name */
  tagName: string;
  /** Element text content (truncated) */
  textContent?: string;
  /** Element attributes */
  attributes: Record<string, string>;
  /** Bounding box at time of interaction */
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Recorded action types
 */
export type RecordedActionType =
  | "click"
  | "type"
  | "navigate"
  | "scroll"
  | "hover"
  | "submit"
  | "focus"
  | "blur"
  | "select"
  | "check"
  | "uncheck";

/**
 * A single recorded user action
 */
export interface RecordedAction {
  /** Action type */
  type: RecordedActionType;
  /** Timestamp when action occurred */
  timestamp: number;
  /** Target element (if applicable) */
  target?: ElementTarget;
  /** Input value (for type/select actions) */
  value?: string;
  /** URL (for navigation actions) */
  url?: string;
  /** Scroll position (for scroll actions) */
  scrollPosition?: {
    x: number;
    y: number;
  };
  /** Whether this is a significant scroll (precedes interaction) */
  isSignificantScroll?: boolean;
  /** Screenshot at time of action (base64, optional) */
  screenshot?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Recorded session containing all actions
 */
export interface RecordedSession {
  /** Unique session ID */
  id: string;
  /** Session start timestamp */
  startTime: number;
  /** Session end timestamp */
  endTime?: number;
  /** Starting URL */
  startUrl: string;
  /** Recording mode used */
  mode: RecordingMode;
  /** All recorded actions */
  actions: RecordedAction[];
  /** Page title at start */
  pageTitle?: string;
  /** Any errors during recording */
  errors?: string[];
}

/**
 * Recording state
 */
export type RecordingState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "processing"
  | "review"
  | "replaying";

/**
 * Recording status information
 */
export interface RecordingStatus {
  /** Current state */
  state: RecordingState;
  /** Recording mode */
  mode?: RecordingMode;
  /** Number of actions recorded */
  actionCount?: number;
  /** Elapsed time in milliseconds */
  elapsedTime?: number;
  /** Processing stage */
  processingStage?: "analyzing" | "generating" | "refining" | "merging";
  /** Processing progress for chunked sessions */
  processingProgress?: {
    current: number;
    total: number;
  };
  /** Current Gherkin content */
  currentGherkin?: string;
  /** Error message if any */
  error?: string;
}

/**
 * Recording event types
 */
export type RecordingEvent =
  | { type: "state_changed"; status: RecordingStatus }
  | { type: "action_recorded"; action: RecordedAction; count: number }
  | { type: "session_recorded"; session: RecordedSession; tempFilePath: string }
  | { type: "gherkin_updated"; gherkin: string }
  | { type: "processing_progress"; current: number; total: number }
  | { type: "error"; error: string };

/**
 * Recording event handler
 */
export type RecordingEventHandler = (event: RecordingEvent) => void;

/**
 * Gherkin generation result
 */
export interface GherkinResult {
  /** Generated Gherkin text */
  gherkin: string;
  /** Brief summary of what was generated/changed */
  summary: string;
  /** Optional suggestions for improvement */
  suggestions?: string[];
}
