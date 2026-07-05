import type { ExecutionUsageMetadata } from "../../types";
import type { ExecutionMessage } from "./types";
import { ResultsPanel } from "./ResultsPanel";

type Tab = "output" | "results";

interface OutputDockProps {
  messages: ExecutionMessage[];
  testInput: string;
  usageMetadata: ExecutionUsageMetadata | null;
  isExecuting: boolean;
  isHistorical?: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

function ts(t: number): string {
  return new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function OutputDock({ messages, testInput, usageMetadata, isExecuting, isHistorical, tab, onTabChange }: OutputDockProps) {
  // Results view is only meaningful once the run has finished.
  const activeTab: Tab = isExecuting ? "output" : tab;
  const toolLines = messages.filter((m) => m.isToolCall || m.isToolResult);

  return (
    <div className="flex flex-col h-full bg-surface border-t border-border">
      {/* Tab strip */}
      <div className="flex items-center gap-1 px-2 h-8 flex-shrink-0 border-b border-border bg-surface-2">
        <TabBtn active={activeTab === "output"} onClick={() => onTabChange("output")} label="Output" />
        {!isExecuting && <TabBtn active={activeTab === "results"} onClick={() => onTabChange("results")} label="Results" />}
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "output" ? (
          <div className="h-full overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed logs-scroll-container">
            {toolLines.length === 0 ? (
              <div className="text-text-muted py-3">No tool output yet.</div>
            ) : (
              toolLines.map((m) => (
                <div key={m.id} className="flex gap-2 py-0.5">
                  <span className="text-text-muted/70 flex-shrink-0">{ts(m.timestamp)}</span>
                  <span className={`flex-shrink-0 ${m.isToolResult ? "text-success" : "text-accent"}`}>
                    {m.isToolResult ? "◂" : "▸"} {m.toolName || (m.isToolResult ? "result" : "tool")}
                  </span>
                  <span className="text-text-muted break-all whitespace-pre-wrap">
                    {(m.toolArgs || m.content || "").slice(0, 4000)}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <ResultsPanel messages={messages} testInput={testInput} usageMetadata={usageMetadata} isHistorical={isHistorical} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
        active ? "bg-surface text-text border border-border" : "text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}
