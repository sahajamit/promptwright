import { ChevronDown, ChevronRight, MessageSquareText } from "lucide-react";
import { useState } from "react";

interface PromptBannerProps {
  /** The original prompt/test steps the user submitted. */
  prompt: string;
}

/**
 * Slim, always-visible banner at the top of the execution workspace that shows
 * the prompt the user submitted, so they can correlate it with the live logs.
 * Multi-line prompts are clamped to two lines and expandable.
 */
export function PromptBanner({ prompt }: PromptBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const text = prompt.trim();
  if (!text) return null;

  // Only offer expand/collapse when the prompt is long enough to be clamped.
  const isMultiline = text.includes("\n") || text.length > 110;

  return (
    <div className="flex-shrink-0 border-b border-border bg-surface-2/60 px-4 py-2">
      <div className="flex items-start gap-2">
        <MessageSquareText size={14} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Your prompt
            </span>
            {isMultiline && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-0.5 text-[10px] text-text-muted hover:text-text transition-colors"
              >
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {expanded ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
          <div
            className={`text-xs text-text whitespace-pre-wrap break-words mt-0.5 ${
              expanded ? "" : "line-clamp-2"
            }`}
          >
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}
