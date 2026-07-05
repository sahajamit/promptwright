import {
  Bot,
  HelpCircle,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  Settings,
  Video,
} from "lucide-react";
import logoUrl from "../assets/logo.png";
import { ThemeToggle } from "./ThemeToggle";

export type RightView = "chat" | "agents-skills" | "recording" | "settings" | "help";
export type ToolBarAction = "toggle-chat-history" | "agents-skills" | "recording" | "settings" | "help" | "toggle-activity";

interface ToolBarProps {
  rightView: RightView;
  showChatHistory: boolean;
  showLogs: boolean;
  onAction: (action: ToolBarAction) => void;
  isConnected: boolean;
}

const TOOLBAR_ITEMS: { action: ToolBarAction; icon: typeof Bot; label: string }[] = [
  { action: "toggle-chat-history", icon: MessageSquare, label: "Chat" },
  { action: "agents-skills", icon: Bot, label: "Agents & Skills" },
  { action: "recording", icon: Video, label: "Record" },
  { action: "settings", icon: Settings, label: "Settings" },
  { action: "help", icon: HelpCircle, label: "Help" },
];

export function ToolBar({ rightView, showChatHistory, showLogs, onAction, isConnected }: ToolBarProps) {
  const isChatActive = showChatHistory && rightView === "chat";

  const isItemActive = (action: ToolBarAction): boolean => {
    if (action === "toggle-chat-history") return isChatActive;
    return rightView === action;
  };

  return (
    <div className="w-14 bg-surface flex flex-col items-center gap-1 border-r border-border titlebar-drag">
      {/* macOS traffic light spacer — prevents overlap with close/minimize/maximize buttons */}
      <div className="w-full h-8 flex-shrink-0" />

      {/* App logo */}
      <div className="w-9 h-9 mb-1 flex items-center justify-center titlebar-no-drag">
        <img src={logoUrl} alt="Promptwright" className="w-7 h-7" />
      </div>

      <div className="w-7 border-t border-border mb-1" />

      {/* Panel toggle buttons */}
      {TOOLBAR_ITEMS.map((item) => {
        const isActive = isItemActive(item.action);
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            onClick={() => onAction(item.action)}
            className={`
              w-10 h-10 flex items-center justify-center rounded-lg transition-all titlebar-no-drag
              ${isActive
                ? "bg-surface-2 text-accent border border-accent/30 shadow-sm"
                : "text-text-muted hover:text-accent hover:bg-surface-2 border border-transparent"
              }
            `}
            title={item.label}
          >
            <Icon size={20} />
          </button>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Activity log toggle */}
      <button
        onClick={() => onAction("toggle-activity")}
        className={`
          w-10 h-10 flex items-center justify-center rounded-lg transition-all titlebar-no-drag mb-1
          ${showLogs
            ? "bg-surface-2 text-accent border border-accent/30 shadow-sm"
            : "text-text-muted hover:text-accent hover:bg-surface-2 border border-transparent"
          }
        `}
        title="Activity Logs"
      >
        {showLogs ? <PanelRightClose size={20} /> : <PanelRight size={20} />}
      </button>

      {/* Version + Connection indicator */}
      <div className="mb-3 flex flex-col items-center gap-1">
        <span className="text-[8px] text-text-muted mb-0.5">v{__APP_VERSION__}</span>
        <div
          className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-danger"}`}
          title={isConnected ? "Connected" : "Disconnected"}
        />
        <span className="text-[9px] text-text-muted">
          {isConnected ? "On" : "Off"}
        </span>
      </div>
    </div>
  );
}
