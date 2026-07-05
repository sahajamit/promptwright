import { Bot, Circle, Folder, Loader2, Plus } from "lucide-react";

interface HeaderProps {
  workDir: string;
  isConnected: boolean;
  onPickFolder: () => void;
  onNewChat: () => void;
  isCreatingSession?: boolean;
  activeAgentName?: string | null;
}

export function Header({
  workDir,
  isConnected,
  onPickFolder,
  onNewChat,
  isCreatingSession = false,
  activeAgentName,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border shadow-sm titlebar-drag">
      {/* Left: Title and connection */}
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold bg-brand-gradient bg-clip-text text-transparent">Promptwright</span>

        {/* Connection status */}
        <div className="flex items-center gap-1.5 ml-2">
          <Circle
            size={8}
            className={isConnected ? "fill-success text-success" : "fill-danger text-danger"}
          />
          <span className="text-xs text-text-muted">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Active agent indicator */}
        {activeAgentName && (
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-accent/10 rounded-full">
            <Bot size={12} className="text-accent" />
            <span className="text-xs text-accent font-medium">{activeAgentName}</span>
          </div>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 titlebar-no-drag">
        {/* New chat/test button */}
        <button
          onClick={onNewChat}
          disabled={isCreatingSession}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-accent-fg bg-brand-gradient hover:opacity-90 rounded-lg transition-opacity shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title="Start new test"
        >
          {isCreatingSession ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          <span>New Test</span>
        </button>

        {/* Working directory */}
        <button
          onClick={onPickFolder}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-text bg-surface-2 hover:bg-border rounded-lg transition-colors"
        >
          <Folder size={16} />
          <span className="max-w-[200px] truncate">
            {workDir ? workDir.split("/").pop() : "Select folder"}
          </span>
        </button>
      </div>
    </header>
  );
}
