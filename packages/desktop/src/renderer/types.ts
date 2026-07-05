/**
 * Chat message structure
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/**
 * Recorded action for display
 */
export interface RecordedActionLog {
  type: string;
  timestamp: number;
  target?: {
    tagName: string;
    textContent?: string;
    locators?: {
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
 * Activity log entry
 */
export interface LogEntry {
  id: string;
  type: "tool" | "thinking" | "info" | "error" | "recording" | "prompt";
  content: string;
  timestamp: number;
  status?: "running" | "completed" | "failed";
  toolName?: string;
  toolArgs?: string; // Tool arguments as JSON string
  toolResult?: string; // Tool result
  // Recording-specific fields
  recordedActions?: RecordedActionLog[];
  sessionInfo?: {
    id: string;
    startUrl: string;
    mode: string;
    startTime: number;
    endTime?: number;
  };
  tempFilePath?: string; // Temp file path for debugging
  // Prompt-specific fields
  systemPrompt?: string; // Full system prompt sent to LLM
  userPrompt?: string; // User's test input
  /** Model used for this prompt (for transparency) */
  modelUsed?: string;
  // Agent attribution fields (optional, for orchestrator architecture)
  agentName?: string;
  agentDisplayName?: string;
  agentTag?: string;
  agentCategory?: string;
}


/**
 * Execution usage metadata (for a single execution)
 */
export interface ExecutionUsageMetadata {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalDuration: number; // milliseconds
  totalCost?: number;
  modelBreakdown: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cost?: number;
    };
  };
  premiumRequests?: number;
}

/**
 * Execution data for manual testing persona sessions
 */
export interface ExecutionData {
  /** Activity logs from test execution */
  logs: LogEntry[];
  /** Path to the recording file (webm/html) */
  recordingPath?: string;
  /** Original user test steps input */
  testInput?: string;
  /** Final execution status */
  status?: 'completed' | 'failed' | 'cancelled';
  /** Usage metrics for this specific execution */
  usageMetadata?: ExecutionUsageMetadata;
  /** Test type: web UI test or API test */
  testType?: 'web' | 'api';
  /** Full execution messages preserving all metadata (tool calls, verdicts, turns).
   *  Used for accurate rendering of historical sessions. */
  executionMessages?: Array<{
    id: string;
    content: string;
    timestamp: number;
    isVerdict?: boolean;
    verdictType?: 'pass' | 'fail';
    isToolCall?: boolean;
    toolName?: string;
    toolArgs?: string;
    isToolResult?: boolean;
    turnNumber?: number;
    isTurnSeparator?: boolean;
    agentName?: string;
    agentDisplayName?: string;
    agentTag?: string;
  }>;
  /** Raw execution messages for API tests (preserves tool calls, verdicts, turns) */
  apiMessages?: Array<{
    id: string;
    content: string;
    timestamp: number;
    isVerdict?: boolean;
    verdictType?: 'pass' | 'fail';
    isToolCall?: boolean;
    toolName?: string;
    toolArgs?: string;
    isToolResult?: boolean;
    turnNumber?: number;
    isTurnSeparator?: boolean;
    agentName?: string;
    agentDisplayName?: string;
    agentTag?: string;
  }>;
}

/**
 * Session usage metadata
 */
export interface SessionUsageMetadata {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalDuration: number; // milliseconds
  totalCost?: number;
  modelBreakdown: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cost?: number;
    };
  };
  premiumRequests?: number;
  lastUpdated: number;
}

/**
 * Thread/conversation structure for persistence
 */
export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  personaId?: string; // Optional for backwards compatibility
  /** Execution metadata for manual testing persona */
  executionData?: ExecutionData;
  /** Copilot session ID for resuming session */
  copilotSessionId?: string;
  /** Usage tracking metadata */
  usageMetadata?: SessionUsageMetadata;
}

/**
 * Execution step status
 */
export type ExecutionStepStatus = "passed" | "failed" | "skipped" | "running";

/**
 * Individual test execution step
 */
export interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  status: ExecutionStepStatus;
  timestamp: number;
  duration?: number;
  error?: string;
  url?: string;
}

/**
 * Overall execution report status
 */
export type ExecutionReportStatus = "passed" | "failed" | "running";

/**
 * Complete execution report for a test case
 */
export interface ExecutionReport {
  id: string;
  testName: string;
  status: ExecutionReportStatus;
  startTime: number;
  endTime?: number;
  steps: ExecutionStep[];
  summary?: string;
}
