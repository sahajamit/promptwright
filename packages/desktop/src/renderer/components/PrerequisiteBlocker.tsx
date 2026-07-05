import { useMemo, useState } from "react";

interface CheckItem {
  ok: boolean;
  message: string;
  details?: string;
}

export interface PrerequisiteBlockerStatus {
  passed: boolean;
  checkedAt: number;
  cached: boolean;
  node: CheckItem;
  copilotCli: CheckItem;
  copilotAuth: CheckItem;
  fixCommands: string[];
}

interface PrerequisiteBlockerProps {
  status: PrerequisiteBlockerStatus;
  isChecking: boolean;
  onRecheck: () => Promise<void>;
}

function CheckRow({ title, item }: { title: string; item: CheckItem }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-text">{title}</p>
        <span
          className={`text-xs px-2 py-1 rounded ${
            item.ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
          }`}
        >
          {item.ok ? "PASS" : "FAIL"}
        </span>
      </div>
      <p className="mt-1 text-sm text-text-muted">{item.message}</p>
      {item.details ? <p className="mt-1 text-xs text-text-muted break-words">{item.details}</p> : null}
    </div>
  );
}

export function PrerequisiteBlocker({ status, isChecking, onRecheck }: PrerequisiteBlockerProps) {
  const commandBlock = useMemo(() => status.fixCommands.join("\n"), [status.fixCommands]);
  const [isPickingPath, setIsPickingPath] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathSuccess, setPathSuccess] = useState<string | null>(null);

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(commandBlock);
    } catch (error) {
      console.error("Failed to copy commands:", error);
    }
  };

  const handlePickFile = async () => {
    setIsPickingPath(true);
    setPathError(null);
    setPathSuccess(null);

    try {
      const pickedPath = await window.jarvis.prerequisites.pickCopilotFile();
      if (!pickedPath) {
        setIsPickingPath(false);
        return; // User cancelled
      }

      // Validate the picked path
      const validation = await window.jarvis.prerequisites.validateCopilotPath(pickedPath);
      if (!validation.valid) {
        setPathError(validation.error || "Invalid Copilot CLI path");
        setIsPickingPath(false);
        return;
      }

      // Save and recheck
      await window.jarvis.prerequisites.saveCopilotPath(pickedPath);
      setPathSuccess(`Copilot CLI configured: ${validation.version || "unknown version"}`);
      setIsPickingPath(false);

      // Trigger recheck to update UI
      await onRecheck();
    } catch (error) {
      setPathError(error instanceof Error ? error.message : String(error));
      setIsPickingPath(false);
    }
  };

  const handlePickFolder = async () => {
    setIsPickingPath(true);
    setPathError(null);
    setPathSuccess(null);

    try {
      const pickedPath = await window.jarvis.prerequisites.pickCopilotFolder();
      if (!pickedPath) {
        setIsPickingPath(false);
        return; // User cancelled
      }

      // Validate the picked path
      const validation = await window.jarvis.prerequisites.validateCopilotPath(pickedPath);
      if (!validation.valid) {
        setPathError(validation.error || "Invalid Copilot CLI folder");
        setIsPickingPath(false);
        return;
      }

      // Save and recheck
      await window.jarvis.prerequisites.saveCopilotPath(pickedPath);
      setPathSuccess(`Copilot CLI configured: ${validation.version || "unknown version"}`);
      setIsPickingPath(false);

      // Trigger recheck to update UI
      await onRecheck();
    } catch (error) {
      setPathError(error instanceof Error ? error.message : String(error));
      setIsPickingPath(false);
    }
  };

  const showCopilotPathPicker = !status.copilotCli.ok;

  return (
    <div className="h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-surface-2 rounded-xl shadow-lg border border-border p-6">
        <h1 className="text-xl font-semibold text-text">Prerequisites Not Met</h1>
        <p className="mt-2 text-sm text-text-muted">
          Promptwright cannot launch because required runtime dependencies are missing.
        </p>

        <div className="mt-5 grid gap-3">
          <CheckRow title="Node.js >= 22.x" item={status.node} />
          <CheckRow title="Copilot CLI Installed" item={status.copilotCli} />
          <CheckRow title="Copilot Authenticated (Advisory)" item={status.copilotAuth} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Fix Commands</h2>
            <button
              onClick={copyCommands}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface-2"
            >
              Copy
            </button>
          </div>
          <pre className="mt-2 bg-surface-2 text-text text-xs rounded p-3 overflow-x-auto">
{commandBlock}
          </pre>
        </div>

        {showCopilotPathPicker && (
          <div className="mt-5 p-4 bg-accent/10 border border-accent rounded-md">
            <h3 className="text-sm font-semibold text-text">Copilot CLI Not Detected</h3>
            <p className="mt-1 text-xs text-text-muted">
              If Copilot CLI is installed at a non-standard location, you can provide the path manually:
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void handlePickFile()}
                disabled={isPickingPath}
                className="px-3 py-1.5 text-xs rounded bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-60"
              >
                Select Executable File
              </button>
              <button
                onClick={() => void handlePickFolder()}
                disabled={isPickingPath}
                className="px-3 py-1.5 text-xs rounded bg-accent text-accent-fg hover:bg-accent/90 disabled:opacity-60"
              >
                Select Installation Folder
              </button>
            </div>
            {pathError && (
              <div className="mt-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded px-2 py-1">
                {pathError}
              </div>
            )}
            {pathSuccess && (
              <div className="mt-2 text-xs text-success bg-success/10 border border-success/30 rounded px-2 py-1">
                {pathSuccess}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => void onRecheck()}
            disabled={isChecking}
            className="px-4 py-2 rounded bg-lseg-blue text-white disabled:opacity-60"
          >
            {isChecking ? "Checking..." : "Recheck"}
          </button>
          <p className="text-xs text-text-muted">
            Last check: {new Date(status.checkedAt).toLocaleString()} {status.cached ? "(cached)" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

