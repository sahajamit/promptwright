import { ArrowDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ExecutionMessage } from "./types";
import { TimelineItem } from "./TimelineItem";

interface ActivityTimelineProps {
  messages: ExecutionMessage[];
  isExecuting: boolean;
  /** When false (default), hide raw tool calls/results and show only the
   *  meaningful LLM narration + verdicts. When true, show the full log. */
  showAll?: boolean;
}

/** Index of the latest tool call that has no matching result yet (still running). */
function runningCallIndex(messages: ExecutionMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.isToolCall) {
      const hasResult = messages.slice(i + 1).some((r) => r.isToolResult);
      return hasResult ? -1 : i;
    }
    if (m.isToolResult) return -1;
  }
  return -1;
}

export function ActivityTimeline({ messages, isExecuting, showAll = false }: ActivityTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);

  const visible = messages.filter((m) => {
    if (m.isTurnSeparator || m.isVerdict) return true;
    // Meaningful-only mode: drop raw tool calls + tool results, keep LLM narration.
    if (!showAll && (m.isToolCall || m.isToolResult)) return false;
    return Boolean(m.content.trim() || (showAll && m.toolName));
  });
  const runningIdx = isExecuting && showAll ? runningCallIndex(messages) : -1;
  // In meaningful-only mode tool activity is hidden, so keep a "working" tail
  // visible whenever we're executing; in full mode only when nothing is running.
  const showThinkingTail = isExecuting && (showAll ? runningIdx === -1 : true);

  useEffect(() => {
    if (isExecuting) setUserScrolling(false);
  }, [isExecuting]);

  useEffect(() => {
    if (!userScrolling && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, userScrolling]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setUserScrolling(!atBottom);
  };

  const jumpToLatest = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setUserScrolling(false);
  };

  return (
    <div className="relative h-full bg-bg">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-5 py-4 logs-scroll-container">
        {visible.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-6">
            <Loader2 size={14} className="animate-spin" />
            <span>AI is at work...</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((m) => {
              const idx = messages.indexOf(m);
              return <TimelineItem key={m.id} message={m} running={idx === runningIdx} />;
            })}
            {showThinkingTail && (
              <div className="flex items-center gap-2 text-xs text-text-muted pl-8 py-1">
                <Loader2 size={12} className="animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {userScrolling && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-accent-fg rounded-full shadow-lg hover:opacity-90 transition-opacity"
        >
          <ArrowDown size={12} />
          Latest
        </button>
      )}
    </div>
  );
}
