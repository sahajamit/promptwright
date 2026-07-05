import { ChevronDown, ChevronRight, Clock, MousePointer, Navigation, RefreshCw, Send, Trash2, Type, X, Brain } from "lucide-react";
import { useCallback, useState } from "react";
import { useRecording, type RecordedActionDisplay } from "../hooks/useRecording";
import { ConfirmDialog } from "./ConfirmDialog";
import { GherkinPreview } from "./GherkinPreview";
import { RecordingControls } from "./RecordingControls";

interface RecordingPanelProps {
  onClose?: () => void;
}

/**
 * Processing indicator with animated stages
 */
function ProcessingOverlay({ message }: { message: string }) {
  return (
    <div className="bg-gradient-to-br from-accent/10 to-accent/5 border border-accent rounded-xl p-8 text-center">
      <div className="relative inline-block mb-6">
        {/* Animated circles */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-accent rounded-full animate-ping opacity-20" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-accent rounded-full animate-pulse" />
        </div>
        <div className="relative w-16 h-16 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-accent animate-spin" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-text mb-2">
        AI Processing
      </h3>
      <p className="text-text-muted mb-4">{message || "Processing your recording..."}</p>

      <div className="flex justify-center gap-1">
        <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

/**
 * Recorded actions panel - expandable list of captured actions
 */
function RecordedActionsPanel({ 
  actions, 
  sessionInfo 
}: { 
  actions: RecordedActionDisplay[]; 
  sessionInfo: { startUrl: string; mode: string; startTime: number; endTime?: number } 
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getActionIcon = (type: string) => {
    switch (type) {
      case "click":
        return <MousePointer className="w-3 h-3" />;
      case "type":
        return <Type className="w-3 h-3" />;
      case "navigate":
        return <Navigation className="w-3 h-3" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-text-muted" />;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const duration = sessionInfo.endTime 
    ? Math.round((sessionInfo.endTime - sessionInfo.startTime) / 1000) 
    : 0;

  return (
    <div className="bg-surface-2 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
          <span className="font-medium text-text-muted">
            Recorded Actions ({actions.length})
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {duration}s
          </span>
          <span className="bg-surface px-2 py-0.5 rounded text-xs">
            {sessionInfo.mode}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border max-h-64 overflow-y-auto">
          <div className="p-2 bg-surface-2 text-xs text-text-muted">
            Start URL: {sessionInfo.startUrl}
          </div>
          <div className="divide-y divide-border">
            {actions.map((action, index) => (
              <div key={index} className="p-2 hover:bg-surface-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-6 text-right">{index + 1}.</span>
                  <span className="flex items-center gap-1 text-accent">
                    {getActionIcon(action.type)}
                    <span className="font-medium">{action.type}</span>
                  </span>
                  {action.target && (
                    <span className="text-text-muted truncate max-w-[200px]">
                      on &lt;{action.target.tagName}&gt;
                      {action.target.textContent && ` "${action.target.textContent.slice(0, 20)}..."`}
                    </span>
                  )}
                  {action.value && (
                    <span className="text-success">
                      "{action.value.slice(0, 30)}{action.value.length > 30 ? '...' : ''}"
                    </span>
                  )}
                  {action.url && (
                    <span className="text-purple-500 dark:text-purple-400 truncate max-w-[200px]">
                      {action.url}
                    </span>
                  )}
                </div>
                {action.target?.locators && (
                  <div className="ml-8 mt-1 text-xs text-text-muted font-mono">
                    {action.target.locators.testId || action.target.locators.css || action.target.locators.xpath}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main recording panel for Workflow Observer persona
 */
export function RecordingPanel({ onClose }: RecordingPanelProps) {
  const {
    status,
    gherkin,
    recordedSession,
    isRecording,
    isProcessing,
    isReviewing,
    error,
    processingMessage,
    startRecording,
    stopRecording,
    generateGherkin,
    refineGherkin,
    exportGherkin,
    discardRecording,
    loadFeatureFile,
  } = useRecording();

  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refinementHistory, setRefinementHistory] = useState<
    Array<{ instruction: string; summary: string }>
  >([]);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");

  const handleStartRecording = useCallback(
    async (mode: string, startUrl?: string) => {
      try {
        await startRecording(mode, startUrl);
      } catch (err) {
        console.error("Failed to start recording:", err);
      }
    },
    [startRecording]
  );

  const handleStopRecording = useCallback(async () => {
    console.log("[RecordingPanel] handleStopRecording called - starting stop process");
    try {
      const session = await stopRecording();
      console.log("[RecordingPanel] stopRecording completed, session:", session);
      console.log("[RecordingPanel] Current status before setShowInstructionsDialog:", status);
      console.log("[RecordingPanel] isProcessing before setShowInstructionsDialog:", isProcessing);
      // Show instructions dialog instead of auto-generating
      console.log("[RecordingPanel] Setting showInstructionsDialog to true");
      setShowInstructionsDialog(true);
      console.log("[RecordingPanel] showInstructionsDialog set to true (but state update is async)");
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  }, [stopRecording, status, isProcessing]);

  const handleGenerateGherkin = useCallback(async () => {
    try {
      setShowInstructionsDialog(false);
      await generateGherkin(customInstructions.trim() || undefined);
      // Clear instructions after generation
      setCustomInstructions("");
    } catch (err) {
      console.error("Failed to generate Gherkin:", err);
    }
  }, [generateGherkin, customInstructions]);

  const handleRefine = useCallback(async () => {
    if (!refinementInput.trim() || isRefining) return;

    setIsRefining(true);
    try {
      const result = await refineGherkin(refinementInput.trim());
      setRefinementHistory((prev) => [
        ...prev,
        { instruction: refinementInput.trim(), summary: result.summary },
      ]);
      setRefinementInput("");
    } catch (err) {
      console.error("Failed to refine Gherkin:", err);
    } finally {
      setIsRefining(false);
    }
  }, [refinementInput, isRefining, refineGherkin]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleRefine();
      }
    },
    [handleRefine]
  );

  const handleExport = useCallback(async () => {
    try {
      const path = await exportGherkin();
      if (path) {
        await window.jarvis.dialog.showMessage({
          type: "info",
          title: "Export Successful",
          message: "Exported successfully to:",
          detail: path,
        });
      }
    } catch (err) {
      console.error("Failed to export:", err);
    }
  }, [exportGherkin]);

  const handleDiscard = useCallback(() => {
    setShowDiscardDialog(true);
  }, []);

  const confirmDiscard = useCallback(() => {
    discardRecording();
    setRefinementHistory([]);
    setShowDiscardDialog(false);
  }, [discardRecording]);

  const handleLoadFeature = useCallback(async () => {
    try {
      await loadFeatureFile();
    } catch (err) {
      console.error("Failed to load feature:", err);
    }
  }, [loadFeatureFile]);

  // Debug logging for render conditions
  console.log("[RecordingPanel] Render - status:", status);
  console.log("[RecordingPanel] Render - showInstructionsDialog:", showInstructionsDialog);
  console.log("[RecordingPanel] Render - isProcessing:", isProcessing);
  console.log("[RecordingPanel] Render - isRecording:", isRecording);
  console.log("[RecordingPanel] Render - recordedSession:", recordedSession ? "exists" : "null");
  console.log("[RecordingPanel] Render - Dialog condition (showInstructionsDialog && !isProcessing):", showInstructionsDialog && !isProcessing);
  console.log("[RecordingPanel] Render - Processing condition (isProcessing):", isProcessing);
  console.log("[RecordingPanel] Render - Controls condition ((status.state === 'idle' || isRecording) && !isProcessing):", (status.state === "idle" || isRecording) && !isProcessing);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-semibold text-text">
          Workflow Observer
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Error display */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger text-sm">
            {error}
          </div>
        )}

        {/* Recording Controls - show when idle or recording */}
        {(status.state === "idle" || isRecording) && !isProcessing && (
          <RecordingControls
            isRecording={isRecording}
            isProcessing={isProcessing}
            actionCount={status.actionCount || 0}
            elapsedTime={status.elapsedTime || 0}
            currentMode={status.mode}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onLoadFeature={handleLoadFeature}
          />
        )}

        {/* Custom Instructions Dialog - show after recording stops */}
        {showInstructionsDialog && !isProcessing && (
          <div className="bg-gradient-to-br from-accent/10 to-accent/5 border-2 border-accent rounded-xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Brain className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text">
                  AI Gherkin Generation
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  The AI will analyze your workflow and generate test scenarios. 
                  You can optionally provide custom instructions below.
                </p>
              </div>
            </div>

            {/* Custom Instructions Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-muted">
                Custom Instructions (Optional)
              </label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleGenerateGherkin();
                  }
                }}
                placeholder="e.g., 'Generate multiple test scenarios including edge cases and error handling' or 'Focus on critical user paths with different data variations'"
                className="w-full px-4 py-3 border-2 border-accent rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent bg-surface-2 text-text placeholder-text-muted"
                rows={4}
              />
              <p className="text-xs text-text-muted">
                Examples: "Create scenarios for both success and failure cases" • 
                "Include data-driven scenarios with multiple test data sets" • 
                "Focus on security testing aspects"
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setShowInstructionsDialog(false);
                  setCustomInstructions("");
                }}
                className="px-4 py-2 text-text-muted hover:text-text font-medium transition-colors"
              >
                Cancel
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGenerateGherkin()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent/90 text-accent-fg rounded-lg font-medium shadow-sm hover:shadow-md transition-all"
                >
                  <Send className="w-4 h-4" />
                  Generate
                </button>
              </div>
            </div>

            {/* Info Section */}
            {recordedSession && (
              <div className="flex items-center gap-4 pt-3 border-t border-accent text-sm text-text-muted">
                <div className="flex items-center gap-1">
                  <MousePointer className="w-4 h-4" />
                  <span>{recordedSession.actions.length} actions</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{Math.floor((recordedSession.endTime - recordedSession.startTime) / 1000)}s</span>
                </div>
                <div className="flex items-center gap-1">
                  <Navigation className="w-4 h-4" />
                  <span className="truncate max-w-xs">{recordedSession.startUrl}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing Indicator - show when AI is working */}
        {isProcessing && (
          <ProcessingOverlay message={processingMessage} />
        )}

        {/* Recorded Actions Panel - show after recording stops */}
        {recordedSession && recordedSession.actions && recordedSession.actions.length > 0 && !isProcessing && (
          <RecordedActionsPanel
            actions={recordedSession.actions}
            sessionInfo={{
              startUrl: recordedSession.startUrl,
              mode: recordedSession.mode,
              startTime: recordedSession.startTime,
              endTime: recordedSession.endTime,
            }}
          />
        )}

        {/* Gherkin Preview and Refinement - show when we have Gherkin */}
        {isReviewing && gherkin && !isProcessing && (
          <div className="space-y-4">
            {/* Gherkin Preview */}
            <GherkinPreview
              gherkin={gherkin}
              onExport={handleExport}
              showExportButton={true}
            />

            {/* Refinement History */}
            {refinementHistory.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-text-muted">
                  Refinement History
                </h3>
                {refinementHistory.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-2 bg-surface-2 rounded-lg text-sm"
                  >
                    <RefreshCw className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-text-muted">"{item.instruction}"</p>
                      <p className="text-text-muted text-xs mt-1">
                        {item.summary}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Refinement Input */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="p-2 bg-surface-2 border-b border-border">
                <p className="text-sm text-text-muted">
                  Type instructions to refine the Gherkin scenario
                </p>
              </div>
              <div className="flex items-end gap-2 p-2">
                <textarea
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., 'Change login step to use email instead of username'"
                  className="flex-1 px-3 py-2 border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent bg-surface-2 text-text"
                  rows={2}
                  disabled={isRefining}
                />
                <button
                  onClick={handleRefine}
                  disabled={!refinementInput.trim() || isRefining}
                  className="p-2 bg-accent hover:bg-accent/90 disabled:bg-surface-2 text-accent-fg rounded-lg transition-colors"
                >
                  {isRefining ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                onClick={handleDiscard}
                className="flex items-center gap-2 px-3 py-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Discard
              </button>

              <button
                onClick={handleExport}
                className="px-4 py-2 bg-success hover:bg-success/90 text-white rounded-lg font-medium transition-colors"
              >
                Export to File
              </button>
            </div>
          </div>
        )}

        {/* Help text when idle */}
        {status.state === "idle" && !gherkin && !recordedSession && (
          <div className="bg-accent/10 border border-accent rounded-lg p-4">
            <h3 className="font-medium text-accent mb-2">How to use Workflow Observer</h3>
            <ol className="text-sm text-accent space-y-2">
              <li>1. Select a recording mode (Standard recommended for most cases)</li>
              <li>2. Optionally enter a start URL for the workflow you want to observe</li>
              <li>3. Click "Start Observing" - a Chrome browser will open</li>
              <li>4. Interact with the app - AI will observe your workflow</li>
              <li>5. Click "Stop Recording" when done observing</li>
              <li>6. Optionally provide custom instructions (e.g., "generate multiple scenarios with edge cases")</li>
              <li>7. Click "Generate" - AI will create intelligent documentation</li>
              <li>8. Review and refine through conversation</li>
              <li>9. Export to a .feature file when satisfied</li>
            </ol>
          </div>
        )}
      </div>

      {/* Discard Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDiscardDialog}
        title="Discard this recording?"
        message="This cannot be undone."
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={confirmDiscard}
        onCancel={() => setShowDiscardDialog(false)}
        variant="danger"
      />
    </div>
  );
}
