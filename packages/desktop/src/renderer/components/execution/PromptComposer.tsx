import {
  AlertCircle,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  PlayCircle,
  SlidersHorizontal,
  Upload,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";
import logoUrl from "../../assets/logo.png";
import type { CopilotReadiness } from "../../hooks/useSession";
import { GherkinPreview } from "../GherkinPreview";

export interface RuntimeExecutionSettings {
  modelLabel: string;
  modelHint: string;
  automationModeLabel: string;
  loading: boolean;
}

interface PromptComposerProps {
  testInput: string;
  setTestInput: (value: string) => void;
  attachedFile: { name: string; content: string } | null;
  onSubmit: (e: React.FormEvent) => void;
  onFileAttach: () => void;
  onRemoveFile: () => void;
  runtimeSettings: RuntimeExecutionSettings;
  onShowExamples: () => void;
  copilotReadiness?: CopilotReadiness;
  copilotError?: string | null;
  onRetryConnection?: () => void;
}

/**
 * Idle entry screen — centered prompt composer. The only run-page state allowed
 * a centered column (it's a focused entry form, not a workspace).
 */
export function PromptComposer({
  testInput,
  setTestInput,
  attachedFile,
  onSubmit,
  onFileAttach,
  onRemoveFile,
  runtimeSettings,
  onShowExamples,
  copilotReadiness,
  copilotError,
  onRetryConnection,
}: PromptComposerProps) {
  const hasInput = Boolean(testInput.trim() || attachedFile);
  const isConnecting = copilotReadiness === "initializing";
  const isConnectionError = copilotReadiness === "error";
  const [isFilePreviewExpanded, setIsFilePreviewExpanded] = useState(true);

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="max-w-3xl mx-auto w-full px-6 py-10">
        {/* Copilot readiness banners */}
        {isConnecting && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent">
            <Loader2 size={14} className="animate-spin" />
            <span>Connecting to your model... You can type your test while it loads.</span>
          </div>
        )}
        {isConnectionError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
            <AlertCircle size={14} />
            <span>Failed to connect: {copilotError}</span>
            {onRetryConnection && (
              <button onClick={onRetryConnection} className="ml-auto underline text-xs hover:opacity-80">
                Retry
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <img src={logoUrl} alt="Promptwright" className="w-16 h-16 mx-auto mb-3 rounded-2xl" />
          <h1 className="text-2xl font-bold text-text mb-1">AI QA Assistant</h1>
          <p className="text-base text-text-muted">
            Test web UIs and REST APIs with natural language
          </p>
        </div>

        {/* Runtime settings chips */}
        <div className="mb-5 flex justify-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-full bg-surface-2 border border-border">
            <span
              title={runtimeSettings.modelHint}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-text-muted"
            >
              <Brain size={12} className="text-accent" />
              <span className="text-text-muted">Model:</span>
              <span
                className={`font-medium max-w-[220px] truncate ${runtimeSettings.loading ? "text-text-muted" : "text-text"}`}
                title={runtimeSettings.modelLabel}
              >
                {runtimeSettings.modelLabel}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-text-muted">
              <SlidersHorizontal size={12} className="text-accent-2" />
              <span className="text-text-muted">Mode:</span>
              <span className={`font-medium ${runtimeSettings.loading ? "text-text-muted" : "text-text"}`}>
                {runtimeSettings.automationModeLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Input form */}
        <form onSubmit={onSubmit} className="flex flex-col">
          {attachedFile && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg">
              <FileText className="text-success flex-shrink-0" size={18} />
              <span className="flex-1 text-sm font-medium text-text truncate">{attachedFile.name}</span>
              <button
                type="button"
                onClick={onRemoveFile}
                className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                title="Remove file"
              >
                <XCircle size={16} />
              </button>
            </div>
          )}

          {attachedFile && (
            <div className="mb-4 bg-surface border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setIsFilePreviewExpanded(!isFilePreviewExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-success" />
                  <span className="text-sm font-semibold text-text">{attachedFile.name}</span>
                </div>
                {isFilePreviewExpanded ? (
                  <ChevronUp size={16} className="text-text-muted" />
                ) : (
                  <ChevronDown size={16} className="text-text-muted" />
                )}
              </button>
              {isFilePreviewExpanded && (
                <div className="px-4 pb-4">
                  <GherkinPreview gherkin={attachedFile.content} />
                </div>
              )}
            </div>
          )}

          {!attachedFile && (
            <div className="mb-4">
              <textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Describe your testing task..."
                autoFocus
                className="w-full h-44 p-4 text-sm text-text bg-surface border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-transparent font-mono placeholder:text-text-muted"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!hasInput || isConnecting}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                hasInput && !isConnecting
                  ? "bg-brand-gradient text-accent-fg hover:opacity-90 shadow-sm"
                  : "bg-surface-2 text-text-muted cursor-not-allowed"
              }`}
            >
              {isConnecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <PlayCircle size={16} />
                  Run Test
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onShowExamples}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text bg-surface border border-border rounded-lg hover:bg-surface-2 transition-colors"
            >
              <BookOpen size={16} />
              Examples
            </button>

            <button
              type="button"
              onClick={onFileAttach}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text bg-surface border border-border rounded-lg hover:bg-surface-2 transition-colors"
            >
              <Upload size={16} />
              File
            </button>
          </div>
        </form>

        <p className="text-xs text-text-muted mt-5 text-center">
          The orchestrator will route your task to the right agent automatically.
        </p>
      </div>
    </div>
  );
}
