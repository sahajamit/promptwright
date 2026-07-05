import { AlertCircle, RotateCcw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { CopilotReadiness } from "../hooks/useSession";
import { useTestExecution } from "../hooks/useTestExecution";
import type { ExecutionData, LogEntry } from "../types";
import { APIExecutionLog } from "./APIExecutionLog";
import { ExamplesGallery } from "./ExamplesGallery";
import { ExecutionWorkspace } from "./execution/ExecutionWorkspace";
import { PromptComposer, type RuntimeExecutionSettings } from "./execution/PromptComposer";

interface ExecutionPanelProps {
  onLog?: (log: LogEntry) => void;
  onExecutionComplete?: (executionData: Partial<ExecutionData>) => Promise<void>;
  sessionExecutionData?: ExecutionData;
  settingsVersion?: number;
  copilotReadiness?: CopilotReadiness;
  copilotError?: string | null;
  onRetryConnection?: () => void;
}

type AutomationMode = "playwright-mcp" | "playwright-cli";

function formatAutomationMode(mode: string | undefined): string {
  return mode === "playwright-cli" ? "Playwright CLI" : "Playwright MCP";
}

/**
 * ExecutionPanel — stateful controller for the AI QA Assistant run page.
 * Renders the centered PromptComposer (idle) or the fixed IDE ExecutionWorkspace
 * (executing / completed / historical web). API + error states have dedicated views.
 */
export function ExecutionPanel({
  onLog,
  onExecutionComplete,
  sessionExecutionData,
  settingsVersion = 0,
  copilotReadiness,
  copilotError,
  onRetryConnection,
}: ExecutionPanelProps) {
  const { state, runTest, cancelExecution, reset } = useTestExecution();
  const [testInput, setTestInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [showExamplesGallery, setShowExamplesGallery] = useState(false);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeExecutionSettings>({
    modelLabel: "Loading...",
    modelHint: "Current model",
    automationModeLabel: "Loading...",
    loading: true,
  });

  const isViewingHistory =
    sessionExecutionData &&
    sessionExecutionData.logs &&
    sessionExecutionData.logs.length > 0 &&
    state.status === "idle";

  useEffect(() => {
    let isMounted = true;
    const loadRuntimeSettings = async () => {
      try {
        const [config, activeModel] = await Promise.all([
          window.jarvis.config.get(),
          window.jarvis.models.getActive(),
        ]);
        if (!isMounted) return;
        const configuredModel = config?.orchestrator?.model as string | undefined;
        const modelLabel = configuredModel || activeModel || "Default (Copilot)";
        const modelHint = configuredModel ? "Configured in Settings" : "Using Copilot default model";
        const automationMode = (config?.browser?.automationMode as AutomationMode | undefined) || "playwright-mcp";
        setRuntimeSettings({
          modelLabel,
          modelHint,
          automationModeLabel: formatAutomationMode(automationMode),
          loading: false,
        });
      } catch (error) {
        console.error("[ExecutionPanel] Failed to load runtime settings:", error);
        if (!isMounted) return;
        setRuntimeSettings({
          modelLabel: "Unavailable",
          modelHint: "Unable to load model from settings",
          automationModeLabel: "Unavailable",
          loading: false,
        });
      }
    };
    void loadRuntimeSettings();
    return () => {
      isMounted = false;
    };
  }, [settingsVersion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = attachedFile?.content || testInput;
    if (!input.trim()) return;

    if (onLog) {
      try {
        const activeModel = await window.jarvis.models.getActive();
        onLog({
          id: `prompt-${Date.now()}`,
          type: "prompt",
          content: `Test execution started - prompt sent to orchestrator`,
          timestamp: Date.now(),
          userPrompt: input.trim(),
          modelUsed: activeModel || undefined,
        });
      } catch (error) {
        console.error("[ExecutionPanel] Failed to get active model:", error);
      }
    }
    await runTest(input.trim());
  };

  const handleFileAttach = async () => {
    const result = await window.jarvis.recording.loadFeature();
    if (result) {
      setAttachedFile({
        name: result.path.split("/").pop() || "feature.file",
        content: result.content,
      });
      setTestInput("");
    }
  };

  const handleRemoveFile = () => setAttachedFile(null);

  const handleRunAgain = () => {
    const input = attachedFile?.content || testInput;
    if (input.trim()) runTest(input.trim());
  };

  const handleNewTest = async () => {
    try {
      await window.jarvis.execution.closeBrowser();
    } catch (error) {
      console.error("Failed to close browser:", error);
    }
    reset();
    setTestInput("");
    setAttachedFile(null);
  };

  // Save execution data to session when a test completes.
  const hasSavedRef = useRef(false);
  useEffect(() => {
    if (state.status === "completed" && onExecutionComplete && !hasSavedRef.current) {
      hasSavedRef.current = true;
      const logs: LogEntry[] = state.executionMessages.map((msg, idx) => ({
        id: msg.id || `log-${idx}`,
        type: msg.isVerdict ? "info" : "tool",
        content: msg.content,
        timestamp: msg.timestamp,
        status: "completed" as const,
      }));
      const hasFailedVerdict = state.executionMessages.some((msg) => msg.verdictType === "fail");
      const finalStatus: "completed" | "failed" = hasFailedVerdict ? "failed" : "completed";
      const fullMessages = state.executionMessages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        isVerdict: msg.isVerdict,
        verdictType: msg.verdictType,
        isToolCall: msg.isToolCall,
        toolName: msg.toolName,
        toolArgs: msg.toolArgs,
        isToolResult: msg.isToolResult,
        turnNumber: msg.turnNumber,
        isTurnSeparator: msg.isTurnSeparator,
      }));
      const executionData: Partial<ExecutionData> = {
        logs,
        executionMessages: fullMessages,
        recordingPath: state.recordingPath || undefined,
        testInput: state.testInput,
        status: finalStatus,
        usageMetadata: state.usageMetadata || undefined,
      };
      onExecutionComplete(executionData).catch((error) => {
        console.error("[ExecutionPanel] Failed to save execution data:", error);
      });
    }
    if (state.status !== "completed") {
      hasSavedRef.current = false;
    }
  }, [state.status, state.executionMessages, state.recordingPath, state.testInput, state.usageMetadata, onExecutionComplete]);

  const renderContent = () => {
    // Historical session view
    if (isViewingHistory && sessionExecutionData) {
      const historicalMessages = sessionExecutionData.executionMessages
        ? sessionExecutionData.executionMessages
        : sessionExecutionData.logs.map((log) => ({
            id: log.id,
            content: log.content,
            timestamp: log.timestamp,
            isVerdict:
              log.type === "info" &&
              (log.content.includes("TEST PASSED:") || log.content.includes("TEST FAILED:")),
            verdictType: log.content.includes("TEST PASSED:")
              ? ("pass" as const)
              : log.content.includes("TEST FAILED:")
                ? ("fail" as const)
                : undefined,
          }));

      const historicalRunAgain = () => {
        if (sessionExecutionData.testInput) setTestInput(sessionExecutionData.testInput);
        reset();
      };

      if (sessionExecutionData.testType === "api") {
        return (
          <APIExecutionLog
            messages={historicalMessages}
            isExecuting={false}
            testInput={sessionExecutionData.testInput || ""}
            usageMetadata={sessionExecutionData.usageMetadata || null}
            onCancel={cancelExecution}
            onRunAgain={historicalRunAgain}
            onNewTest={handleNewTest}
          />
        );
      }

      return (
        <ExecutionWorkspace
          messages={historicalMessages}
          isExecuting={false}
          testInput={sessionExecutionData.testInput || ""}
          recordingPath={sessionExecutionData.recordingPath || null}
          usageMetadata={sessionExecutionData.usageMetadata || null}
          elapsedTime={0}
          onCancel={cancelExecution}
          onRunAgain={historicalRunAgain}
          onNewTest={handleNewTest}
          isHistorical
          testType="web"
        />
      );
    }

    switch (state.status) {
      case "idle":
        return (
          <PromptComposer
            testInput={testInput}
            setTestInput={setTestInput}
            attachedFile={attachedFile}
            onSubmit={handleSubmit}
            onFileAttach={handleFileAttach}
            onRemoveFile={handleRemoveFile}
            runtimeSettings={runtimeSettings}
            onShowExamples={() => setShowExamplesGallery(true)}
            copilotReadiness={copilotReadiness}
            copilotError={copilotError}
            onRetryConnection={onRetryConnection}
          />
        );

      case "executing":
      case "completed":
        return (
          <ExecutionWorkspace
            messages={state.executionMessages}
            isExecuting={state.status === "executing"}
            testInput={state.testInput}
            recordingPath={state.recordingPath}
            usageMetadata={state.usageMetadata}
            elapsedTime={state.elapsedTime}
            onCancel={cancelExecution}
            onRunAgain={handleRunAgain}
            onNewTest={handleNewTest}
            testType="web"
          />
        );

      case "error":
        return <ErrorState message={state.error || "An error occurred"} onRetry={handleNewTest} />;

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {renderContent()}
      <ExamplesGallery
        isOpen={showExamplesGallery}
        onClose={() => setShowExamplesGallery(false)}
        onSelectExample={(example) => {
          setTestInput(example);
          setAttachedFile(null);
        }}
      />
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 bg-bg">
      <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-danger" />
      </div>
      <h2 className="text-lg font-semibold text-text mb-2">Execution Failed</h2>
      <p className="text-sm text-text-muted text-center max-w-md mb-6">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent-fg bg-brand-gradient rounded-lg hover:opacity-90 transition-opacity"
      >
        <RotateCcw size={16} />
        Try Again
      </button>
    </div>
  );
}
