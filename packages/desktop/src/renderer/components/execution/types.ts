/**
 * Shared types for the execution workspace.
 *
 * ExecutionMessage is the normalized shape the execution UI renders — produced
 * by useTestExecution from the raw jarvis events. It previously lived in the
 * now-removed LiveExecutionLog component.
 */
export interface ExecutionMessage {
  id: string;
  content: string;
  timestamp: number;
  isVerdict?: boolean;
  verdictType?: "pass" | "fail";
  // Tool call tracking
  isToolCall?: boolean;
  toolName?: string;
  toolArgs?: string;
  isToolResult?: boolean;
  // Conversation turn tracking
  turnNumber?: number;
  isTurnSeparator?: boolean;
  // Agent attribution (orchestrator architecture)
  agentName?: string;        // e.g. "pw-mcp-agent", "orchestrator"
  agentDisplayName?: string; // e.g. "PW MCP Agent", "Orchestrator"
  agentTag?: string;         // e.g. "PW MCP", "Orca" — exact badge label from agent definition
}
