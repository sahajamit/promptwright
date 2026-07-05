import { useCallback, useEffect, useRef, useState } from "react";
import { SessionStorage } from "../lib/session-storage";
import type { ExecutionData, Message, Thread } from "../types";

interface UseSessionOptions {
  onSessionChange?: (session: Thread) => void;
}

export type CopilotReadiness = "idle" | "initializing" | "ready" | "error";

export function useSession(options: UseSessionOptions = {}) {
  const [sessions, setSessions] = useState<Thread[]>([]);
  const [currentSession, setCurrentSession] = useState<Thread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);
  const [switchingToSessionId, setSwitchingToSessionId] = useState<string | null>(null);
  const [copilotReadiness, setCopilotReadiness] = useState<CopilotReadiness>("idle");
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const hasInitialized = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);

  // Keep ref in sync with current session id
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id || null;
  }, [currentSession?.id]);

  // Subscribe to push events from main process
  useEffect(() => {
    const unsubReady = window.jarvis.onSessionReady(({ uiSessionId, copilotSessionId }) => {
      if (uiSessionId !== currentSessionIdRef.current) return; // ignore stale
      setCopilotReadiness("ready");
      setCopilotError(null);
      // Persist copilotSessionId to storage
      if (copilotSessionId) {
        setCurrentSession(prev => {
          if (!prev) return prev;
          const updated = { ...prev, copilotSessionId };
          // Fire-and-forget save
          SessionStorage.saveSession(updated).catch(err =>
            console.error("[useSession] Failed to save copilotSessionId:", err)
          );
          return updated;
        });
      }
    });
    const unsubError = window.jarvis.onSessionError(({ uiSessionId, error }) => {
      if (uiSessionId !== currentSessionIdRef.current) return;
      setCopilotReadiness("error");
      setCopilotError(error);
    });
    return () => { unsubReady(); unsubError(); };
  }, []);

  // Load all sessions on mount
  useEffect(() => {
    loadAllSessions();
  }, []);

  // Load all sessions from storage
  const loadAllSessions = async () => {
    setIsLoading(true);
    try {
      // Check if window.jarvis exists
      if (typeof window.jarvis === 'undefined' || !window.jarvis.session) {
        console.error("window.jarvis.session is not available");
        setIsLoading(false);
        return;
      }

      const loadedSessions = await SessionStorage.listSessions();
      setSessions(loadedSessions);

      // Only initialize current session on first load (prevent React StrictMode duplicates)
      if (!hasInitialized.current) {
        hasInitialized.current = true;

        if (loadedSessions.length > 0) {
          const firstSession = loadedSessions[0];
          setCurrentSession(firstSession);
          options.onSessionChange?.(firstSession);

          // Fire async init if session doesn't have a copilotSessionId
          if (!firstSession.copilotSessionId) {
            const workDir = await window.jarvis.getWorkDir();
            setCopilotReadiness("initializing");
            // Fire and forget — result comes via push event
            window.jarvis.initialize(workDir, undefined, undefined, firstSession.id);
          }
        } else {
          // No sessions exist - let the persona selection flow create it
          setCurrentSession(null);
        }
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);

      if (!hasInitialized.current) {
        hasInitialized.current = true;
        setCurrentSession(null);
        setSessions([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Save current session
  const saveCurrentSession = useCallback(async () => {
    if (!currentSession) return;

    try {
      // Update session title if it's still "New Chat" and has messages
      if (
        currentSession.title === "New Chat" &&
        currentSession.messages.length > 0
      ) {
        currentSession.title = SessionStorage.generateTitle(
          currentSession.messages,
          currentSession.personaId
        );
      }

      currentSession.updatedAt = Date.now();
      await SessionStorage.saveSession(currentSession);

      // Refresh session list
      await loadAllSessions();
    } catch (error) {
      console.error("Failed to save session:", error);
    }
  }, [currentSession]);

  // Add message to current session
  const addMessage = useCallback(
    async (message: Message) => {
      if (!currentSession) return;

      const updatedSession = {
        ...currentSession,
        messages: [...currentSession.messages, message],
        updatedAt: Date.now(),
      };

      setCurrentSession(updatedSession);

      // Update title if first message
      if (updatedSession.messages.length === 1) {
        updatedSession.title = SessionStorage.generateTitle(
          updatedSession.messages,
          updatedSession.personaId
        );
      }

      // Save to storage
      await SessionStorage.saveSession(updatedSession);
      await loadAllSessions();
    },
    [currentSession]
  );

  // Update messages in current session
  const setMessages = useCallback(
    async (messages: Message[]) => {
      if (!currentSession) return;

      const updatedSession = {
        ...currentSession,
        messages,
        updatedAt: Date.now(),
      };

      setCurrentSession(updatedSession);

      // Update title if messages changed
      if (messages.length > 0 && currentSession.title === "New Chat") {
        updatedSession.title = SessionStorage.generateTitle(messages, currentSession.personaId);
      }

      // Save to storage
      await SessionStorage.saveSession(updatedSession);
    },
    [currentSession]
  );

  // Create new session (non-blocking — fires Copilot init asynchronously)
  const createNewSession = useCallback(async (personaId?: string) => {
    // personaId param kept for backward compat but ignored
    setIsCreatingSession(true);
    try {
      // Save current session before creating new one
      if (currentSession && currentSession.messages.length > 0) {
        await saveCurrentSession();
      }

      // Create UI session
      const newSession = SessionStorage.createNewSession("New Chat", personaId);

      // Update UI immediately — don't wait for Copilot
      setCurrentSession(newSession);
      setCopilotReadiness("initializing");
      setCopilotError(null);

      // Save the new session immediately so it appears in the list
      await SessionStorage.saveSession(newSession);
      await loadAllSessions();

      options.onSessionChange?.(newSession);

      // Fire Copilot initialization asynchronously (result comes via push events)
      const workDir = await window.jarvis.getWorkDir();
      window.jarvis.initialize(workDir, undefined, undefined, newSession.id);
    } finally {
      setIsCreatingSession(false);
    }
  }, [currentSession, saveCurrentSession, options]);

  // Switch to a different session (non-blocking)
  const switchSession = useCallback(
    async (sessionId: string) => {
      setIsSwitchingSession(true);
      setSwitchingToSessionId(sessionId);

      try {
        // Save current session first
        if (currentSession && currentSession.messages.length > 0) {
          await saveCurrentSession();
        }

        const session = await SessionStorage.loadSession(sessionId);
        if (session) {
          // Update UI immediately — show messages right away
          setCurrentSession(session);
          setCopilotReadiness("initializing");
          setCopilotError(null);
          options.onSessionChange?.(session);

          // Fire Copilot initialization asynchronously
          const workDir = await window.jarvis.getWorkDir();
          window.jarvis.initialize(
            workDir,
            undefined,
            session.copilotSessionId, // Resume existing if available
            session.id
          );
        }
      } catch (error) {
        console.error("Failed to switch session:", error);
      } finally {
        setIsSwitchingSession(false);
        setSwitchingToSessionId(null);
      }
    },
    [currentSession, saveCurrentSession, options]
  );

  // Delete a session
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const session = await SessionStorage.loadSession(sessionId);

        // Delete Copilot session if it exists
        if (session?.copilotSessionId) {
          try {
            await window.jarvis.copilot.deleteSession(session.copilotSessionId);
          } catch (err) {
            console.error("[useSession] Failed to delete Copilot session:", err);
          }
        }

        // Delete UI session
        await SessionStorage.deleteSession(sessionId);

        // If deleting current session, create a new one
        if (currentSession?.id === sessionId) {
          await createNewSession();
        } else {
          await loadAllSessions();
        }
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    },
    [currentSession, createNewSession]
  );

  // Update execution data for manual testing persona
  const updateExecutionData = useCallback(
    async (executionData: Partial<ExecutionData>) => {
      if (!currentSession) {
        console.error("[useSession] Cannot update execution data: no current session");
        return;
      }

      const updatedSession = {
        ...currentSession,
        executionData: {
          ...currentSession.executionData,
          ...executionData,
          logs: executionData.logs || currentSession.executionData?.logs || [],
        } as ExecutionData,
        updatedAt: Date.now(),
      };

      // Update title from test input if available and title is still "New Chat"
      if (updatedSession.title === "New Chat" && executionData.testInput) {
        const lines = executionData.testInput.split('\n').filter(l => l.trim());
        const firstStep = lines[0]?.trim() || executionData.testInput;
        const title = firstStep.slice(0, 40);
        updatedSession.title = title.length < firstStep.length ? `${title}...` : title;
      }

      setCurrentSession(updatedSession);

      // Save to storage
      await SessionStorage.saveSession(updatedSession);

      // Reload all sessions to update the sidebar
      await loadAllSessions();
    },
    [currentSession, loadAllSessions]
  );

  // Listen for usage updates and accumulate metrics
  useEffect(() => {
    const unsubscribe = window.jarvis.onUsageUpdate((usageData) => {
      if (!currentSession) {
        return;
      }

      // Accumulate usage metrics
      const existing = currentSession.usageMetadata || {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCachedTokens: 0,
        totalDuration: 0,
        modelBreakdown: {},
        lastUpdated: Date.now(),
      };

      const model = usageData.model || 'unknown';
      const modelData = existing.modelBreakdown[model] || {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      };

      modelData.inputTokens += usageData.inputTokens || 0;
      modelData.outputTokens += usageData.outputTokens || 0;
      modelData.cachedTokens += usageData.cacheReadTokens || 0;
      if (usageData.cost) {
        modelData.cost = (modelData.cost || 0) + usageData.cost;
      }

      existing.modelBreakdown[model] = modelData;
      existing.totalInputTokens += usageData.inputTokens || 0;
      existing.totalOutputTokens += usageData.outputTokens || 0;
      existing.totalCachedTokens += usageData.cacheReadTokens || 0;
      existing.totalDuration += usageData.duration || 0;
      if (usageData.cost) {
        existing.totalCost = (existing.totalCost || 0) + usageData.cost;
      }
      existing.lastUpdated = Date.now();

      // Extract premium request info from quotaSnapshots
      if (usageData.quotaSnapshots) {
        const quotaValues = Object.values(usageData.quotaSnapshots);
        const premiumQuota = quotaValues.find(
          (q: any) => q.entitlementRequests > 0
        ) as any;
        if (premiumQuota) {
          existing.premiumRequests = premiumQuota.usedRequests;
        }
      }

      // Update session with new usage data
      const updatedSession = {
        ...currentSession,
        usageMetadata: existing,
        updatedAt: Date.now(),
      };

      setCurrentSession(updatedSession);

      // Save session (throttled to avoid too many writes)
      saveCurrentSession();
    });

    return () => {
      unsubscribe();
    };
  }, [currentSession, saveCurrentSession]);

  // Retry Copilot connection for current session
  const retryConnection = useCallback(async () => {
    if (!currentSession) return;
    setCopilotReadiness("initializing");
    setCopilotError(null);
    const workDir = await window.jarvis.getWorkDir();
    window.jarvis.initialize(
      workDir,
      undefined,
      currentSession.copilotSessionId,
      currentSession.id
    );
  }, [currentSession]);

  return {
    sessions,
    currentSession,
    isLoading,
    isCreatingSession,
    isSwitchingSession,
    switchingToSessionId,
    copilotReadiness,
    copilotError,
    addMessage,
    setMessages,
    createNewSession,
    switchSession,
    deleteSession,
    saveCurrentSession,
    updateExecutionData,
    retryConnection,
  };
}
