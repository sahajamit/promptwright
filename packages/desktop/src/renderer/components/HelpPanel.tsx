import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Copy,
  Check,
} from "lucide-react";

// Load all markdown files at build time
const docModules = import.meta.glob("@user-docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface DocTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: DocTreeNode[];
  order: number;
}

// Extract title from first "# Title" line, or humanize filename
function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1];
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Humanize folder name
function humanizeName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Folder ordering: controls sidebar display order
const FOLDER_ORDER: Record<string, number> = {
  "getting-started": 0,
  features: 1,
  troubleshooting: 2,
};

// File ordering within folders
const FILE_ORDER: Record<string, number> = {
  "index.md": 0,
  "quick-start.md": 1,
  "writing-tests.md": 2,
  "chat-and-testing.md": 0,
  "agents.md": 1,
  "recording.md": 2,
  "settings.md": 3,
  "sessions.md": 4,
  "common-issues.md": 0,
};

function buildDocTree(modules: Record<string, string>): {
  tree: DocTreeNode[];
  indexPath: string | null;
} {
  const root: Map<string, DocTreeNode> = new Map();
  let indexPath: string | null = null;

  // Find common prefix to strip
  const keys = Object.keys(modules);
  if (keys.length === 0) return { tree: [], indexPath: null };

  // Strip the glob prefix (everything up to the user-docs content)
  const stripPrefix = (key: string) => {
    // Keys look like "/user-docs/getting-started/foo.md" or similar
    const parts = key.split("/");
    // Find "user-docs" segment and take everything after
    const idx = parts.findIndex((p) => p === "user-docs");
    return idx >= 0 ? parts.slice(idx + 1).join("/") : key;
  };

  for (const [key, content] of Object.entries(modules)) {
    const relativePath = stripPrefix(key);
    const segments = relativePath.split("/");

    // Top-level index.md
    if (segments.length === 1 && segments[0] === "index.md") {
      indexPath = key;
      continue; // Don't show index.md in nav — it's the default page
    }

    if (segments.length === 1) {
      // Top-level file (non-index)
      root.set(key, {
        name: extractTitle(content, segments[0]),
        path: key,
        type: "file",
        order: FILE_ORDER[segments[0]] ?? 99,
      });
      continue;
    }

    // Nested file: ensure folder exists
    const folderName = segments[0];
    const fileName = segments[segments.length - 1];

    if (!root.has(folderName)) {
      root.set(folderName, {
        name: humanizeName(folderName),
        path: folderName,
        type: "folder",
        children: [],
        order: FOLDER_ORDER[folderName] ?? 99,
      });
    }

    const folder = root.get(folderName)!;
    folder.children!.push({
      name: extractTitle(content, fileName),
      path: key,
      type: "file",
      order: FILE_ORDER[fileName] ?? 99,
    });
  }

  // Sort children within folders
  for (const node of root.values()) {
    if (node.children) {
      node.children.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    }
  }

  // Sort root: folders first, then by order
  const tree = Array.from(root.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.order - b.order || a.name.localeCompare(b.name);
  });

  return { tree, indexPath };
}

function NavTreeNode({
  node,
  selectedPath,
  onSelect,
  expandedFolders,
  onToggleFolder,
}: {
  node: DocTreeNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}) {
  if (node.type === "file") {
    const isActive = selectedPath === node.path;
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={`
          w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left transition-all
          ${isActive
            ? "bg-surface-2 text-lseg-blue border border-lseg-blue/30 shadow-sm font-medium"
            : "text-text-muted hover:text-text hover:bg-surface-2 border border-transparent"
          }
        `}
      >
        <FileText size={14} className="flex-shrink-0" />
        <span className="truncate" title={node.name}>{node.name}</span>
      </button>
    );
  }

  const isExpanded = expandedFolders.has(node.path);

  return (
    <div>
      <button
        onClick={() => onToggleFolder(node.path)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-text rounded-md hover:bg-surface-2 transition-all"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="flex-shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen size={14} className="flex-shrink-0 text-text-muted" />
        ) : (
          <Folder size={14} className="flex-shrink-0 text-text-muted" />
        )}
        <span className="font-medium truncate">{node.name}</span>
      </button>
      {isExpanded && node.children && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <NavTreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-surface-2 border border-border text-text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-2"
        title="Copy code"
      >
        {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </button>
      <SyntaxHighlighter
        style={oneLight}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          fontSize: "0.875rem",
          border: "1px solid #E2E8F0",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

export function HelpPanel() {
  const { tree, indexPath } = useMemo(() => buildDocTree(docModules), []);

  const [selectedPath, setSelectedPath] = useState<string>(indexPath || "");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // All folders expanded by default
    return new Set(tree.filter((n) => n.type === "folder").map((n) => n.path));
  });
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset scroll on doc change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [selectedPath]);

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const content = selectedPath ? docModules[selectedPath] || "" : "";

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-60 bg-surface-2 border-r border-border flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-text-muted">
            <BookOpen size={18} />
            <span className="font-semibold text-sm">Documentation</span>
          </div>
        </div>

        {/* Nav tree */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {indexPath && (
            <button
              onClick={() => setSelectedPath(indexPath)}
              className={`
                w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left transition-all
                ${selectedPath === indexPath
                  ? "bg-surface-2 text-lseg-blue border border-lseg-blue/30 shadow-sm font-medium"
                  : "text-text-muted hover:text-text hover:bg-surface-2 border border-transparent"
                }
              `}
            >
              <BookOpen size={14} className="flex-shrink-0" />
              <span className="truncate">Welcome</span>
            </button>
          )}
          {tree.map((node) => (
            <NavTreeNode
              key={node.path}
              node={node}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto prose prose-gray prose-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const isInline = !match;

                if (isInline) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }

                return (
                  <CodeBlock language={match[1]}>
                    {String(children).replace(/\n$/, "")}
                  </CodeBlock>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
