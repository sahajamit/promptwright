import type { JarvisEvent } from "@promptwright/core";
import { contextBridge, ipcRenderer } from "electron";

/**
 * Exposed API for the renderer process
 */
const jarvisAPI = {
  /**
   * Send a message to JARVIS
   */
  sendMessage: (prompt: string): Promise<string> => {
    return ipcRenderer.invoke("jarvis:send-message", prompt);
  },

  /**
   * Abort current message processing
   */
  abort: (): Promise<void> => {
    return ipcRenderer.invoke("jarvis:abort");
  },

  /**
   * Get current client state
   */
  getState: (): Promise<string> => {
    return ipcRenderer.invoke("jarvis:get-state");
  },

  /**
   * Set working directory
   */
  setWorkDir: (path: string): Promise<string> => {
    return ipcRenderer.invoke("jarvis:set-workdir", path);
  },

  /**
   * Open folder picker dialog
   */
  pickFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke("jarvis:pick-folder");
  },

  /**
   * Get current working directory
   */
  getWorkDir: (): Promise<string> => {
    return ipcRenderer.invoke("jarvis:get-workdir");
  },

  /**
   * Get current system prompt (for debugging)
   */
  getSystemPrompt: (): Promise<string | null> => {
    return ipcRenderer.invoke("jarvis:get-system-prompt");
  },

  /**
   * Initialize JARVIS with optional copilot session ID.
   * Returns immediately (fire-and-forget). Listen to onSessionReady/onSessionError for result.
   */
  initialize: (workDir: string, personaId?: string, copilotSessionId?: string, uiSessionId?: string): Promise<null> => {
    return ipcRenderer.invoke("jarvis:initialize", workDir, personaId, copilotSessionId, uiSessionId);
  },

  /**
   * Get Electron app path (e.g., 'userData', 'home', 'temp')
   */
  getPath: (name: string): Promise<string | null> => {
    return ipcRenderer.invoke("jarvis:get-path", name);
  },

  /**
   * Dialog APIs for showing native dialogs with Jarvis branding
   */
  dialog: {
    /**
     * Show a message dialog with the Jarvis icon
     */
    showMessage: (options: {
      type?: "none" | "info" | "error" | "question" | "warning";
      title?: string;
      message: string;
      detail?: string;
      buttons?: string[];
    }): Promise<{ response: number }> => {
      return ipcRenderer.invoke("dialog:show-message", options);
    },
  },

  /**
   * Configuration APIs for managing app settings
   */
  prerequisites: {
    /**
     * Get startup prerequisite status.
     */
    getStatus: (): Promise<any> => {
      return ipcRenderer.invoke("prereq:get-status");
    },
    /**
     * Force rerun prerequisite checks.
     */
    runCheck: (): Promise<any> => {
      return ipcRenderer.invoke("prereq:run-check");
    },
    /**
     * Pick Copilot CLI executable file via file picker dialog.
     * @returns File path or null if cancelled
     */
    pickCopilotFile: (): Promise<string | null> => {
      return ipcRenderer.invoke("prereq:pick-copilot-file");
    },
    /**
     * Pick Copilot CLI installation folder via folder picker dialog.
     * @returns Folder path or null if cancelled
     */
    pickCopilotFolder: (): Promise<string | null> => {
      return ipcRenderer.invoke("prereq:pick-copilot-folder");
    },
    /**
     * Validate a Copilot CLI path by attempting to run it.
     * @param pickedPath - Path to validate (file or folder)
     * @returns { valid: boolean, version?: string, error?: string }
     */
    validateCopilotPath: (pickedPath: string): Promise<{ valid: boolean; version?: string; error?: string }> => {
      return ipcRenderer.invoke("prereq:validate-copilot-path", pickedPath);
    },
    /**
     * Save Copilot CLI path override to config and re-run prereqs.
     * @param copilotPath - Path to Copilot CLI executable or folder
     * @returns Updated prerequisite status
     */
    saveCopilotPath: (copilotPath: string): Promise<any> => {
      return ipcRenderer.invoke("prereq:save-copilot-path", copilotPath);
    },
  },

  /**
   * Configuration APIs for managing app settings
   */
  config: {
    /**
     * Get current configuration
     */
    get: (): Promise<any> => {
      return ipcRenderer.invoke("config:get");
    },

    /**
     * Update configuration (partial update, merged with existing)
     */
    set: (patch: any): Promise<any> => {
      return ipcRenderer.invoke("config:set", patch);
    },

    /**
     * Update configuration and apply model changes without restart
     */
    setAndApply: (patch: any): Promise<any> => {
      return ipcRenderer.invoke("config:set-and-apply", patch);
    },

    /**
     * Get config file path (for debugging)
     */
    getPath: (): Promise<string> => {
      return ipcRenderer.invoke("config:get-path");
    },
  },

  /**
   * Model APIs for fetching available models from Copilot SDK
   */
  models: {
    /**
     * List available models from Copilot SDK
     */
    list: (): Promise<Array<{ id: string; name: string; isDefault: boolean }>> => {
      return ipcRenderer.invoke("models:list");
    },

    /**
     * Get the currently active model
     */
    getActive: (): Promise<string | null> => {
      return ipcRenderer.invoke("models:get-active");
    },
  },

  /**
   * Copilot session management APIs
   */
  copilot: {
    /**
     * Get current Copilot session ID
     */
    getSessionId: (): Promise<string | null> => {
      return ipcRenderer.invoke("copilot:get-session-id");
    },

    /**
     * Delete a Copilot session from CLI
     */
    deleteSession: (sessionId: string): Promise<void> => {
      return ipcRenderer.invoke("copilot:delete-session", sessionId);
    },
  },

  /**
   * Subscribe to JARVIS events
   */
  onEvent: (callback: (event: JarvisEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: JarvisEvent) => {
      callback(event);
    };
    ipcRenderer.on("jarvis-event", handler);
    return () => {
      ipcRenderer.removeListener("jarvis-event", handler);
    };
  },

  /**
   * Subscribe to usage update events
   */
  onUsageUpdate: (callback: (data: any) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: any) => {
      callback(data);
    };
    ipcRenderer.on("session:usage-update", handler);
    return () => {
      ipcRenderer.removeListener("session:usage-update", handler);
    };
  },

  /**
   * Subscribe to Copilot session ready events (async init complete)
   */
  onSessionReady: (callback: (data: { uiSessionId: string; copilotSessionId: string | null }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { uiSessionId: string; copilotSessionId: string | null }) => {
      callback(data);
    };
    ipcRenderer.on("jarvis:session-ready", handler);
    return () => {
      ipcRenderer.removeListener("jarvis:session-ready", handler);
    };
  },

  /**
   * Subscribe to Copilot session error events (async init failed)
   */
  onSessionError: (callback: (data: { uiSessionId: string; error: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { uiSessionId: string; error: string }) => {
      callback(data);
    };
    ipcRenderer.on("jarvis:session-error", handler);
    return () => {
      ipcRenderer.removeListener("jarvis:session-error", handler);
    };
  },

  /**
   * Get current Copilot readiness state
   */
  getReadiness: (): Promise<"ready" | "initializing" | "idle"> => {
    return ipcRenderer.invoke("jarvis:get-readiness");
  },

  /**
   * Session storage APIs
   */
  session: {
    save: (sessionId: string, data: string): Promise<string> => {
      return ipcRenderer.invoke("session:save", sessionId, data);
    },
    load: (sessionId: string): Promise<string | null> => {
      return ipcRenderer.invoke("session:load", sessionId);
    },
    list: (): Promise<any[]> => {
      return ipcRenderer.invoke("session:list");
    },
    delete: (sessionId: string): Promise<boolean> => {
      return ipcRenderer.invoke("session:delete", sessionId);
    },
    /**
     * Export session as HTML file
     * Returns the saved file path or null if cancelled
     */
    exportHtml: (sessionId: string, htmlContent: string): Promise<string | null> => {
      return ipcRenderer.invoke("session:export-html", sessionId, htmlContent);
    },
  },

  /**
   * Persona management APIs (legacy, kept for backward compatibility)
   */
  persona: {
    list: (): Promise<any[]> => {
      return ipcRenderer.invoke("persona:list");
    },
    getActive: (): Promise<any | null> => {
      return ipcRenderer.invoke("persona:get-active");
    },
    select: (personaId: string): Promise<any> => {
      return ipcRenderer.invoke("persona:select", personaId);
    },
    onEvent: (callback: (event: any) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: any) => {
        callback(event);
      };
      ipcRenderer.on("persona-event", handler);
      return () => {
        ipcRenderer.removeListener("persona-event", handler);
      };
    },
  },

  /**
   * Skill management APIs
   */
  skill: {
    /** List all loaded skills (metadata only) */
    list: (): Promise<Array<{ name: string; description: string; tools?: string[] }>> => {
      return ipcRenderer.invoke("skill:list");
    },
    /** Get full skill detail including prompt */
    get: (name: string): Promise<any | null> => {
      return ipcRenderer.invoke("skill:get", name);
    },
  },

  /**
   * Agent management APIs (new orchestration system)
   */
  agent: {
    /** List all registered agents (metadata only) */
    list: (): Promise<any[]> => {
      return ipcRenderer.invoke("agent:list");
    },
    /** Get full agent detail including prompt */
    get: (name: string): Promise<any | null> => {
      return ipcRenderer.invoke("agent:get", name);
    },
    /** Get the currently active sub-agent name */
    getActive: (): Promise<string | null> => {
      return ipcRenderer.invoke("agent:get-active");
    },
    /** Get orchestrator state */
    getOrchestratorState: (): Promise<{ model?: string; autoRoute?: boolean } | null> => {
      return ipcRenderer.invoke("orchestrator:get-state");
    },
  },

  /**
   * Playwright MCP APIs
   */
  playwright: {
    checkInstalled: (): Promise<boolean> => {
      return ipcRenderer.invoke("playwright:check-installed");
    },
    install: (): Promise<boolean> => {
      return ipcRenderer.invoke("playwright:install");
    },
    checkBrowser: (): Promise<boolean> => {
      return ipcRenderer.invoke("playwright:check-browser");
    },
    getStatus: (): Promise<string> => {
      return ipcRenderer.invoke("playwright:get-status");
    },
    onEvent: (callback: (event: any) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: any) => {
        callback(event);
      };
      ipcRenderer.on("playwright-mcp-event", handler);
      return () => {
        ipcRenderer.removeListener("playwright-mcp-event", handler);
      };
    },
  },

  /**
   * Recording APIs for Workflow Observer persona
   */
  recording: {
    /**
     * Get available recording modes
     */
    getModes: (): Promise<any[]> => {
      return ipcRenderer.invoke("recording:get-modes");
    },

    /**
     * Get default recording mode
     */
    getDefaultMode: (): Promise<string> => {
      return ipcRenderer.invoke("recording:get-default-mode");
    },

    /**
     * Start recording with specified mode
     */
    start: (mode: string, startUrl?: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke("recording:start", mode, startUrl);
    },

    /**
     * Stop recording and return the session
     */
    stop: (): Promise<any> => {
      return ipcRenderer.invoke("recording:stop");
    },

    /**
     * Generate Gherkin from recorded session
     */
    generateGherkin: (customInstructions?: string): Promise<any> => {
      return ipcRenderer.invoke("recording:generate-gherkin", customInstructions);
    },

    /**
     * Refine Gherkin based on user instruction
     */
    refineGherkin: (instruction: string): Promise<any> => {
      return ipcRenderer.invoke("recording:refine-gherkin", instruction);
    },

    /**
     * Get current recording status
     */
    getStatus: (): Promise<any> => {
      return ipcRenderer.invoke("recording:get-status");
    },

    /**
     * Get current Gherkin content
     */
    getGherkin: (): Promise<string | null> => {
      return ipcRenderer.invoke("recording:get-gherkin");
    },

    /**
     * Discard current recording
     */
    discard: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke("recording:discard");
    },

    /**
     * Export Gherkin to file
     */
    export: (gherkin: string, filePath: string): Promise<{ success: boolean; path: string }> => {
      return ipcRenderer.invoke("recording:export", gherkin, filePath);
    },

    /**
     * Pick export file path
     */
    pickExportPath: (): Promise<string | null> => {
      return ipcRenderer.invoke("recording:pick-export-path");
    },

    /**
     * Load feature file for replay
     */
    loadFeature: (): Promise<{ path: string; content: string } | null> => {
      return ipcRenderer.invoke("recording:load-feature");
    },

    /**
     * Clean up temporary recording file
     */
    cleanupTemp: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke("recording:cleanup-temp");
    },

    /**
     * Subscribe to recording events
     */
    onEvent: (callback: (event: any) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: any) => {
        callback(event);
      };
      ipcRenderer.on("recording-event", handler);
      return () => {
        ipcRenderer.removeListener("recording-event", handler);
      };
    },
  },

  /**
   * Execution recording APIs for AI QA Assistant
   */
  execution: {
    /**
     * Start execution recording (Chrome + screencast)
     */
    startRecording: (): Promise<{ success: boolean; port: number }> => {
      return ipcRenderer.invoke("execution:start-recording");
    },

    /**
     * Stop execution recording and get video path
     */
    stopRecording: (): Promise<{ success: boolean; path: string }> => {
      return ipcRenderer.invoke("execution:stop-recording");
    },

    /**
     * Get current recording path
     */
    getRecordingPath: (): Promise<string | null> => {
      return ipcRenderer.invoke("execution:get-recording-path");
    },

    /**
     * Get recording data for iframe (URL or HTML content depending on environment)
     */
    getRecordingData: (filePath: string): Promise<{ type: "url" | "html"; data: string }> => {
      return ipcRenderer.invoke("execution:get-recording-data", filePath);
    },

    /**
     * Cancel recording without saving
     */
    cancelRecording: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke("execution:cancel-recording");
    },

    /**
     * Close Chrome browser on debug port
     * Used when starting a new test to ensure fresh browser state
     */
    closeBrowser: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke("execution:close-browser");
    },

    /**
     * Subscribe to real-time screencast frames during execution
     */
    onScreencastFrame: (callback: (frame: { data: string; timestamp: number }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, frame: { data: string; timestamp: number }) => {
        callback(frame);
      };
      ipcRenderer.on("execution:screencast-frame", handler);
      return () => {
        ipcRenderer.removeListener("execution:screencast-frame", handler);
      };
    },

    /**
     * Generate Gherkin from execution logs
     */
    generateGherkin: (testInput: string, executionLogs: string): Promise<{ gherkin: string; summary: string }> => {
      return ipcRenderer.invoke("execution:generate-gherkin", testInput, executionLogs);
    },

    /**
     * Refine Gherkin based on user instruction
     */
    refineGherkin: (currentGherkin: string, instruction: string, testInput: string): Promise<{ gherkin: string; summary: string }> => {
      return ipcRenderer.invoke("execution:refine-gherkin", currentGherkin, instruction, testInput);
    },
  },
};

// Expose API to renderer
contextBridge.exposeInMainWorld("jarvis", jarvisAPI);

// TypeScript declaration for window.jarvis
declare global {
  interface Window {
    jarvis: typeof jarvisAPI;
  }
}
