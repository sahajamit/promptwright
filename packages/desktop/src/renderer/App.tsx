import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityLogs } from "./components/ActivityLogs";
import { AgentsSkillsPanel } from "./components/AgentsSkillsPanel";
import { ChatInterface } from "./components/ChatInterface";
import { Header } from "./components/Header";
import { HelpPanel } from "./components/HelpPanel";
import { LoadingScreen } from "./components/LoadingScreen";
import { PrerequisiteBlocker, type PrerequisiteBlockerStatus } from "./components/PrerequisiteBlocker";
import { RecordingPanel } from "./components/RecordingPanel";
import { SessionSidebar } from "./components/SessionSidebar";
import { Settings } from "./components/Settings";
import { ToolBar, type RightView, type ToolBarAction } from "./components/ToolBar";
import { useChat } from "./hooks/useChat";
import { useSession } from "./hooks/useSession";
import { exportApiConversationAsHtml, exportSessionAsHtml } from "./lib/export-service";
import type { LogEntry, RecordedActionLog } from "./types";

export default function App() {
  const [rightView, setRightView] = useState<RightView>("chat");
  const [showChatHistory, setShowChatHistory] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);

  const [showLogs, setShowLogs] = useState(false);
  const [workDir, setWorkDir] = useState<string>("");
  const [appError, setAppError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPrereqChecking, setIsPrereqChecking] = useState(false);
  const [prerequisiteStatus, setPrerequisiteStatus] = useState<PrerequisiteBlockerStatus | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const currentReasoningIdRef = useRef<string | null>(null);
  const recordingStartLogIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef<boolean>(false);

  // Check if running in Electron and wait for APIs to be ready
  useEffect(() => {
    const checkReady = async () => {
      if (typeof window.jarvis === 'undefined') {
        setAppError('Not running in Electron. Please use "pnpm dev" instead of opening in browser.');
        return;
      }

      if (!window.jarvis.session) {
        console.error('window.jarvis.session is not available');
        setAppError('Preload script not loaded correctly. Please restart the app.');
        return;
      }

      console.log('JARVIS API ready:', window.jarvis);

      // Hard gate startup if prerequisites are not met.
      try {
        const prereqStatus = await window.jarvis.prerequisites.getStatus();
        if (!prereqStatus.passed) {
          setPrerequisiteStatus(prereqStatus as PrerequisiteBlockerStatus);
          setIsReady(true);
          return;
        }
      } catch (error) {
        console.error("Failed to check startup prerequisites:", error);
        setAppError("Failed to verify startup prerequisites. Please restart the app.");
        return;
      }

      setIsReady(true);
    };

    // Delay to ensure preload script AND main process are fully loaded
    const timer = setTimeout(checkReady, 500);
    return () => clearTimeout(timer);
  }, []);

  const handlePrerequisiteRecheck = async () => {
    setIsPrereqChecking(true);
    try {
      const status = await window.jarvis.prerequisites.runCheck();
      setPrerequisiteStatus(status as PrerequisiteBlockerStatus);
      if (status.passed) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to recheck prerequisites:", error);
    } finally {
      setIsPrereqChecking(false);
    }
  };

  // Session management
  const {
    sessions,
    currentSession,
    isLoading: sessionsLoading,
    isCreatingSession,
    isSwitchingSession,
    switchingToSessionId,
    copilotReadiness,
    copilotError,
    createNewSession,
    switchSession,
    deleteSession,
    updateExecutionData,
    retryConnection,
  } = useSession();

  // Track if we've already attempted to create a session to prevent infinite loops
  const hasAttemptedCreate = useRef(false);

  // Auto-create session if none exist (orchestrator mode — no persona gate)
  useEffect(() => {
    const createSessionIfNeeded = async () => {
      if (sessionsLoading) return;
      if (isCreatingSession) return;
      if (hasAttemptedCreate.current) return;

      if (sessions.length === 0 && !currentSession) {
        hasAttemptedCreate.current = true;
        await createNewSession();
      }
    };

    createSessionIfNeeded();
  }, [sessionsLoading, isCreatingSession, sessions.length, currentSession, createNewSession]);

  // Chat management
  const {
    messages,
    currentResponse,
    isLoading,
    isConnected,
    sendMessage,
    clearMessages,
  } = useChat({
    initialMessages: currentSession?.messages || [],
    onLog: (log) => {
      // Handle reasoning deltas specially - accumulate them
      if (log.type === "thinking") {
        setLogs((prev) => {
          // Find the most recent thinking log (not by ID, but by type and recency)
          const lastThinkingIndex = prev.reduce((lastIdx, curr, idx) => {
            return curr.type === "thinking" ? idx : lastIdx;
          }, -1);

          // If we found a recent thinking log and no other logs came after it, update it
          if (lastThinkingIndex >= 0 && lastThinkingIndex === prev.length - 1) {
            const updated = [...prev];
            updated[lastThinkingIndex] = {
              ...updated[lastThinkingIndex],
              content: updated[lastThinkingIndex].content + log.content,
              timestamp: Date.now(),
            };
            currentReasoningIdRef.current = updated[lastThinkingIndex].id;
            return updated;
          }

          // Otherwise create a new reasoning log
          const newReasoningId = `thinking-${Date.now()}-${Math.random()}`;
          currentReasoningIdRef.current = newReasoningId;
          return [...prev, { ...log, id: newReasoningId }];
        });
      } else {
        // For tool or info logs, just add them normally
        setLogs((prev) => [...prev, log]);
      }
    },
    onMessagesChange: async (newMessages) => {
      // Update current session with new messages
      if (currentSession) {
        const updatedSession = {
          ...currentSession,
          messages: newMessages,
          updatedAt: Date.now(),
        };

        // Update title if first message
        if (newMessages.length === 1 && currentSession.title === "New Chat") {
          const firstMessage = newMessages[0];
          if (firstMessage.role === "user") {
            const title = firstMessage.content.slice(0, 50);
            updatedSession.title =
              title.length < firstMessage.content.length ? `${title}...` : title;
          }
        }

        // Save to storage
        await window.jarvis.session.save(
          updatedSession.id,
          JSON.stringify(updatedSession, null, 2)
        );
      }
    },
  });

  // Get initial working directory
  useEffect(() => {
    window.jarvis.getWorkDir().then(setWorkDir);
  }, []);

  // Subscribe to recording events for Activity panel
  useEffect(() => {
    if (!window.jarvis?.recording?.onEvent) return;

    const unsubscribe = window.jarvis.recording.onEvent((event: unknown) => {
      const typedEvent = event as {
        type: string;
        status?: { state: string };
        action?: RecordedActionLog;
        count?: number;
        session?: {
          id: string;
          startUrl: string;
          mode: string;
          startTime: number;
          endTime?: number;
          actions: RecordedActionLog[];
        };
        tempFilePath?: string;
      };

      // When session is recorded, add full session data to logs
      if (typedEvent.type === "session_recorded" && typedEvent.session) {
        const session = typedEvent.session;
        const tempFilePath = typedEvent.tempFilePath;

        // Clear recording state
        isRecordingRef.current = false;
        recordingStartLogIdRef.current = null;

        setLogs((prev) => [
          ...prev,
          {
            id: `recording-${session.id}`,
            type: "recording" as const,
            content: `Recorded ${session.actions.length} actions from ${session.startUrl}${tempFilePath ? `\nTemp file: ${tempFilePath}` : ''}`,
            timestamp: Date.now(),
            status: "completed" as const,
            recordedActions: session.actions,
            sessionInfo: {
              id: session.id,
              startUrl: session.startUrl,
              mode: session.mode,
              startTime: session.startTime,
              endTime: session.endTime,
            },
            tempFilePath,
          },
        ]);
      }

      // When recording state changes
      if (typedEvent.type === "state_changed") {
        if (typedEvent.status?.state === "recording") {
          // Only add log if we're not already recording
          if (!isRecordingRef.current) {
            isRecordingRef.current = true;
            const logId = `recording-start-${Date.now()}`;
            recordingStartLogIdRef.current = logId;
            setLogs((prev) => [
              ...prev,
              {
                id: logId,
                type: "info" as const,
                content: "Recording started. Interact with the browser...",
                timestamp: Date.now(),
              },
            ]);
          }
        } else if (typedEvent.status?.state !== "recording") {
          // Clear the tracking when state changes away from recording
          isRecordingRef.current = false;
          recordingStartLogIdRef.current = null;
        }
      }

      // When an action is recorded during recording
      if (typedEvent.type === "action_recorded" && typedEvent.action) {
        // We could show real-time action updates here if needed
        console.log("[Recording] Action captured:", typedEvent.action.type);
      }
    });

    return () => unsubscribe();
  }, []);

  // Reset reasoning ID when loading completes
  useEffect(() => {
    if (!isLoading) {
      currentReasoningIdRef.current = null;
    }
  }, [isLoading]);

  const handlePickFolder = async () => {
    const path = await window.jarvis.pickFolder();
    if (path) {
      setWorkDir(path);
    }
  };

  const handleNewChat = async () => {
    // Close browser to ensure fresh state for next test
    try {
      await window.jarvis.execution.closeBrowser();
    } catch (error) {
      console.error("Failed to close browser:", error);
    }
    await createNewSession();
    clearMessages();
    setLogs([]);
    currentReasoningIdRef.current = null;
  };

  const handleSelectSession = async (sessionId: string) => {
    await switchSession(sessionId);
    setLogs([]);
    currentReasoningIdRef.current = null;
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
  };

  const handleExportSession = async (sessionId: string) => {
    try {
      // Find the session to export
      const sessionToExport = sessions.find((s) => s.id === sessionId);
      if (!sessionToExport) {
        console.error("Session not found:", sessionId);
        return;
      }

      // Only export sessions that have execution data
      if (!sessionToExport.executionData) {
        console.warn("Export is only available for sessions with execution data");
        return;
      }

      let htmlContent: string;

      // For API test sessions with preserved messages, use the API-specific export
      // to produce the same rich HTML as the inline "Export Conversation" button
      if (
        sessionToExport.executionData?.testType === "api" &&
        sessionToExport.executionData.apiMessages?.length
      ) {
        htmlContent = exportApiConversationAsHtml(
          sessionToExport.executionData.apiMessages,
          sessionToExport.executionData.testInput || ""
        );
      } else {
        htmlContent = await exportSessionAsHtml(sessionToExport);
      }

      // Save the HTML file
      const savedPath = await window.jarvis.session.exportHtml(sessionId, htmlContent);

      if (savedPath) {
        console.log("Session exported to:", savedPath);
      }
    } catch (error) {
      console.error("Failed to export session:", error);
    }
  };

  const handleSettingsSaved = () => {
    setSettingsVersion((prev) => prev + 1);
    setRightView("chat");
  };

  const handleToolBarAction = useCallback((action: ToolBarAction) => {
    switch (action) {
      case "toggle-chat-history":
        if (rightView !== "chat") {
          setRightView("chat");
          setShowChatHistory(true);
        } else {
          setShowChatHistory((prev) => !prev);
        }
        break;
      case "agents-skills":
        setRightView("agents-skills");
        break;
      case "recording":
        setRightView("recording");
        break;
      case "settings":
        setRightView("settings");
        break;
      case "help":
        setRightView("help");
        break;
      case "toggle-activity":
        setShowLogs((prev) => !prev);
        break;
    }
  }, [rightView]);

  // Subscribe to agent events for active agent tracking
  useEffect(() => {
    if (!window.jarvis?.onEvent) return;

    const unsubscribe = window.jarvis.onEvent((event: any) => {
      if (event.type === "agent:executing") {
        setActiveAgentName(event.agentDisplayName || event.agent);
      } else if (event.type === "session_idle" || event.type === "disconnected") {
        setActiveAgentName(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Show loading screen while checking readiness
  if (!isReady && !appError) {
    return <LoadingScreen />;
  }

  // Show error screen if not in Electron
  if (appError) {
    return (
      <div className="flex items-center justify-center h-screen bg-white text-gray-900 p-8">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">Application Error</h1>
          <p className="text-gray-600 mb-6">{appError}</p>
          <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg text-left">
            <p className="text-sm text-gray-700 font-mono">
              Run in terminal:<br />
              <span className="text-lseg-blue">cd packages/desktop && pnpm dev</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Hard block app usage until startup prerequisites are satisfied.
  if (prerequisiteStatus && !prerequisiteStatus.passed) {
    return (
      <PrerequisiteBlocker
        status={prerequisiteStatus}
        isChecking={isPrereqChecking}
        onRecheck={handlePrerequisiteRecheck}
      />
    );
  }

  const showSidebar = showChatHistory && rightView === "chat";

  return (
    <div className="flex h-screen bg-bg text-text">
      {/* Left: Toolbar */}
      <ToolBar
        rightView={rightView}
        showChatHistory={showChatHistory}
        showLogs={showLogs}
        onAction={handleToolBarAction}
        isConnected={isConnected}
      />

      {/* Chat history sidebar (only visible in chat view when toggled) */}
      {showSidebar && (
        <div className="w-64 bg-surface border-r border-border flex-shrink-0 overflow-hidden">
          <SessionSidebar
            sessions={sessions}
            currentSessionId={currentSession?.id || ""}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onExportSession={handleExportSession}
            isSwitchingSession={isSwitchingSession}
            switchingToSessionId={switchingToSessionId}
          />
        </div>
      )}

      {/* Right main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {rightView === "chat" && (
          <>
            <Header
              workDir={workDir}
              isConnected={isConnected}
              onPickFolder={handlePickFolder}
              onNewChat={handleNewChat}
              isCreatingSession={isCreatingSession}
              activeAgentName={activeAgentName}
            />
            <div className="flex flex-1 overflow-hidden">
              <ChatInterface
                messages={messages}
                currentResponse={currentResponse}
                isLoading={isLoading}
                onSendMessage={sendMessage}
                onLog={(log) => setLogs((prev) => [...prev, log])}
                sessionKey={currentSession?.id}
                onExecutionComplete={updateExecutionData}
                currentSession={currentSession}
                settingsVersion={settingsVersion}
                copilotReadiness={copilotReadiness}
                copilotError={copilotError}
                onRetryConnection={retryConnection}
              />
              {showLogs && (
                <ActivityLogs
                  logs={logs}
                  onClear={() => setLogs([])}
                />
              )}
            </div>
          </>
        )}

        {rightView === "agents-skills" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <AgentsSkillsPanel />
            </div>
            {showLogs && (
              <ActivityLogs
                logs={logs}
                onClear={() => setLogs([])}
              />
            )}
          </div>
        )}

        {rightView === "recording" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <RecordingPanel />
            </div>
            {showLogs && (
              <ActivityLogs
                logs={logs}
                onClear={() => setLogs([])}
              />
            )}
          </div>
        )}

        {rightView === "settings" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <Settings
                onSave={handleSettingsSaved}
                onCancel={() => setRightView("chat")}
              />
            </div>
            {showLogs && (
              <ActivityLogs
                logs={logs}
                onClear={() => setLogs([])}
              />
            )}
          </div>
        )}

        {rightView === "help" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <HelpPanel />
            </div>
            {showLogs && (
              <ActivityLogs
                logs={logs}
                onClear={() => setLogs([])}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
