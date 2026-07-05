import { Download, Loader2, RotateCw, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import type { ExecutionUsageMetadata } from "../../types";
import type { ExecutionMessage } from "./types";
import { GherkinPreview } from "../GherkinPreview";

interface ResultsPanelProps {
  messages: ExecutionMessage[];
  testInput: string;
  usageMetadata: ExecutionUsageMetadata | null;
  isHistorical?: boolean;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function ResultsPanel({ messages, testInput, usageMetadata, isHistorical = false }: ResultsPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [gherkin, setGherkin] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [refineInput, setRefineInput] = useState("");

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const logs = messages.map((m) => `[${formatTs(m.timestamp)}] ${m.content}`).join("\n\n");
      const result = await window.jarvis.execution.generateGherkin(testInput, logs);
      setGherkin(result.gherkin);
    } catch (error) {
      console.error("Failed to generate Gherkin:", error);
      await window.jarvis.dialog.showMessage({
        type: "error", title: "Generation Failed",
        message: "Failed to generate Gherkin. Please try again.",
        detail: error instanceof Error ? error.message : String(error), buttons: ["OK"],
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!refineInput.trim() || !gherkin) return;
    setIsRefining(true);
    try {
      const result = await window.jarvis.execution.refineGherkin(gherkin, refineInput.trim(), testInput);
      setGherkin(result.gherkin);
      setRefineInput("");
    } catch (error) {
      console.error("Failed to refine Gherkin:", error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleExport = async () => {
    if (!gherkin) return;
    try {
      const filePath = await window.jarvis.recording.pickExportPath();
      if (!filePath) return;
      await window.jarvis.recording.export(gherkin, filePath);
      await window.jarvis.dialog.showMessage({
        type: "info", title: "Feature File Exported",
        message: "Feature file exported successfully to:", detail: filePath, buttons: ["OK"],
      });
    } catch (error) {
      console.error("Failed to export Gherkin:", error);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-3 bg-bg">
      {/* Usage metrics */}
      {usageMetadata && (
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-accent" />
            <span className="text-xs font-semibold text-text">Usage Metrics</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {usageMetadata.premiumRequests !== undefined && (
              <Stat label="Premium req." value={`${usageMetadata.premiumRequests}`} />
            )}
            <Stat label="API time" value={`${Math.floor(usageMetadata.totalDuration / 1000)}s`} />
            <Stat label="Output tok." value={`${usageMetadata.totalOutputTokens}`} />
          </div>
          <div className="space-y-1.5">
            {Object.entries(usageMetadata.modelBreakdown).map(([model, d]) => (
              <div key={model} className="bg-surface-2 rounded-md p-2 border border-border">
                <div className="text-xs font-medium text-text mb-0.5">{model}</div>
                <div className="text-[11px] text-text-muted">
                  in {(d.inputTokens / 1000).toFixed(1)}k · out {d.outputTokens}
                  {d.cachedTokens > 0 ? ` · cached ${(d.cachedTokens / 1000).toFixed(1)}k` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gherkin generation */}
      <div className="bg-surface border border-border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 size={14} className="text-accent" />
          <span className="text-xs font-semibold text-text">Feature File (Gherkin)</span>
        </div>

        {!gherkin ? (
          <button
            onClick={handleGenerate}
            disabled={isGenerating || isHistorical}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-accent-fg bg-brand-gradient rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? "Generating..." : "Generate refined test steps"}
          </button>
        ) : (
          <div className="space-y-2">
            <GherkinPreview gherkin={gherkin} />
            <div className="flex items-center gap-2">
              <input
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
                placeholder="Refine (e.g. add edge cases)..."
                className="flex-1 px-2.5 py-1.5 text-xs text-text bg-surface-2 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-accent/60"
              />
              <button onClick={handleRefine} disabled={isRefining || !refineInput.trim()} title="Refine"
                className="p-1.5 rounded-md bg-surface-2 border border-border text-text-muted hover:text-accent disabled:opacity-40">
                {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExport} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-accent-fg bg-brand-gradient rounded-md hover:opacity-90">
                <Download size={13} /> Export .feature
              </button>
              <button onClick={handleGenerate} disabled={isGenerating} title="Regenerate"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-text bg-surface-2 border border-border rounded-md hover:bg-border">
                <RotateCw size={13} /> Regenerate
              </button>
              <button onClick={() => setGherkin(null)} title="Discard"
                className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-md p-2">
      <div className="text-[10px] text-text-muted mb-0.5">{label}</div>
      <div className="text-sm font-bold text-text">{value}</div>
    </div>
  );
}
