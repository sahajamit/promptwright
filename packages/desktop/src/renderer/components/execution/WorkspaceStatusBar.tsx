import {
  CheckCircle2,
  Clock,
  Globe,
  ListFilter,
  Loader2,
  PanelBottom,
  Plus,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";

type Verdict = "pass" | "fail" | null;

interface WorkspaceStatusBarProps {
  isExecuting: boolean;
  elapsedTime: number;
  verdict: Verdict;
  onCancel: () => void;
  onRunAgain: () => void;
  onNewTest: () => void;
  browserOpen: boolean;
  onToggleBrowser: () => void;
  outputOpen: boolean;
  onToggleOutput: () => void;
  /** true = show every log entry (incl. raw tool calls); false = meaningful only */
  showAllLogs: boolean;
  onToggleShowAllLogs: () => void;
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WorkspaceStatusBar({
  isExecuting,
  elapsedTime,
  verdict,
  onCancel,
  onRunAgain,
  onNewTest,
  browserOpen,
  onToggleBrowser,
  outputOpen,
  onToggleOutput,
  showAllLogs,
  onToggleShowAllLogs,
}: WorkspaceStatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-border bg-surface">
      {/* Left: status */}
      <div className="flex items-center gap-3 min-w-0">
        {isExecuting ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-text">
            <Loader2 size={15} className="animate-spin text-accent" />
            Executing
          </span>
        ) : verdict === "pass" ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 size={16} /> Test Passed
          </span>
        ) : verdict === "fail" ? (
          <span className="flex items-center gap-2 text-sm font-semibold text-danger">
            <XCircle size={16} /> Test Failed
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold text-text">Execution Complete</span>
        )}

        <span className="flex items-center gap-1 text-xs text-text-muted font-mono">
          <Clock size={12} />
          {formatTime(elapsedTime)}
        </span>
      </div>

      {/* Right: dock toggles + actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleShowAllLogs}
          title={showAllLogs ? "Showing all logs (incl. tool calls) — click for key steps only" : "Showing key steps only — click to show all logs"}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            showAllLogs
              ? "bg-accent/15 text-accent border-accent/30"
              : "text-text-muted hover:text-text border-transparent hover:bg-surface-2"
          }`}
        >
          <ListFilter size={14} />
          {showAllLogs ? "All logs" : "Key steps"}
        </button>

        <span className="w-px h-5 bg-border mx-1" />

        <button
          onClick={onToggleOutput}
          title="Toggle output panel"
          className={`p-1.5 rounded-md border transition-colors ${
            outputOpen ? "bg-accent/15 text-accent border-accent/30" : "text-text-muted hover:text-text border-transparent hover:bg-surface-2"
          }`}
        >
          <PanelBottom size={15} />
        </button>
        <button
          onClick={onToggleBrowser}
          title="Toggle browser panel"
          className={`p-1.5 rounded-md border transition-colors ${
            browserOpen ? "bg-accent/15 text-accent border-accent/30" : "text-text-muted hover:text-text border-transparent hover:bg-surface-2"
          }`}
        >
          <Globe size={15} />
        </button>

        <span className="w-px h-5 bg-border mx-1" />

        {isExecuting ? (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger bg-danger/10 border border-danger/30 rounded-md hover:bg-danger/20 transition-colors"
          >
            <X size={14} /> Cancel
          </button>
        ) : (
          <>
            <button
              onClick={onRunAgain}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text bg-surface-2 border border-border rounded-md hover:bg-border transition-colors"
            >
              <RotateCcw size={14} /> Run Again
            </button>
            <button
              onClick={onNewTest}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-fg bg-brand-gradient rounded-md hover:opacity-90 transition-opacity"
            >
              <Plus size={14} /> New Test
            </button>
          </>
        )}
      </div>
    </div>
  );
}
