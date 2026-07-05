/**
 * Recording Mode Configuration
 *
 * Standard and Detailed mode presets
 */

import type { RecordingModeConfig, RecordingModeInfo, RecordingMode } from "./types.js";

/**
 * Standard Mode Configuration
 *
 * Captures essential interactions only:
 * - Clicks, typing, navigation, form submissions
 * - Only significant scrolls (that precede interactions)
 * - No hovers, focus/blur, mouse movement, or network
 */
export const STANDARD_MODE_CONFIG: RecordingModeConfig = {
  mode: "standard",
  captureClicks: true,
  captureTyping: true,
  captureNavigation: true,
  captureFormSubmissions: true,
  captureScrolls: "significant",
  captureHovers: false,
  captureFocusBlur: false,
  captureMouseMovement: false,
  captureNetworkRequests: false,
};

/**
 * Detailed Mode Configuration
 *
 * Captures everything:
 * - All standard events
 * - All scrolls
 * - Hovers, focus/blur events
 * - Mouse movement
 * - Network requests
 */
export const DETAILED_MODE_CONFIG: RecordingModeConfig = {
  mode: "detailed",
  captureClicks: true,
  captureTyping: true,
  captureNavigation: true,
  captureFormSubmissions: true,
  captureScrolls: "all",
  captureHovers: true,
  captureFocusBlur: true,
  captureMouseMovement: true,
  captureNetworkRequests: true,
};

/**
 * Get configuration for a recording mode
 */
export function getModeConfig(mode: RecordingMode): RecordingModeConfig {
  switch (mode) {
    case "standard":
      return STANDARD_MODE_CONFIG;
    case "detailed":
      return DETAILED_MODE_CONFIG;
    default:
      return STANDARD_MODE_CONFIG;
  }
}

/**
 * Available recording modes with display information
 */
export const RECORDING_MODES: RecordingModeInfo[] = [
  {
    mode: "standard",
    name: "Standard",
    description:
      "Captures essential interactions only (clicks, typing, navigation, form submissions). Best for most test scenarios.",
    isDefault: true,
  },
  {
    mode: "detailed",
    name: "Detailed",
    description:
      "Captures everything including hovers, scrolls, focus events, and mouse movement. Use for complex scenarios or debugging.",
    isDefault: false,
  },
];

/**
 * Get the default recording mode
 */
export function getDefaultMode(): RecordingMode {
  return "standard";
}

/**
 * Get display information for a mode
 */
export function getModeInfo(mode: RecordingMode): RecordingModeInfo {
  return RECORDING_MODES.find((m) => m.mode === mode) || RECORDING_MODES[0];
}

/**
 * Get all available modes
 */
export function getAvailableModes(): RecordingModeInfo[] {
  return RECORDING_MODES;
}
