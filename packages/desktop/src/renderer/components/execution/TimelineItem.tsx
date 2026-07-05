import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  CornerDownRight,
  GitBranch,
  Loader2,
  MessageSquare,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ExecutionMessage } from "./types";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

type StepKind =
  | "turn"
  | "verdict"
  | "orchestrator"
  | "navigate"
  | "snapshot"
  | "tool"
  | "result"
  | "message";

function classify(m: ExecutionMessage): StepKind {
  if (m.isTurnSeparator) return "turn";
  if (m.isVerdict) return "verdict";
  if (m.isToolResult) return "result";
  if (m.isToolCall) {
    const t = (m.toolName || "").toLowerCase();
    if (/goto|navigate|open/.test(t)) return "navigate";
    if (/snapshot|screenshot|view/.test(t)) return "snapshot";
    return "tool";
  }
  if (m.agentName === "orchestrator") return "orchestrator";
  return "message";
}

const ICONS: Record<StepKind, typeof Compass> = {
  turn: CornerDownRight,
  verdict: CheckCircle2,
  orchestrator: GitBranch,
  navigate: Compass,
  snapshot: Camera,
  tool: Wrench,
  result: Terminal,
  message: MessageSquare,
};

function agentBadge(m: ExecutionMessage): { label: string; cls: string } | null {
  if (!m.agentName) return null;
  let label = m.agentTag || (m.agentName === "orchestrator" ? "Orca" : m.agentDisplayName || m.agentName);
  if (!m.agentTag && m.agentDisplayName && m.agentName !== "orchestrator") {
    label = m.agentDisplayName.split(/\s+/).slice(0, 2).join(" ");
  }
  if (m.agentName === "orchestrator") {
    return { label, cls: "bg-surface-2 text-text-muted border-border" };
  }
  return { label, cls: "bg-accent/15 text-accent border-accent/30" };
}

export interface TimelineItemProps {
  message: ExecutionMessage;
  /** true while this is the latest tool call with no result yet */
  running?: boolean;
}

export function TimelineItem({ message: m, running = false }: TimelineItemProps) {
  const kind = classify(m);
  const [expanded, setExpanded] = useState(false);

  // Turn separator → divider
  if (kind === "turn") {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
        <CornerDownRight size={12} className="text-accent" />
        <span className="font-medium">Follow-up{m.turnNumber ? ` · turn ${m.turnNumber}` : ""}</span>
        <span className="flex-1 border-t border-border" />
      </div>
    );
  }

  // Verdict → banner
  if (kind === "verdict") {
    const pass = m.verdictType === "pass";
    return (
      <div
        className={`rounded-lg border p-3 flex items-start gap-2.5 ${
          pass ? "bg-success/10 border-success/30" : "bg-danger/10 border-danger/30"
        }`}
      >
        {pass ? (
          <CheckCircle2 size={18} className="text-success flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
        )}
        <div className={`text-sm flex-1 prose prose-sm max-w-none ${pass ? "text-text" : "text-text"}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  const Icon = ICONS[kind];
  const badge = agentBadge(m);
  const isToolish = kind === "tool" || kind === "navigate" || kind === "snapshot" || kind === "result";
  const summary =
    isToolish && m.toolName
      ? `${m.toolName}${m.toolArgs ? " " : ""}`
      : null;

  return (
    <div className="flex items-start gap-2.5 group">
      {/* Rail icon */}
      <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center border ${
            running
              ? "bg-accent/15 border-accent/40 text-accent"
              : "bg-surface-2 border-border text-text-muted"
          }`}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          {badge && (
            <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-full leading-none ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          <span className="text-[10px] text-text-muted font-mono">{formatTimestamp(m.timestamp)}</span>
          {summary && (
            <code className="text-xs text-text font-mono bg-surface-2 px-1.5 py-0.5 rounded border border-border">
              {summary.trim()}
            </code>
          )}
        </div>

        {/* tool args (expandable) */}
        {isToolish && m.toolArgs && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {expanded ? "Hide" : "Show"} details
          </button>
        )}
        {isToolish && m.toolArgs && expanded && (
          <pre className="mt-1 text-[11px] text-text-muted bg-surface-2 border border-border rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words">
            {m.toolArgs}
          </pre>
        )}

        {/* plain message content */}
        {!isToolish && m.content.trim() && (
          <div className="text-sm text-text mt-0.5 prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
