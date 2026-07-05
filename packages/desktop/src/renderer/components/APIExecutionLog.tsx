import { Activity, ArrowDown, CheckCircle2, ChevronDown, ChevronRight, Download, Loader2, Plus, RotateCw, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExecutionMessage } from "./execution/types";
import type { ExecutionUsageMetadata } from "../types";

interface APIExecutionLogProps {
  messages: ExecutionMessage[];
  isExecuting: boolean;
  testInput: string;
  usageMetadata: ExecutionUsageMetadata | null;
  onCancel: () => void;
  onRunAgain: () => void;
  onNewTest: () => void;
  onSendFollowup?: (message: string) => void;
  onExportHtml?: () => void;
}

// --- Grouping helper ---

interface InteractionGroup {
  turnNumber: number;
  instruction: string;
  logMessages: ExecutionMessage[];
  verdict: ExecutionMessage | null;
}

/**
 * Group flat ExecutionMessage[] into per-turn InteractionGroups.
 * Turn 1 instruction comes from the testInput prop.
 * Turn 2+ instruction comes from the isTurnSeparator message's content.
 */
function groupMessagesByTurn(messages: ExecutionMessage[], testInput: string): InteractionGroup[] {
  const groups: Map<number, InteractionGroup> = new Map();

  // Ensure turn 1 always exists when there are messages
  if (messages.length > 0 || testInput) {
    groups.set(1, { turnNumber: 1, instruction: testInput, logMessages: [], verdict: null });
  }

  for (const msg of messages) {
    const turn = msg.turnNumber ?? 1;

    if (!groups.has(turn)) {
      groups.set(turn, { turnNumber: turn, instruction: "", logMessages: [], verdict: null });
    }
    const group = groups.get(turn)!;

    if (msg.isTurnSeparator) {
      group.instruction = msg.content;
    } else if (msg.isVerdict) {
      group.verdict = msg;
    } else {
      group.logMessages.push(msg);
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.turnNumber - b.turnNumber);
}

/**
 * Try to detect and pretty-print JSON strings
 */
function tryFormatJson(text: string): { isJson: boolean; formatted: string } {
  const trimmed = text.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed);
      return { isJson: true, formatted: JSON.stringify(parsed, null, 2) };
    } catch {
      // Not valid JSON
    }
  }
  return { isJson: false, formatted: text };
}

export function APIExecutionLog({
  messages,
  isExecuting,
  testInput,
  usageMetadata,
  onCancel,
  onRunAgain,
  onNewTest,
  onSendFollowup,
  onExportHtml,
}: APIExecutionLogProps) {
  const logsScrollRef = useRef<HTMLDivElement>(null);
  const followupInputRef = useRef<HTMLTextAreaElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [followupInput, setFollowupInput] = useState("");
  const [showActions, setShowActions] = useState(false);
  // Per-turn expand/collapse state
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set([1]));
  // Track which tool results are collapsed (by message id)
  const [collapsedResults, setCollapsedResults] = useState<Set<string>>(new Set());

  // Group messages by turn
  const groups = useMemo(() => groupMessagesByTurn(messages, testInput), [messages, testInput]);

  // Find the highest turn number (active turn)
  const activeTurnNumber = useMemo(() => {
    if (groups.length === 0) return 1;
    return Math.max(...groups.map((g) => g.turnNumber));
  }, [groups]);

  // Auto-expand/collapse logic
  useEffect(() => {
    if (isExecuting) {
      // During execution: expand only the active turn
      setExpandedTurns(new Set([activeTurnNumber]));
    } else if (messages.length > 0) {
      // On completion: collapse all turns
      setExpandedTurns(new Set());
    }
  }, [isExecuting, activeTurnNumber, messages.length > 0]);

  // Auto-scroll
  useEffect(() => {
    if (logsScrollRef.current && !isUserScrolling) {
      logsScrollRef.current.scrollTo({
        top: logsScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isUserScrolling]);

  useEffect(() => {
    if (isExecuting) setIsUserScrolling(false);
  }, [isExecuting]);

  // Auto-focus follow-up input when execution completes
  useEffect(() => {
    if (!isExecuting && messages.length > 0 && followupInputRef.current) {
      followupInputRef.current.focus();
    }
  }, [isExecuting, messages.length]);

  const handleScroll = () => {
    if (!logsScrollRef.current || !isExecuting) return;
    const { scrollTop, scrollHeight, clientHeight } = logsScrollRef.current;
    setIsUserScrolling(scrollHeight - scrollTop - clientHeight > 50);
  };

  const scrollToBottom = () => {
    if (logsScrollRef.current) {
      logsScrollRef.current.scrollTo({ top: logsScrollRef.current.scrollHeight, behavior: "smooth" });
      setIsUserScrolling(false);
    }
  };

  const handleFollowupSubmit = () => {
    if (followupInput.trim() && onSendFollowup) {
      onSendFollowup(followupInput.trim());
      setFollowupInput("");
    }
  };

  const handleFollowupKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFollowupSubmit();
    }
  };

  const toggleTurnExpanded = (turnNumber: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnNumber)) {
        next.delete(turnNumber);
      } else {
        next.add(turnNumber);
      }
      return next;
    });
  };

  const toggleResultCollapsed = (id: string) => {
    setCollapsedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTimestamp = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  // --- Render individual message types ---

  const renderToolCall = (message: ExecutionMessage) => (
    <div key={message.id} className="mb-2 animate-fade-in">
      <div className="rounded-lg border border-accent overflow-hidden">
        <div className="px-3 py-1.5 bg-accent/10 border-b border-accent flex items-center gap-2">
          <Activity size={12} className="text-lseg-blue" />
          <span className="text-xs font-medium text-lseg-blue">{message.toolName}</span>
          <span className="text-xs text-text-muted ml-auto">{formatTimestamp(message.timestamp)}</span>
        </div>
        {message.toolArgs && (
          <pre className="px-3 py-2 text-xs text-text-muted font-mono whitespace-pre-wrap overflow-x-auto bg-surface-2">
            <span className="text-lseg-blue">$ </span>{message.toolArgs}
          </pre>
        )}
      </div>
    </div>
  );

  const renderToolResult = (message: ExecutionMessage) => {
    if (!message.toolArgs) return null;
    const { isJson, formatted } = tryFormatJson(message.toolArgs);
    const lineCount = formatted.split("\n").length;
    const isLong = lineCount > 20;

    const isCollapsed = isLong && !collapsedResults.has(message.id)
      ? true
      : collapsedResults.has(message.id);

    const displayContent = isCollapsed ? formatted.split("\n").slice(0, 15).join("\n") + "\n..." : formatted;

    return (
      <div key={message.id} className="mb-2 animate-fade-in">
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => isLong && toggleResultCollapsed(message.id)}
            className={`w-full px-3 py-1.5 bg-surface-2 border-b border-border flex items-center gap-2 text-left ${isLong ? "cursor-pointer hover:bg-surface-2" : "cursor-default"}`}
          >
            <span className="text-xs font-medium text-text-muted">Response</span>
            {isLong && (
              <span className="text-xs text-text-muted ml-auto">
                {isCollapsed ? `${lineCount} lines — click to expand` : "click to collapse"}
              </span>
            )}
          </button>
          <pre className={`px-3 py-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-surface-2 ${isJson ? "text-accent" : "text-text-muted"}`}>
            {displayContent}
          </pre>
        </div>
      </div>
    );
  };

  const renderRegularMessage = (message: ExecutionMessage) => (
    <div key={message.id} className="mb-2 animate-fade-in">
      <span className="text-xs text-text-muted mr-2">{formatTimestamp(message.timestamp)}</span>
      <div className="text-text mt-1 api-log-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </div>
  );

  const renderLogMessage = (message: ExecutionMessage) => {
    if (message.isToolCall) return renderToolCall(message);
    if (message.isToolResult) return renderToolResult(message);
    return renderRegularMessage(message);
  };

  // --- Render verdict ---

  const renderVerdict = (verdict: ExecutionMessage) => {
    const isPass = verdict.verdictType === "pass";
    return (
      <div
        className={`p-4 rounded-lg border ${
          isPass
            ? "bg-success/10 border-success/30"
            : "bg-danger/10 border-danger/30"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          {isPass ? (
            <CheckCircle2 size={16} className="text-success" />
          ) : (
            <XCircle size={16} className="text-danger" />
          )}
          <span className={`font-bold text-sm ${isPass ? "text-success" : "text-danger"}`}>
            {isPass ? "TEST PASSED" : "TEST FAILED"}
          </span>
          <span className="text-xs text-text-muted ml-auto">{formatTimestamp(verdict.timestamp)}</span>
        </div>
        <div className={`text-sm api-log-prose ${isPass ? "text-success" : "text-danger"}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{verdict.content}</ReactMarkdown>
        </div>
      </div>
    );
  };

  // --- Render interaction card ---

  const renderInteractionCard = (group: InteractionGroup) => {
    const isExpanded = expandedTurns.has(group.turnNumber);
    const isActive = isExecuting && group.turnNumber === activeTurnNumber;
    const label = group.turnNumber === 1 ? "Test Instructions" : `Follow-up #${group.turnNumber}`;

    return (
      <div key={`group-${group.turnNumber}`} className="mb-4 rounded-xl border border-border bg-surface-2 shadow-sm overflow-hidden animate-fade-in">
        {/* Instruction Header */}
        <div className="px-4 py-3 bg-surface-2 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-lseg-blue uppercase tracking-wider">{label}</span>
          </div>
          <p className="text-sm text-text whitespace-pre-wrap">{group.instruction}</p>
        </div>

        {/* Collapsible Execution Logs */}
        {group.logMessages.length > 0 && (
          <div className="border-b border-border">
            <button
              type="button"
              onClick={() => toggleTurnExpanded(group.turnNumber)}
              className="w-full px-4 py-2 flex items-center gap-2 hover:bg-surface-2 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown size={14} className="text-text-muted" />
              ) : (
                <ChevronRight size={14} className="text-text-muted" />
              )}
              <span className="text-xs font-medium text-text-muted">
                Execution Logs
              </span>
              <span className="text-xs text-text-muted">
                ({group.logMessages.length} {group.logMessages.length === 1 ? "item" : "items"})
              </span>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3">
                {group.logMessages.map(renderLogMessage)}
              </div>
            )}
          </div>
        )}

        {/* Loading indicator for active turn */}
        {isActive && !group.verdict && (
          <div className="px-4 py-3 bg-accent/10 border-b border-accent flex items-center gap-2">
            <Loader2 size={14} className="text-lseg-blue animate-spin" />
            <span className="text-sm text-lseg-blue font-medium">Executing...</span>
          </div>
        )}

        {/* Verdict — always visible, outside collapsible section */}
        {group.verdict && (
          <div className="px-4 py-3">
            {renderVerdict(group.verdict)}
          </div>
        )}
      </div>
    );
  };

  // --- Interaction count for header badge ---
  const interactionCount = groups.length;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-border bg-surface-2">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-lseg-blue" />
          <span className="text-sm font-semibold text-text">API Test Execution</span>
          {isExecuting && (
            <>
              <span className="relative flex h-2 w-2 ml-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lseg-blue opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lseg-blue" />
              </span>
              <span className="text-xs text-lseg-blue font-medium ml-1">Running...</span>
            </>
          )}
          {interactionCount > 0 && (
            <span className="text-xs bg-accent/15 text-lseg-blue px-2 py-0.5 rounded-full ml-auto font-medium">
              {interactionCount} {interactionCount === 1 ? "interaction" : "interactions"}
            </span>
          )}
        </div>
      </div>

      {/* Cards content area */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={logsScrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto p-4 api-logs-scroll"
        >
          {/* Empty executing state */}
          {messages.length === 0 && isExecuting && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 size={32} className="text-lseg-blue animate-spin mx-auto mb-2" />
                <p className="text-sm text-text-muted">Executing API tests...</p>
              </div>
            </div>
          )}

          {/* Interaction cards */}
          {groups.map(renderInteractionCard)}
        </div>

        {/* Scroll to bottom */}
        {isUserScrolling && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 bg-lseg-blue text-white px-3 py-1.5 rounded-full shadow-lg hover:bg-lseg-blue/90 transition-all flex items-center gap-2 text-sm z-10"
          >
            <ArrowDown size={14} />
            Latest
          </button>
        )}
      </div>

      {/* Follow-up input + Action bar */}
      {!isExecuting && messages.length > 0 && (
        <div className="flex-shrink-0 border-t border-border bg-surface-2">
          {/* Follow-up input */}
          {onSendFollowup && (
            <div className="px-6 py-3 flex items-end gap-2">
              <textarea
                ref={followupInputRef}
                value={followupInput}
                onChange={(e) => setFollowupInput(e.target.value)}
                onKeyDown={handleFollowupKeyDown}
                placeholder="Send a follow-up instruction... (Shift+Enter for new line)"
                rows={2}
                className="flex-1 px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-lseg-blue focus:border-transparent resize-none font-mono"
              />
              <button
                onClick={handleFollowupSubmit}
                disabled={!followupInput.trim()}
                className="p-2 bg-lseg-blue hover:bg-lseg-blue/90 disabled:bg-surface-2 disabled:text-text-muted text-white rounded-lg transition-colors"
                title="Send follow-up (Enter)"
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {/* Collapsible actions */}
          <div className="px-6 pb-3">
            <button
              type="button"
              onClick={() => setShowActions(!showActions)}
              className="text-xs text-text-muted hover:text-text transition-colors flex items-center gap-1 mb-2"
            >
              {showActions ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Actions
            </button>
            {showActions && (
              <div className="flex items-center gap-3">
                <button
                  onClick={onRunAgain}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-lseg-blue bg-accent/10 border border-accent rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <RotateCw size={14} />
                  Run Again
                </button>
                <button
                  onClick={onNewTest}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-muted bg-surface-2 border border-border rounded-lg hover:bg-surface-2 transition-colors"
                >
                  <Plus size={14} />
                  New Test
                </button>
                {onExportHtml && (
                  <button
                    onClick={onExportHtml}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-muted bg-surface-2 border border-border rounded-lg hover:bg-surface-2 transition-colors"
                  >
                    <Download size={14} />
                    Export Conversation
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .api-logs-scroll {
          scrollbar-width: thin;
          scrollbar-color: #CBD5E1 #F5F7FA;
        }
        .api-logs-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .api-logs-scroll::-webkit-scrollbar-track {
          background: #F5F7FA;
        }
        .api-logs-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 4px;
        }
        .api-log-prose p { margin: 0; line-height: 1.5; color: inherit; }
        .api-log-prose code {
          background: #F1F5F9;
          color: #1E293B;
          padding: 0.1em 0.3em;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .api-log-prose pre {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          padding: 0.75em;
          border-radius: 4px;
          overflow-x: auto;
          margin: 0.5em 0;
        }
        .api-log-prose pre code { background: none; padding: 0; }
        .api-log-prose a { color: #001eff; text-decoration: underline; }
        .api-log-prose ul, .api-log-prose ol { margin: 0.5em 0; padding-left: 1.5em; }
        .api-log-prose li { margin: 0.25em 0; }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}
