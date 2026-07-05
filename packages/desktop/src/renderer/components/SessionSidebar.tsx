import { Clock, Download, Loader2, MessageSquare, Trash2 } from "lucide-react";

import { useState } from "react";
import type { Thread } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";

interface SessionSidebarProps {
  sessions: Thread[];
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
  isSwitchingSession?: boolean;
  switchingToSessionId?: string | null;
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onExportSession,
  isSwitchingSession = false,
  switchingToSessionId = null,
}: SessionSidebarProps) {
  const [sessionToDelete, setSessionToDelete] = useState<Thread | null>(null);

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex-shrink-0">
        <h2 className="text-sm font-semibold text-text flex items-center gap-2">
          <MessageSquare size={16} />
          Chat History
        </h2>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-text-muted">No chat history yet</p>
            <p className="text-xs text-text-muted mt-1">
              Start a new conversation to begin
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => {
              const isLoadingThisSession = isSwitchingSession && switchingToSessionId === session.id;
              
              return (
                <div
                  key={session.id}
                  className={`
                    group relative flex items-start gap-2 p-3 rounded-lg transition-all
                    ${isLoadingThisSession ? "cursor-wait opacity-60" : "cursor-pointer"}
                    ${session.id === currentSessionId
                      ? "bg-accent/10 border border-accent/40 shadow-sm"
                      : "hover:bg-surface-2 hover:shadow-sm border border-transparent"
                    }
                  `}
                  onClick={() => !isLoadingThisSession && onSelectSession(session.id)}
                >
                  {isLoadingThisSession ? (
                    <Loader2
                      size={16}
                      className="flex-shrink-0 mt-0.5 text-accent animate-spin"
                    />
                  ) : (
                    <MessageSquare
                      size={16}
                      className={`flex-shrink-0 mt-0.5 ${session.id === currentSessionId
                        ? "text-accent"
                        : "text-text-muted"
                        }`}
                    />
                  )}

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${session.id === currentSessionId
                      ? "text-accent"
                      : "text-text"
                      }`}
                  >
                    {session.title}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={10} className="text-text-muted" />
                    <span className="text-xs text-text-muted">
                      {formatTime(session.updatedAt)}
                    </span>
                    <span className="text-xs text-text-muted ml-1">
                      • {session.messages.length} msgs
                    </span>
                  </div>
                </div>

                {/* Action buttons - shown on hover */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Export button (for sessions with execution data) */}
                  {session.executionData && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportSession(session.id);
                      }}
                      className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded transition-all"
                      title="Export as HTML"
                    >
                      <Download size={14} />
                    </button>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionToDelete(session);
                    }}
                    className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-all"
                    title="Delete session"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}

      <ConfirmDialog
        isOpen={!!sessionToDelete}
        title={`Delete "${sessionToDelete?.title}"?`}
        message="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (sessionToDelete) {
            onDeleteSession(sessionToDelete.id);
            setSessionToDelete(null);
          }
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </div>
  );
}
