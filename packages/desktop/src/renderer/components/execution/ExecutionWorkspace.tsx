import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import type { ExecutionUsageMetadata } from "../../types";
import type { ExecutionMessage } from "./types";
import { ActivityTimeline } from "./ActivityTimeline";
import { BrowserDock } from "./BrowserDock";
import { OutputDock } from "./OutputDock";
import { PromptBanner } from "./PromptBanner";
import { WorkspaceStatusBar } from "./WorkspaceStatusBar";

interface ExecutionWorkspaceProps {
  messages: ExecutionMessage[];
  isExecuting: boolean;
  testInput: string;
  recordingPath: string | null;
  usageMetadata: ExecutionUsageMetadata | null;
  elapsedTime: number;
  onCancel: () => void;
  onRunAgain: () => void;
  onNewTest: () => void;
  isHistorical?: boolean;
  testType?: "web" | "api";
}

function deriveVerdict(messages: ExecutionMessage[]): "pass" | "fail" | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].isVerdict) return messages[i].verdictType === "fail" ? "fail" : "pass";
  }
  return null;
}

export function ExecutionWorkspace({
  messages,
  isExecuting,
  testInput,
  recordingPath,
  usageMetadata,
  elapsedTime,
  onCancel,
  onRunAgain,
  onNewTest,
  isHistorical = false,
  testType = "web",
}: ExecutionWorkspaceProps) {
  const browserRef = useRef<ImperativePanelHandle>(null);
  const outputRef = useRef<ImperativePanelHandle>(null);
  const sawFirstFrame = useRef(false);
  const autoShownResults = useRef(false);

  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [recordingData, setRecordingData] = useState<{ type: "url" | "html"; data: string } | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputTab, setOutputTab] = useState<"output" | "results">("output");
  const [maximized, setMaximized] = useState(false);
  // Persisted across sessions (default: key steps only).
  const [showAllLogs, setShowAllLogs] = useState(() => {
    try {
      return localStorage.getItem("pw-show-all-logs") === "true";
    } catch {
      return false;
    }
  });

  const verdict = deriveVerdict(messages);
  const isWeb = testType !== "api";

  // Subscribe to live screencast frames (web + executing); auto-open browser dock on first frame.
  useEffect(() => {
    if (!isExecuting || !isWeb) {
      setLatestFrame(null);
      sawFirstFrame.current = false;
      return;
    }
    const unsub = window.jarvis.execution.onScreencastFrame((frame) => {
      setLatestFrame(`data:image/jpeg;base64,${frame.data}`);
      if (!sawFirstFrame.current) {
        sawFirstFrame.current = true;
        browserRef.current?.expand();
      }
    });
    return () => unsub();
  }, [isExecuting, isWeb]);

  // Fetch recording replay once available (post-run), and open the dock to show it.
  useEffect(() => {
    if (recordingPath && !isExecuting && isWeb) {
      window.jarvis.execution
        .getRecordingData(recordingPath)
        .then((data) => {
          setRecordingData(data);
          browserRef.current?.expand();
        })
        .catch((err) => {
          console.error("[ExecutionWorkspace] Failed to get recording data:", err);
          setRecordingData(null);
        });
    } else {
      setRecordingData(null);
    }
  }, [recordingPath, isExecuting, isWeb]);

  // When a run finishes, surface the Results panel (Gherkin generation, usage)
  // automatically — otherwise the "Generate refined test steps" action stays
  // hidden in a collapsed dock. Reset on each new run.
  useEffect(() => {
    if (isExecuting) {
      autoShownResults.current = false;
      setOutputTab("output");
      return;
    }
    if (verdict && !autoShownResults.current) {
      autoShownResults.current = true;
      setOutputTab("results");
      outputRef.current?.expand();
    }
  }, [isExecuting, verdict]);

  // Start with both docks collapsed (until a frame/recording/verdict appears).
  useEffect(() => {
    browserRef.current?.collapse();
    outputRef.current?.collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBrowser = () => {
    const p = browserRef.current;
    if (!p) return;
    p.isCollapsed() ? p.expand() : p.collapse();
  };
  const toggleOutput = () => {
    const p = outputRef.current;
    if (!p) return;
    p.isCollapsed() ? p.expand() : p.collapse();
  };

  return (
    <div className="flex flex-col h-full bg-bg">
      <WorkspaceStatusBar
        isExecuting={isExecuting}
        elapsedTime={elapsedTime}
        verdict={verdict}
        onCancel={onCancel}
        onRunAgain={onRunAgain}
        onNewTest={onNewTest}
        browserOpen={browserOpen}
        onToggleBrowser={toggleBrowser}
        outputOpen={outputOpen}
        onToggleOutput={toggleOutput}
        showAllLogs={showAllLogs}
        onToggleShowAllLogs={() =>
          setShowAllLogs((v) => {
            const next = !v;
            try {
              localStorage.setItem("pw-show-all-logs", String(next));
            } catch {
              // ignore storage failures
            }
            return next;
          })
        }
      />

      <PromptBanner prompt={testInput} />

      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal">
          <Panel id="main" order={1} minSize={30}>
            <PanelGroup direction="vertical">
              <Panel id="timeline" order={1} minSize={25}>
                <ActivityTimeline messages={messages} isExecuting={isExecuting} showAll={showAllLogs} />
              </Panel>
              <PanelResizeHandle className="h-px bg-border data-[resize-handle-state=hover]:bg-accent data-[resize-handle-state=drag]:bg-accent transition-colors" />
              <Panel
                id="output"
                order={2}
                ref={outputRef}
                collapsible
                defaultSize={34}
                minSize={15}
                onCollapse={() => setOutputOpen(false)}
                onExpand={() => setOutputOpen(true)}
              >
                <OutputDock
                  messages={messages}
                  testInput={testInput}
                  usageMetadata={usageMetadata}
                  isExecuting={isExecuting}
                  isHistorical={isHistorical}
                  tab={outputTab}
                  onTabChange={setOutputTab}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          {isWeb && (
            <>
              <PanelResizeHandle className="w-px bg-border data-[resize-handle-state=hover]:bg-accent data-[resize-handle-state=drag]:bg-accent transition-colors" />
              <Panel
                id="browser"
                order={2}
                ref={browserRef}
                collapsible
                defaultSize={42}
                minSize={22}
                onCollapse={() => setBrowserOpen(false)}
                onExpand={() => setBrowserOpen(true)}
              >
                <BrowserDock
                  latestFrame={latestFrame}
                  recordingData={recordingData}
                  isExecuting={isExecuting}
                  maximized={maximized}
                  onToggleMaximize={() => setMaximized((m) => !m)}
                  onClose={() => browserRef.current?.collapse()}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
