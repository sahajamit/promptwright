import { useState, useEffect, useCallback, useRef } from "react";
import type { ExecutionMessage } from "../components/execution/types";
import type { ExecutionUsageMetadata } from "../types";

/**
 * Test execution state machine status
 */
export type TestExecutionStatus = "idle" | "executing" | "completed" | "error";

/**
 * Test execution state
 */
export interface TestExecutionState {
  status: TestExecutionStatus;
  testInput: string;
  executionMessages: ExecutionMessage[];
  error: string | null;
  startTime: number | null;
  elapsedTime: number;
  recordingPath: string | null;
  usageMetadata: ExecutionUsageMetadata | null;
}

/**
 * Return type for useTestExecution hook
 */
export interface UseTestExecutionReturn {
  /** Current execution state */
  state: TestExecutionState;
  /** Start test execution with given test steps */
  runTest: (testSteps: string, options?: { skipRecording?: boolean }) => Promise<void>;
  /** Send a follow-up message on the existing session */
  sendFollowup: (message: string) => Promise<void>;
  /** Cancel ongoing execution */
  cancelExecution: () => void;
  /** Reset to idle state */
  reset: () => void;
}

/**
 * Initial state for test execution
 */
const initialState: TestExecutionState = {
  status: "idle",
  testInput: "",
  executionMessages: [],
  error: null,
  startTime: null,
  elapsedTime: 0,
  recordingPath: null,
  usageMetadata: null,
};

/**
 * Hook for managing test execution with simplified state machine
 * 
 * States:
 * - idle: Ready to start a new test
 * - executing: AI is executing test steps via Playwright
 * - completed: Test finished with verdict
 * - error: Something went wrong
 */
export function useTestExecution(): UseTestExecutionReturn {
  const [state, setState] = useState<TestExecutionState>(initialState);
  const abortedRef = useRef<boolean>(false);
  const executionCompleteRef = useRef<boolean>(false);
  const currentMessageContentRef = useRef<string>("");
  const currentMessageAgentRef = useRef<{ agentName?: string; agentDisplayName?: string; agentTag?: string }>({});
  const recordingStartedRef = useRef<boolean>(false);
  const turnNumberRef = useRef<number>(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const executionUsageRef = useRef<ExecutionUsageMetadata>({
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalDuration: 0,
    modelBreakdown: {},
  });

  /**
   * Start the elapsed time timer
   */
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setState((prev) => ({
        ...prev,
        elapsedTime: elapsed,
      }));
    }, 100);
  }, []);

  /**
   * Stop the elapsed time timer
   */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Handle Jarvis events during execution
   */
  useEffect(() => {
    const handleEvent = async (event: any) => {
      // Handle session_idle - signal that execution is complete
      if (event.type === "session_idle") {
        const idleAgentName = (event as any)._agentName;
        // Sub-agent completed its own turn — not the full execution. Skip.
        if (idleAgentName && idleAgentName !== "orchestrator") {
          return;
        }
        if (!abortedRef.current && !executionCompleteRef.current && state.status === "executing") {
          executionCompleteRef.current = true;
          stopTimer();

          // Stop execution recording only if it was started
          if (recordingStartedRef.current) {
            try {
              const result = await window.jarvis.execution.stopRecording();
              setState((prev) => ({
                ...prev,
                status: "completed",
                recordingPath: result.path,
                usageMetadata: executionUsageRef.current,
              }));
            } catch (error) {
              console.error("[useTestExecution] Failed to stop recording:", error);
              setState((prev) => ({
                ...prev,
                status: "completed",
                usageMetadata: executionUsageRef.current,
              }));
            }
          } else {
            // No recording was started (e.g., API tests) — just complete
            setState((prev) => ({
              ...prev,
              status: "completed",
              usageMetadata: executionUsageRef.current,
            }));
          }
        }
        return;
      }
      
      // Handle errors
      if (event.type === "session_error" || event.type === "error") {
        if (!abortedRef.current && !executionCompleteRef.current) {
          executionCompleteRef.current = true;
          stopTimer();

          // Try to stop recording on error (only if started)
          if (recordingStartedRef.current) {
            try {
              await window.jarvis.execution.cancelRecording();
            } catch (err) {
              console.error("[useTestExecution] Failed to cancel recording:", err);
            }
          }
          
          setState((prev) => ({
            ...prev,
            status: "error",
            error: event.error || event.message || "An error occurred during execution",
          }));
        }
        return;
      }
      
      // Only process message events when we're in executing state
      if (state.status !== "executing") {
        return;
      }

      switch (event.type) {
        case "message_delta":
          // Accumulate message content and track agent attribution
          const deltaContent = event.content || "";
          currentMessageContentRef.current += deltaContent;
          // Capture agent info from the first delta of this message
          if (!currentMessageAgentRef.current.agentName && (event as any)._agentName) {
            currentMessageAgentRef.current = {
              agentName: (event as any)._agentName,
              agentDisplayName: (event as any)._agentDisplayName,
              agentTag: (event as any)._agentTag,
            };
          }
          break;

        case "message_complete":
          // Finalize the message
          const fullContent = currentMessageContentRef.current || event.content || "";

          if (fullContent.trim()) {
            // Check if this is a verdict message
            const isVerdictPass = /(\*\*)?TEST\s+PASSED(\*\*)?:/i.test(fullContent);
            const isVerdictFail = /(\*\*)?TEST\s+FAILED(\*\*)?:/i.test(fullContent);
            const isVerdict = isVerdictPass || isVerdictFail;

            const newMessage: ExecutionMessage = {
              id: event.id || `msg-${Date.now()}`,
              content: fullContent,
              timestamp: Date.now(),
              isVerdict,
              verdictType: isVerdictPass ? "pass" : isVerdictFail ? "fail" : undefined,
              turnNumber: turnNumberRef.current,
              agentName: currentMessageAgentRef.current.agentName || (event as any)._agentName,
              agentDisplayName: currentMessageAgentRef.current.agentDisplayName || (event as any)._agentDisplayName,
              agentTag: currentMessageAgentRef.current.agentTag || (event as any)._agentTag,
            };

            setState((prev) => ({
              ...prev,
              executionMessages: [...prev.executionMessages, newMessage],
            }));
          }

          // Reset accumulated content and agent tracking
          currentMessageContentRef.current = "";
          currentMessageAgentRef.current = {};
          break;

        case "tool_start": {
          const rawArgs = event.args || event.input || "";
          const toolMessage: ExecutionMessage = {
            id: event.toolCallId || `tool-start-${Date.now()}`,
            content: "",
            timestamp: Date.now(),
            isToolCall: true,
            toolName: event.toolName || event.tool || "tool",
            toolArgs: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs, null, 2),
            turnNumber: turnNumberRef.current,
            agentName: (event as any)._agentName,
            agentDisplayName: (event as any)._agentDisplayName,
            agentTag: (event as any)._agentTag,
          };
          setState((prev) => ({
            ...prev,
            executionMessages: [...prev.executionMessages, toolMessage],
          }));
          break;
        }

        case "tool_complete": {
          const resultMessage: ExecutionMessage = {
            id: event.toolCallId ? `${event.toolCallId}-result` : `tool-result-${Date.now()}`,
            content: "",
            timestamp: Date.now(),
            isToolResult: true,
            toolName: event.toolName || event.tool || "tool",
            toolArgs: typeof event.result === "string" ? event.result : JSON.stringify(event.result, null, 2),
            turnNumber: turnNumberRef.current,
            agentName: (event as any)._agentName,
            agentDisplayName: (event as any)._agentDisplayName,
            agentTag: (event as any)._agentTag,
          };
          setState((prev) => ({
            ...prev,
            executionMessages: [...prev.executionMessages, resultMessage],
          }));
          break;
        }

        case "thinking":
        case "reasoning_delta":
          // Ignore thinking events - not displayed in execution log
          break;
      }
    };

    const unsubscribe = window.jarvis.onEvent(handleEvent);
    return unsubscribe;
  }, [state.status, stopTimer]);

  /**
   * Track usage updates during execution
   */
  useEffect(() => {
    const unsubscribe = window.jarvis.onUsageUpdate((usageData) => {
      // Only track usage during execution
      if (state.status !== "executing") return;

      const usage = executionUsageRef.current;
      const model = usageData.model || 'unknown';

      // Update model breakdown
      if (!usage.modelBreakdown[model]) {
        usage.modelBreakdown[model] = {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
        };
      }

      const modelData = usage.modelBreakdown[model];
      modelData.inputTokens += usageData.inputTokens || 0;
      modelData.outputTokens += usageData.outputTokens || 0;
      modelData.cachedTokens += usageData.cacheReadTokens || 0;
      if (usageData.cost) {
        modelData.cost = (modelData.cost || 0) + usageData.cost;
      }

      // Update totals
      usage.totalInputTokens += usageData.inputTokens || 0;
      usage.totalOutputTokens += usageData.outputTokens || 0;
      usage.totalCachedTokens += usageData.cacheReadTokens || 0;
      usage.totalDuration += usageData.duration || 0;
      if (usageData.cost) {
        usage.totalCost = (usage.totalCost || 0) + usageData.cost;
      }

      // Extract premium request info from quotaSnapshots
      if (usageData.quotaSnapshots) {
        const quotaValues = Object.values(usageData.quotaSnapshots);
        const premiumQuota = quotaValues.find(
          (q: any) => q.entitlementRequests > 0
        ) as any;
        if (premiumQuota) {
          usage.premiumRequests = premiumQuota.usedRequests;
        }
      }
    });

    return unsubscribe;
  }, [state.status]);

  /**
   * Run a test with the given steps
   */
  const runTest = useCallback(async (testSteps: string, options?: { skipRecording?: boolean }) => {
    abortedRef.current = false;
    executionCompleteRef.current = false;
    currentMessageContentRef.current = "";
    currentMessageAgentRef.current = {};
    recordingStartedRef.current = false;
    turnNumberRef.current = 1;

    // Reset usage tracking for new execution
    executionUsageRef.current = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalDuration: 0,
      modelBreakdown: {},
    };

    setState({
      status: "executing",
      testInput: testSteps,
      executionMessages: [],
      error: null,
      startTime: Date.now(),
      elapsedTime: 0,
      recordingPath: null,
    });

    startTimer();

    try {
      // Start execution recording (skip for API tests — no browser needed)
      if (!options?.skipRecording) {
        try {
          await window.jarvis.execution.startRecording();
          recordingStartedRef.current = true;
        } catch (error) {
          console.error("[useTestExecution] Failed to start recording:", error);
          // Continue execution even if recording fails
        }
      }

      // Send the test steps to JARVIS for execution
      // NOTE: sendMessage returns immediately - completion is signaled via session_idle event
      await window.jarvis.sendMessage(testSteps);
    } catch (error) {
      if (!abortedRef.current) {
        executionCompleteRef.current = true;
        stopTimer();

        // Try to cancel recording on error (only if started)
        if (recordingStartedRef.current) {
          try {
            await window.jarvis.execution.cancelRecording();
          } catch (err) {
            console.error("[useTestExecution] Failed to cancel recording:", err);
          }
        }

        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "Failed to execute test",
        }));
      }
    }
  }, [startTimer, stopTimer]);

  /**
   * Cancel ongoing execution
   */
  const cancelExecution = useCallback(async () => {
    abortedRef.current = true;
    stopTimer();

    try {
      await window.jarvis.abort();
    } catch (e) {
      console.error("[useTestExecution] Failed to abort:", e);
    }

    // Cancel recording and close browser only if recording was started
    if (recordingStartedRef.current) {
      try {
        await window.jarvis.execution.cancelRecording();
      } catch (e) {
        console.error("[useTestExecution] Failed to cancel recording:", e);
      }

      try {
        await window.jarvis.execution.closeBrowser();
      } catch (e) {
        console.error("[useTestExecution] Failed to close browser:", e);
      }
    }

    setState({
      ...initialState,
      error: "Execution cancelled by user",
    });
  }, [stopTimer]);

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    stopTimer();
    abortedRef.current = false;
    executionCompleteRef.current = false;
    currentMessageContentRef.current = "";
    currentMessageAgentRef.current = {};
    recordingStartedRef.current = false;
    turnNumberRef.current = 1;
    setState(initialState);
  }, [stopTimer]);

  /**
   * Send a follow-up message on the existing Copilot session
   * Keeps all previous messages and context intact
   */
  const sendFollowup = useCallback(async (message: string) => {
    if (!message.trim()) return;

    turnNumberRef.current += 1;
    const currentTurn = turnNumberRef.current;

    // Add a turn separator message so the UI can render a visual divider
    const separatorMessage: ExecutionMessage = {
      id: `turn-sep-${currentTurn}-${Date.now()}`,
      content: message,
      timestamp: Date.now(),
      isTurnSeparator: true,
      turnNumber: currentTurn,
    };

    setState((prev) => ({
      ...prev,
      status: "executing",
      executionMessages: [...prev.executionMessages, separatorMessage],
    }));

    // Reset completion flags for the new turn
    executionCompleteRef.current = false;
    abortedRef.current = false;
    currentMessageContentRef.current = "";
    currentMessageAgentRef.current = {};

    startTimer();

    try {
      // Send follow-up on the same Copilot session — full context is preserved
      await window.jarvis.sendMessage(message);
    } catch (error) {
      if (!abortedRef.current) {
        executionCompleteRef.current = true;
        stopTimer();
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "Failed to send follow-up",
        }));
      }
    }
  }, [startTimer, stopTimer]);

  // Check for Playwright MCP tool availability (Windows debugging)
  useEffect(() => {
    const checkPlaywrightTools = () => {
      const logs = state.executionMessages || [];
      const toolCalls = logs.filter(log => log.type === 'tool');
      
      if (toolCalls.length > 0) {
        const hasPlaywrightTools = toolCalls.some(log => 
          log.toolName?.startsWith('playwright_')
        );
        const hasBashFallback = toolCalls.some(log => 
          log.toolName === 'bash'
        );
        
        if (!hasPlaywrightTools && hasBashFallback) {
          console.error('[JARVIS] ⚠️⚠️⚠️ PLAYWRIGHT MCP NOT AVAILABLE ⚠️⚠️⚠️');
          console.error('[JARVIS] LLM is using bash fallback instead of Playwright browser automation');
          console.error('[JARVIS] This means MCP server failed to start or connect');
          console.error('[JARVIS] Check main Electron console for [JARVIS MCP] error messages');
          
          if (navigator.platform.indexOf('Win') !== -1) {
            console.error('[JARVIS WINDOWS] Common Windows issues:');
            console.error('[JARVIS WINDOWS]   1. MCP CLI path resolution failed');
            console.error('[JARVIS WINDOWS]   2. ASAR archive reading issue');
            console.error('[JARVIS WINDOWS]   3. Process spawning with ELECTRON_RUN_AS_NODE failed');
            console.error('[JARVIS WINDOWS] See Electron DevTools Console for detailed errors');
          }
        } else if (hasPlaywrightTools) {
          console.log('[JARVIS] ✓ Playwright MCP tools detected - browser automation working!');
        }
      }
    };
    
    // Check after first few tool calls
    if (state.executionMessages && state.executionMessages.length > 2) {
      checkPlaywrightTools();
    }
  }, [state.executionMessages]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    state,
    runTest,
    sendFollowup,
    cancelExecution,
    reset,
  };
}
