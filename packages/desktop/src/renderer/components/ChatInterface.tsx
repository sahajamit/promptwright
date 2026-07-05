import type { CopilotReadiness } from "../hooks/useSession";
import type { ExecutionData, LogEntry, Message, Thread } from "../types";
import { ExecutionPanel } from "./ExecutionPanel";

interface ChatInterfaceProps {
  messages: Message[];
  currentResponse: string;
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onLog?: (log: LogEntry) => void;
  sessionKey?: string;
  onExecutionComplete?: (executionData: Partial<ExecutionData>) => Promise<void>;
  currentSession?: Thread | null;
  settingsVersion?: number;
  copilotReadiness?: CopilotReadiness;
  copilotError?: string | null;
  onRetryConnection?: () => void;
}

export function ChatInterface({
  sessionKey,
  onLog,
  onExecutionComplete,
  currentSession,
  settingsVersion,
  copilotReadiness,
  copilotError,
  onRetryConnection,
}: ChatInterfaceProps) {
  // Always render ExecutionPanel — the orchestrator handles routing to the right agent.
  // Full-bleed, fixed height: the ExecutionWorkspace owns its own internal scroll.
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <ExecutionPanel
        key={sessionKey}
        onLog={onLog}
        onExecutionComplete={onExecutionComplete}
        sessionExecutionData={currentSession?.executionData}
        settingsVersion={settingsVersion}
        copilotReadiness={copilotReadiness}
        copilotError={copilotError}
        onRetryConnection={onRetryConnection}
      />
    </div>
  );
}
