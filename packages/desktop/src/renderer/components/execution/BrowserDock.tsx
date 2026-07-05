import { Globe, Maximize2, Minimize2, MonitorPlay, X } from "lucide-react";
import { useEffect } from "react";

interface BrowserDockProps {
  /** Live screencast frame as a data URI (during execution). */
  latestFrame: string | null;
  /** Post-run recording replay. */
  recordingData: { type: "url" | "html"; data: string } | null;
  isExecuting: boolean;
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}

export function BrowserDock({
  latestFrame,
  recordingData,
  isExecuting,
  maximized,
  onToggleMaximize,
  onClose,
}: BrowserDockProps) {
  // ESC closes the maximized overlay
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggleMaximize();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "unset";
    };
  }, [maximized, onToggleMaximize]);

  const viewer = (
    <div className="flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
      {latestFrame ? (
        <img
          src={latestFrame}
          alt="Live browser"
          className="max-w-full max-h-full w-full h-full"
          style={{ objectFit: "contain" }}
        />
      ) : recordingData ? (
        recordingData.type === "url" ? (
          <iframe title="Recording" src={recordingData.data} className="w-full h-full border-0 bg-surface-2" />
        ) : (
          <iframe
            title="Recording"
            srcDoc={recordingData.data}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0 bg-surface-2"
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <MonitorPlay size={28} className="opacity-50" />
          <span className="text-xs">
            {isExecuting ? "Waiting for the browser..." : "No recording available"}
          </span>
        </div>
      )}
    </div>
  );

  const header = (
    <div className="flex items-center justify-between px-3 h-9 flex-shrink-0 border-b border-border bg-surface-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-text">
        <Globe size={13} className="text-accent" />
        Browser
        {isExecuting && latestFrame && (
          <span className="relative flex h-1.5 w-1.5 ml-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onToggleMaximize}
          title={maximized ? "Restore" : "Maximize"}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-border transition-colors"
        >
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        {!maximized && (
          <button
            onClick={onClose}
            title="Close panel"
            className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );

  if (maximized) {
    return (
      <div className="fixed inset-0 z-[9999] bg-bg/95 backdrop-blur-sm flex flex-col p-6 animate-fadeIn">
        <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden border border-border shadow-2xl bg-surface">
          {header}
          {viewer}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border">
      {header}
      {viewer}
    </div>
  );
}
