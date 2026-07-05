import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";

interface GherkinPreviewProps {
  gherkin: string;
  isLoading?: boolean;
  onExport?: () => void;
  showExportButton?: boolean;
}

/**
 * Gherkin syntax highlighting component
 */
export function GherkinPreview({
  gherkin,
  isLoading,
  onExport,
  showExportButton = true,
}: GherkinPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(gherkin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-3/4 mb-2" />
        <div className="h-4 bg-surface-2 rounded w-1/2 mb-2" />
        <div className="h-4 bg-surface-2 rounded w-5/6 mb-2" />
        <div className="h-4 bg-surface-2 rounded w-2/3" />
      </div>
    );
  }

  return (
    <div className="relative bg-surface rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-2 border-b border-border">
        <span className="text-sm text-text-muted font-medium">Gherkin Preview</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          {showExportButton && onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent hover:bg-accent/90 text-accent-fg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 overflow-auto max-h-[500px]">
        <pre className="text-sm font-mono leading-relaxed">
          <code>
            {highlightGherkin(gherkin)}
          </code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Simple Gherkin syntax highlighting
 */
function highlightGherkin(text: string): React.ReactNode {
  const lines = text.split("\n");

  return lines.map((line, index) => {
    const trimmed = line.trim();

    // Feature line
    if (trimmed.startsWith("Feature:")) {
      return (
        <div key={index} className="text-purple-400">
          <span className="text-purple-500 font-bold">Feature:</span>
          {trimmed.slice(8)}
        </div>
      );
    }

    // Scenario/Scenario Outline
    if (trimmed.startsWith("Scenario Outline:") || trimmed.startsWith("Scenario:")) {
      const keyword = trimmed.startsWith("Scenario Outline:") ? "Scenario Outline:" : "Scenario:";
      return (
        <div key={index} className="text-cyan-400">
          <span className="text-cyan-500 font-bold">{keyword}</span>
          {trimmed.slice(keyword.length)}
        </div>
      );
    }

    // Background
    if (trimmed.startsWith("Background:")) {
      return (
        <div key={index} className="text-cyan-400">
          <span className="text-cyan-500 font-bold">Background:</span>
          {trimmed.slice(11)}
        </div>
      );
    }

    // Examples
    if (trimmed.startsWith("Examples:")) {
      return (
        <div key={index} className="text-orange-400">
          <span className="text-orange-500 font-bold">Examples:</span>
          {trimmed.slice(9)}
        </div>
      );
    }

    // Step keywords
    const stepKeywords = ["Given", "When", "Then", "And", "But"];
    for (const keyword of stepKeywords) {
      if (trimmed.startsWith(keyword + " ")) {
        const indent = line.match(/^\s*/)?.[0] || "";
        const rest = trimmed.slice(keyword.length + 1);
        return (
          <div key={index} className="text-text">
            {indent}
            <span className="text-green-500 font-bold">{keyword}</span>
            <span className="text-text"> {highlightStepContent(rest)}</span>
          </div>
        );
      }
    }

    // Tags
    if (trimmed.startsWith("@")) {
      return (
        <div key={index} className="text-blue-400">
          {line}
        </div>
      );
    }

    // Comments
    if (trimmed.startsWith("#")) {
      return (
        <div key={index} className="text-text-muted italic">
          {line}
        </div>
      );
    }

    // Table rows
    if (trimmed.startsWith("|")) {
      return (
        <div key={index} className="text-yellow-300">
          {line}
        </div>
      );
    }

    // Description or other text
    return (
      <div key={index} className="text-text-muted">
        {line}
      </div>
    );
  });
}

/**
 * Highlight quoted strings and placeholders in step content
 */
function highlightStepContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Match quoted strings and <placeholders>
  const regex = /("[^"]*")|(<[^>]+>)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add highlighted match
    if (match[1]) {
      // Quoted string
      parts.push(
        <span key={match.index} className="text-amber-400">
          {match[1]}
        </span>
      );
    } else if (match[2]) {
      // Placeholder
      parts.push(
        <span key={match.index} className="text-pink-400">
          {match[2]}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
