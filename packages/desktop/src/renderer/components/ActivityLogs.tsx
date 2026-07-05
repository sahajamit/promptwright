import { AlertCircle, ArrowRight, Brain, Check, ChevronDown, ChevronUp, Copy, Info, Loader2, MessageSquare, MousePointer, Navigation, Trash2, Type, Video, Wrench } from "lucide-react";
import React, { useState } from "react";
import type { LogEntry, RecordedActionLog } from "../types";

interface ActivityLogsProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function ActivityLogs({ logs, onClear }: ActivityLogsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLogs = async () => {
    try {
      // Format logs for debugging
      const debugData = {
        exportedAt: new Date().toISOString(),
        totalLogs: logs.length,
        logs: logs.map(log => ({
          id: log.id,
          type: log.type,
          timestamp: log.timestamp,
          timestampFormatted: new Date(log.timestamp).toISOString(),
          content: log.content,
          status: log.status,
          toolName: log.toolName,
          toolArgs: log.toolArgs ? JSON.parse(log.toolArgs) : undefined,
          toolResult: log.toolResult,
          recordedActions: log.recordedActions,
          sessionInfo: log.sessionInfo,
        })),
      };

      await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy logs:", error);
    }
  };

  return (
    <div className="w-80 border-l border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2">
        <h3 className="font-semibold text-text">Activity</h3>
        {logs.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyLogs}
              className={`p-1.5 rounded transition-colors ${copied
                ? "text-success bg-success/10"
                : "text-text-muted hover:text-text hover:bg-surface-2"
                }`}
              title={copied ? "Copied!" : "Copy logs as JSON"}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              onClick={onClear}
              className="p-1.5 text-text-muted hover:text-text hover:bg-surface-2 rounded transition-colors"
              title="Clear logs"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Logs list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {logs.length === 0 ? (
          <div className="text-center text-text-muted py-8">
            <Info size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity yet</p>
            <p className="text-xs mt-1 text-text-muted">Tool executions, AI thinking, and recorded actions will appear here</p>
          </div>
        ) : (
          logs.map((log) => <LogItem key={log.id} log={log} />)
        )}
      </div>
    </div>
  );
}

function LogItem({ log }: { log: LogEntry }) {
  const { icon, iconColor, bgColor } = getLogStyle(log);
  const [isExpanded, setIsExpanded] = useState(false);

  // For tool calls, we always allow expansion if there are args or results
  const hasDetails = log.type === "tool" && (log.toolArgs || log.toolResult);
  // For recording logs, check if there are recorded actions
  const hasRecordingDetails = log.type === "recording" && log.recordedActions && log.recordedActions.length > 0;
  // For prompt logs, check if there is a system prompt
  const hasPromptDetails = log.type === "prompt" && (log.systemPrompt || log.userPrompt);
  // For other types, check if content is long enough to be truncated
  const isTruncatable = log.content.length > 150;
  const isExpandable = hasDetails || isTruncatable || hasRecordingDetails || hasPromptDetails;

  const toggleExpand = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div
      className={`flex gap-2 p-2 rounded-lg ${bgColor} ${isExpandable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={toggleExpand}
    >
      <div className={`flex-shrink-0 ${iconColor}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        {log.type === "tool" && log.toolName && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text truncate">
              {log.toolName}
            </span>
            {log.status === "running" && (
              <Loader2 size={12} className="animate-spin text-lseg-blue" />
            )}
          </div>
        )}

        {log.type === "recording" && log.sessionInfo && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-text">
              Recording Complete
            </span>
            <span className="text-xs bg-success/15 text-success px-1.5 py-0.5 rounded">
              {log.recordedActions?.length || 0} actions
            </span>
          </div>
        )}

        <div className={`text-xs text-text-muted ${!isExpanded && isTruncatable ? 'line-clamp-3' : ''} whitespace-pre-wrap break-words`}>
          {renderMarkdown(log.content)}
        </div>

        {/* Expanded details for tool calls */}
        {isExpanded && hasDetails && (
          <div className="mt-3 space-y-2">
            {log.toolArgs && (
              <div className="bg-surface-2 border border-border rounded p-2">
                <div className="text-xs font-semibold text-text-muted mb-1 flex items-center gap-1">
                  <span>Arguments</span>
                </div>
                <pre className="text-xs text-text overflow-x-auto whitespace-pre-wrap break-all">
                  {formatJSON(log.toolArgs)}
                </pre>
              </div>
            )}
            {log.toolResult && (
              <div className="bg-surface-2 border border-border rounded p-2">
                <div className="text-xs font-semibold text-text-muted mb-1 flex items-center gap-1">
                  <span>Result</span>
                </div>
                <pre className="text-xs text-text overflow-x-auto whitespace-pre-wrap break-all">
                  {formatJSON(log.toolResult)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Expanded details for recording logs */}
        {isExpanded && hasRecordingDetails && log.recordedActions && (
          <div className="mt-3 space-y-2">
            {/* Session metadata */}
            {log.sessionInfo && (
              <div className="bg-accent/10 border border-accent/30 rounded p-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-semibold text-text">Mode:</span> <span className="text-text-muted">{log.sessionInfo.mode}</span>
                  </div>
                  {log.sessionInfo.endTime && (
                    <div>
                      <span className="font-semibold text-text">Duration:</span>{" "}
                      <span className="text-text-muted">{formatDuration(log.sessionInfo.endTime - log.sessionInfo.startTime)}</span>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="font-semibold text-text">URL:</span> <span className="text-text-muted">{log.sessionInfo.startUrl}</span>
                  </div>
                  {log.tempFilePath && (
                    <div className="col-span-2 flex items-center gap-2">
                      <span className="font-semibold text-text">Temp file:</span>
                      <code className="flex-1 text-[10px] truncate bg-bg border border-border px-2 py-1 rounded text-text-muted">
                        {log.tempFilePath}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(log.tempFilePath!);
                        }}
                        className="text-lseg-blue hover:text-lseg-blue-dark p-1"
                        title="Copy path"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action summary */}
            {log.recordedActions && (
              <ActionSummary actions={log.recordedActions} />
            )}

            {/* Detailed action list */}
            <div className="bg-surface-2 border border-border rounded p-2 max-h-64 overflow-y-auto">
              <div className="text-xs font-semibold text-text-muted mb-2">Recorded Actions:</div>
              {log.recordedActions.map((action, idx) => (
                <RecordedActionItem key={idx} action={action} index={idx} />
              ))}
            </div>
          </div>
        )}

        {/* Expanded details for prompt logs */}
        {isExpanded && hasPromptDetails && (
          <div className="mt-3 space-y-2">
            {/* Model info badge */}
            {log.modelUsed && (
              <div className="flex items-center gap-2 text-xs p-2 bg-purple-500/10 border border-purple-500/30 rounded">
                <Brain size={12} className="text-purple-500 dark:text-purple-400" />
                <span className="text-text-muted">Model:</span>
                <span className="font-medium text-purple-500 dark:text-purple-400">
                  {log.modelUsed === "default" ? "Copilot Default" : log.modelUsed}
                </span>
                {log.modelUsed === "default" && (
                  <span className="text-text-muted text-[10px]">(configure in Settings)</span>
                )}
              </div>
            )}

            {log.userPrompt && (

              <div className="bg-accent/10 border border-accent/30 rounded p-2">
                <div className="text-xs font-semibold text-accent mb-1 flex items-center gap-1">
                  <span>User Test Input</span>
                </div>
                <pre className="text-xs text-text overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {log.userPrompt}
                </pre>
              </div>
            )}
            {log.systemPrompt && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2">
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1 flex items-center justify-between">
                  <span>System Prompt (sent to LLM)</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(log.systemPrompt!);
                    }}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-500 p-1"
                    title="Copy system prompt"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <pre className="text-xs text-text overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto font-mono bg-bg/50 p-2 rounded">
                  {log.systemPrompt}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-text-muted">
            {formatTime(log.timestamp)}
          </span>
          {isExpandable && (
            <button
              className="flex items-center gap-1 text-xs text-lseg-blue hover:text-lseg-blue-dark transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand();
              }}
            >
              {isExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp size={12} />
                </>
              ) : (
                <>
                  <span>Show more</span>
                  <ChevronDown size={12} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordedActionItem({ action, index }: { action: RecordedActionLog; index: number }) {
  const getActionIcon = (type: string) => {
    switch (type) {
      case "click":
        return <MousePointer size={10} className="text-blue-500" />;
      case "type":
        return <Type size={10} className="text-green-500" />;
      case "navigate":
        return <Navigation size={10} className="text-purple-500" />;
      default:
        return <ArrowRight size={10} className="text-text-muted" />;
    }
  };

  return (
    <div className="flex items-start gap-1.5 py-1 border-b border-border last:border-0 text-xs">
      <span className="text-text-muted w-4 text-right flex-shrink-0">{index + 1}.</span>
      {getActionIcon(action.type)}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-text-muted">{action.type}</span>
        {action.target && (
          <span className="text-text-muted ml-1">
            on &lt;{action.target.tagName}&gt;
            {action.target.textContent && (
              <span className="text-text-muted"> "{action.target.textContent.slice(0, 20)}..."</span>
            )}
          </span>
        )}
        {action.value && (
          <span className="text-green-600 ml-1">"{action.value.slice(0, 30)}{action.value.length > 30 ? '...' : ''}"</span>
        )}
        {action.url && (
          <span className="text-purple-600 ml-1 truncate block">{action.url}</span>
        )}
        {action.target?.locators && (
          <div className="text-text-muted font-mono text-[10px] mt-0.5 truncate">
            {action.target.locators.testId
              ? `[data-testid="${action.target.locators.testId}"]`
              : action.target.locators.css || action.target.locators.xpath}
          </div>
        )}
      </div>
    </div>
  );
}

function getLogStyle(log: LogEntry) {
  switch (log.type) {
    case "tool":
      return {
        icon: log.status === "running" ? <Wrench size={16} /> : <Wrench size={16} />,
        iconColor: log.status === "failed" ? "text-danger" : "text-accent",
        bgColor: "bg-surface-2 border border-border",
      };
    case "thinking":
      return {
        icon: <Brain size={16} />,
        iconColor: "text-purple-500 dark:text-purple-400",
        bgColor: "bg-purple-500/10 border border-purple-500/30",
      };
    case "error":
      return {
        icon: <AlertCircle size={16} />,
        iconColor: "text-danger",
        bgColor: "bg-danger/10 border border-danger/30",
      };
    case "recording":
      return {
        icon: <Video size={16} />,
        iconColor: "text-success",
        bgColor: "bg-success/10 border border-success/30",
      };
    case "prompt":
      return {
        icon: <MessageSquare size={16} />,
        iconColor: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-500/10 border border-amber-500/30",
      };
    default:
      return {
        icon: <Info size={16} />,
        iconColor: "text-text-muted",
        bgColor: "bg-surface-2 border border-border",
      };
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatJSON(value: string | undefined): string {
  if (!value) return "N/A";

  try {
    // If it's already a string that looks like JSON, parse and format it
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // If parsing fails, it might already be a plain string or formatted JSON
    return value;
  }
}

function ActionSummary({ actions }: { actions: RecordedActionLog[] }) {
  const summary = actions.reduce((acc, action) => {
    acc[action.type] = (acc[action.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(summary).map(([type, count]) => (
        <span
          key={type}
          className="text-xs bg-accent/15 text-accent px-2 py-1 rounded"
        >
          {count} {type}{count > 1 ? "s" : ""}
        </span>
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function renderMarkdown(text: string): React.ReactNode {
  // Split text by **bold** pattern and render accordingly
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the bold part
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add bold text
    parts.push(<strong key={match.index} className="font-semibold text-text">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last bold match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
