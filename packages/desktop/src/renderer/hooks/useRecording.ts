import { useState, useEffect, useCallback } from "react";

/**
 * Recording event payload from IPC
 */
type RecordingEventPayload =
  | { type: "state_changed"; status: RecordingStatus }
  | { type: "action_recorded"; action: unknown; count: number }
  | { type: "gherkin_updated"; gherkin: string }
  | { type: "processing_progress"; current: number; total: number }
  | { type: "error"; error: string };

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
 * Recording status
 */
export interface RecordingStatus {
  state: RecordingState;
  mode?: string;
  actionCount?: number;
  elapsedTime?: number;
  processingStage?: "analyzing" | "generating" | "refining" | "merging";
  processingProgress?: { current: number; total: number };
  currentGherkin?: string;
  error?: string;
}

/**
 * Recording mode info
 */
export interface RecordingModeInfo {
  mode: string;
  name: string;
  description: string;
  isDefault: boolean;
}

/**
 * Gherkin result
 */
export interface GherkinResult {
  gherkin: string;
  summary: string;
  suggestions?: string[];
}

/**
 * Recorded action type for display
 */
export interface RecordedActionDisplay {
  type: string;
  timestamp: number;
  target?: {
    tagName: string;
    textContent?: string;
    locators: {
      css?: string;
      xpath?: string;
      testId?: string;
      text?: string;
    };
  };
  value?: string;
  url?: string;
}

/**
 * Recorded session
 */
export interface RecordedSession {
  id: string;
  startTime: number;
  endTime?: number;
  startUrl: string;
  mode: string;
  actions: RecordedActionDisplay[];
}

/**
 * Hook for managing recording state
 */
export function useRecording() {
  const [status, setStatus] = useState<RecordingStatus>({ state: "idle" });
  const [gherkin, setGherkin] = useState<string | null>(null);
  const [recordedSession, setRecordedSession] = useState<RecordedSession | null>(null);
  const [loadedFeature, setLoadedFeature] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string>("");

  // Derived state
  const isRecording = status.state === "recording";
  const isProcessing = status.state === "processing" || isGenerating;
  const isReviewing = status.state === "review" || (gherkin !== null && !isGenerating);
  const isReplaying = status.state === "replaying";
  
  // Debug derived state
  console.log("[useRecording] Derived state - isRecording:", isRecording, "isProcessing:", isProcessing, "isReviewing:", isReviewing, "status.state:", status.state, "isGenerating:", isGenerating);

  // Subscribe to recording events
  useEffect(() => {
    console.log("[useRecording] Setting up event subscription");
    const unsubscribe = window.jarvis.recording.onEvent((event: RecordingEventPayload) => {
      console.log("[useRecording] Received event:", event.type, event);
      switch (event.type) {
        case "state_changed":
          console.log("[useRecording] State changed to:", event.status.state, "full status:", event.status);
          setStatus(event.status);
          if (event.status.currentGherkin) {
            setGherkin(event.status.currentGherkin);
          }
          break;

        case "action_recorded":
          setStatus((prev) => ({
            ...prev,
            actionCount: event.count,
          }));
          break;

        case "gherkin_updated":
          console.log("[useRecording] Gherkin updated");
          setGherkin(event.gherkin);
          break;

        case "processing_progress":
          setStatus((prev) => ({
            ...prev,
            processingProgress: {
              current: event.current,
              total: event.total,
            },
          }));
          break;

        case "error":
          console.log("[useRecording] Error event:", event.error);
          setError(event.error);
          break;
      }
    });

    // Load initial status
    console.log("[useRecording] Loading initial status");
    window.jarvis.recording.getStatus().then((initialStatus) => {
      console.log("[useRecording] Initial status loaded:", initialStatus);
      setStatus(initialStatus);
    });

    return () => {
      console.log("[useRecording] Cleaning up event subscription");
      unsubscribe();
    };
  }, []);

  // Update elapsed time while recording
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setStatus((prev) => ({
        ...prev,
        elapsedTime: (prev.elapsedTime || 0) + 1000,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  /**
   * Start recording
   */
  const startRecording = useCallback(async (mode: string, startUrl?: string) => {
    setError(null);
    try {
      await window.jarvis.recording.start(mode, startUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    console.log("[useRecording] stopRecording called - current status:", status);
    console.log("[useRecording] stopRecording called - current isGenerating:", isGenerating);
    setError(null);
    try {
      console.log("[useRecording] Calling window.jarvis.recording.stop()...");
      const session = await window.jarvis.recording.stop();
      console.log("[useRecording] Session stopped:", session);
      console.log("[useRecording] After stop - isGenerating should still be false:", isGenerating);
      // Store the recorded session for display
      if (session) {
        console.log("[useRecording] Setting recorded session");
        setRecordedSession(session as RecordedSession);
      }
      // Clear any processing message
      setProcessingMessage("");
      console.log("[useRecording] stopRecording completed successfully");
      return session;
    } catch (err) {
      console.error("[useRecording] stopRecording error:", err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [status, isGenerating]);

  /**
   * Generate Gherkin from recording
   */
  const generateGherkin = useCallback(async (customInstructions?: string): Promise<GherkinResult> => {
    setError(null);
    setIsGenerating(true);
    setProcessingMessage("AI is analyzing your recorded interactions...");
    console.log("[useRecording] Starting Gherkin generation with custom instructions:", customInstructions);
    
    try {
      // Update message during processing
      const messageUpdater = setInterval(() => {
        setProcessingMessage((prev) => {
          if (prev.includes("analyzing")) return "Converting actions to Gherkin steps...";
          if (prev.includes("Converting")) return "Optimizing locators and step descriptions...";
          if (prev.includes("Optimizing")) return "Finalizing Gherkin scenario...";
          return prev;
        });
      }, 3000);
      
      const result = await window.jarvis.recording.generateGherkin(customInstructions);
      clearInterval(messageUpdater);
      
      console.log("[useRecording] Gherkin generation result:", result);
      
      if (result && result.gherkin) {
        console.log("[useRecording] Setting gherkin:", result.gherkin.substring(0, 100) + "...");
        setGherkin(result.gherkin);
        // Update state to review
        setStatus((prev) => ({ ...prev, state: "review" }));
      } else {
        console.warn("[useRecording] No gherkin in result");
      }
      
      setIsGenerating(false);
      setProcessingMessage("");
      return result;
    } catch (err) {
      console.error("[useRecording] Gherkin generation error:", err);
      setIsGenerating(false);
      setProcessingMessage("");
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  /**
   * Refine Gherkin based on instruction
   */
  const refineGherkin = useCallback(
    async (instruction: string): Promise<GherkinResult> => {
      setError(null);
      setIsGenerating(true);
      setProcessingMessage("Refining Gherkin based on your feedback...");
      try {
        const result = await window.jarvis.recording.refineGherkin(instruction);
        if (result && result.gherkin) {
          setGherkin(result.gherkin);
        }
        setIsGenerating(false);
        setProcessingMessage("");
        return result;
      } catch (err) {
        setIsGenerating(false);
        setProcessingMessage("");
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    []
  );

  /**
   * Export Gherkin to file
   */
  const exportGherkin = useCallback(async () => {
    if (!gherkin) {
      throw new Error("No Gherkin content to export");
    }

    const filePath = await window.jarvis.recording.pickExportPath();
    if (!filePath) return null;

    await window.jarvis.recording.export(gherkin, filePath);
    return filePath;
  }, [gherkin]);

  /**
   * Discard current recording
   */
  const discardRecording = useCallback(() => {
    window.jarvis.recording.discard();
    setGherkin(null);
    setRecordedSession(null);
    setError(null);
    setLoadedFeature(null);
    setIsGenerating(false);
    setProcessingMessage("");
  }, []);

  /**
   * Load feature file for replay
   */
  const loadFeatureFile = useCallback(async () => {
    const result = await window.jarvis.recording.loadFeature();
    if (result) {
      setLoadedFeature(result);
      setGherkin(result.content);
    }
    return result;
  }, []);

  /**
   * Clear loaded feature
   */
  const clearFeature = useCallback(() => {
    setLoadedFeature(null);
    setGherkin(null);
  }, []);

  return {
    // State
    status,
    gherkin,
    recordedSession,
    loadedFeature,
    error,
    processingMessage,

    // Derived state
    isRecording,
    isProcessing,
    isReviewing,
    isReplaying,

    // Actions
    startRecording,
    stopRecording,
    generateGherkin,
    refineGherkin,
    exportGherkin,
    discardRecording,
    loadFeatureFile,
    clearFeature,
  };
}
