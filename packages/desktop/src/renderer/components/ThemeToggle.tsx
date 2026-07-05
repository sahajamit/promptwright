import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Theme toggle (dark <-> light). Lives in the ToolBar bottom cluster so it's
 * reachable from every view.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors titlebar-no-drag text-text-muted hover:text-text hover:bg-surface-2"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
