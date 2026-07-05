import { useState } from "react";
import { Circle, Square, FileUp, Info, ChevronDown } from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  isProcessing: boolean;
  actionCount: number;
  elapsedTime: number;
  currentMode?: string;
  onStartRecording: (mode: string, startUrl?: string) => void;
  onStopRecording: () => void;
  onLoadFeature: () => void;
}

/**
 * Recording controls for Workflow Observer persona
 */
export function RecordingControls({
  isRecording,
  isProcessing,
  actionCount,
  elapsedTime,
  currentMode,
  onStartRecording,
  onStopRecording,
  onLoadFeature,
}: RecordingControlsProps) {
  const [selectedMode, setSelectedMode] = useState<string>("standard");
  const [startUrl, setStartUrl] = useState<string>("");
  const [showModeInfo, setShowModeInfo] = useState(false);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  if (isRecording) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Circle className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
            </div>
            <div>
              <span className="text-danger font-medium">Recording...</span>
              <span className="ml-2 text-danger">
                {formatTime(elapsedTime)}
              </span>
            </div>
            <div className="text-sm text-danger">
              Actions: <span className="font-medium">{actionCount}</span>
            </div>
            {currentMode && (
              <div className="text-sm text-red-500 bg-danger/15 px-2 py-0.5 rounded">
                {currentMode}
              </div>
            )}
          </div>
          <button
            onClick={onStopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            <Square className="w-4 h-4 fill-white" />
            Stop Recording
          </button>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return null; // hidden while processing; the parent renders the processing state
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex flex-col gap-4">
        {/* Mode Selection */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-text-muted mb-1">
              Recording Mode
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  value={selectedMode}
                  onChange={(e) => {
                    console.log("Mode changed to:", e.target.value);
                    setSelectedMode(e.target.value);
                  }}
                  className="w-full h-10 px-3 pr-10 border border-border rounded-lg bg-surface-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
                >
                  <option value="standard">Standard</option>
                  <option value="detailed">Detailed</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              </div>
              <button
                onClick={() => setShowModeInfo(!showModeInfo)}
                className="p-2 text-text-muted hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
                title="Mode info"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-text-muted mb-1">
              Start URL (optional)
            </label>
            <input
              type="url"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full h-10 px-3 py-2 border border-border rounded-lg bg-surface-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
        </div>

        {/* Mode Info */}
        {showModeInfo && (
          <div className="bg-accent/10 border border-accent rounded-lg p-3">
            <p className="text-sm text-accent">
              {selectedMode === "standard" 
                ? "Captures essential interactions only (clicks, typing, navigation, form submissions). Best for most test scenarios."
                : "Captures everything including hovers, scrolls, focus events, and mouse movement. Use for complex scenarios or debugging."}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onStartRecording(selectedMode, startUrl || undefined)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            <Circle className="w-4 h-4 fill-white" />
            Start Observing
          </button>

          <span className="text-text-muted">or</span>

          <button
            onClick={onLoadFeature}
            className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface text-text border border-border rounded-lg font-medium transition-colors"
          >
            <FileUp className="w-4 h-4" />
            Load Recorded Feature File
          </button>
        </div>
      </div>
    </div>
  );
}
