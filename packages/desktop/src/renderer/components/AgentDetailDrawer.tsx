import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, Check, Circle, Copy, Loader2, Sparkles, X } from "lucide-react";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface AgentMetadata {
  name: string;
  displayName: string;
  tag?: string;
  description: string;
  category: string;
  model?: string;
  enabled: boolean;
  builtIn: boolean;
}

interface AgentFullDetail {
  name: string;
  displayName: string;
  tag?: string;
  description: string;
  category: string;
  model?: string;
  tools: string[];
  mcpServers: string[];
  skills: string[];
  prompt: string;
  enabled: boolean;
  builtIn: boolean;
}

interface SkillMetadata {
  name: string;
  description: string;
  tools?: string[];
}

interface SkillFullDetail {
  name: string;
  description: string;
  tools: string[];
  prompt: string;
}

// ─── Category colours (mirrors AgentsSkillsPanel) ────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string; iconBg: string }> = {
  "web-ui-testing": { bg: "bg-accent/15", text: "text-accent", iconBg: "bg-accent/10" },
  "api-testing": { bg: "bg-success/15", text: "text-success", iconBg: "bg-success/10" },
  "recording": { bg: "bg-purple-500/10", text: "text-purple-500 dark:text-purple-400", iconBg: "bg-purple-500/10" },
  "orchestration": { bg: "bg-surface-2", text: "text-text-muted", iconBg: "bg-surface-2" },
};
const DEFAULT_COLORS = { bg: "bg-surface-2", text: "text-text-muted", iconBg: "bg-surface-2" };

function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || DEFAULT_COLORS;
}

function getAgentBadge(name: string, displayName: string, tag?: string) {
  const isOrchestrator = name === "orchestrator";
  let label: string;
  if (tag) {
    label = tag;
  } else {
    const words = displayName.trim().split(/\s+/);
    label = words.slice(0, 2).join(" ");
  }
  if (isOrchestrator) {
    return {
      label,
      className:
        "bg-slate-100 text-slate-600 border border-slate-300 text-xs font-semibold px-1.5 py-0.5 rounded-full",
    };
  }
  return {
    label,
    className:
      "bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold px-1.5 py-0.5 rounded-full",
  };
}

// ─── Shared markdown renderer ─────────────────────────────────────────────────

function DrawerCodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
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
          fontSize: "0.8rem",
          border: "1px solid #E2E8F0",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

const markdownComponents = {
  h2({ children }: any) {
    return (
      <h2 className="text-sm font-semibold text-text mt-5 mb-2 pb-1 border-b border-border">
        {children}
      </h2>
    );
  },
  h3({ children }: any) {
    return (
      <h3 className="text-sm font-medium text-text-muted mt-3 mb-1">{children}</h3>
    );
  },
  ul({ children }: any) {
    return <ul className="list-disc list-inside space-y-0.5 my-1 text-sm text-text-muted">{children}</ul>;
  },
  li({ children }: any) {
    return <li className="leading-relaxed">{children}</li>;
  },
  p({ children }: any) {
    return <p className="text-sm text-text-muted leading-relaxed my-1">{children}</p>;
  },
  code({ node, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match;
    if (isInline) {
      return (
        <code className="bg-surface-2 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <DrawerCodeBlock language={match[1]}>
        {String(children).replace(/\n$/, "")}
      </DrawerCodeBlock>
    );
  },
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function Chip({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

function ShimmerLine({ wide }: { wide?: boolean }) {
  return (
    <div
      className={`h-3 rounded animate-pulse bg-surface-2 ${wide ? "w-3/4" : "w-1/2"}`}
    />
  );
}

function TabButton({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
        active
          ? "border-indigo-500 text-indigo-600 bg-surface-2"
          : "border-transparent text-text-muted hover:text-text-muted"
      }`}
    >
      {label}
    </button>
  );
}

// ─── AgentDetailDrawer ────────────────────────────────────────────────────────

interface AgentDetailDrawerProps {
  agent: AgentMetadata;
  isActive: boolean;
  onClose: () => void;
}

export function AgentDetailDrawer({ agent, isActive, onClose }: AgentDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "instructions">("overview");
  const [detail, setDetail] = useState<AgentFullDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const colors = getCategoryColors(agent.category);
  const badge = getAgentBadge(agent.name, agent.displayName, agent.tag);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setActiveTab("overview");
    window.jarvis.agent.get(agent.name).then((d: AgentFullDetail | null) => {
      setDetail(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [agent.name]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-[480px] bg-surface shadow-2xl z-50
                   flex flex-col transform transition-transform duration-300 ease-out translate-x-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.iconBg}`}>
              <Bot size={20} className={colors.text} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text">{agent.displayName}</h2>
                <span className={badge.className}>{badge.label}</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-[10px] text-lseg-blue font-medium whitespace-nowrap">
                    <Circle size={6} className="fill-lseg-blue" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">{agent.category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-muted hover:bg-surface-2 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-surface-2 flex-shrink-0">
          <TabButton
            id="overview"
            label="Overview"
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <TabButton
            id="instructions"
            label="How it works"
            active={activeTab === "instructions"}
            onClick={() => setActiveTab("instructions")}
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "overview" ? (
            <AgentOverviewContent agent={agent} detail={detail} loading={loading} isActive={isActive} />
          ) : (
            <InstructionsContent prompt={detail?.prompt ?? null} loading={loading} />
          )}
        </div>
      </div>
    </>
  );
}

function AgentOverviewContent({
  agent,
  detail,
  loading,
  isActive,
}: {
  agent: AgentMetadata;
  detail: AgentFullDetail | null;
  loading: boolean;
  isActive: boolean;
}) {
  const colors = getCategoryColors(agent.category);

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-sm text-text-muted leading-relaxed">{agent.description}</p>

      {/* Status row */}
      {isActive && (
        <div className="flex items-center gap-2 text-xs text-lseg-blue font-medium">
          <Circle size={8} className="fill-lseg-blue" />
          Currently active
        </div>
      )}

      {/* Metadata chips */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip label={agent.category} colorClass={`${colors.bg} ${colors.text}`} />
          {agent.builtIn && (
            <Chip label="Built-in" colorClass="bg-accent/15 text-accent" />
          )}
          {agent.model && (
            <Chip label={agent.model} colorClass="bg-surface-2 text-text-muted" />
          )}
        </div>

        {loading ? (
          <div className="space-y-2 pt-1">
            <ShimmerLine wide />
            <ShimmerLine />
            <ShimmerLine wide />
          </div>
        ) : detail ? (
          <div className="space-y-2.5">
            {/* Tools */}
            {detail.tools.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-text-muted w-20 flex-shrink-0 pt-0.5">Tools</span>
                <div className="flex flex-wrap gap-1">
                  <Chip
                    label={detail.tools.includes("*") ? "All tools" : `${detail.tools.length} tool${detail.tools.length !== 1 ? "s" : ""}`}
                    colorClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  />
                </div>
              </div>
            )}

            {/* MCP Servers */}
            {detail.mcpServers.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-text-muted w-20 flex-shrink-0 pt-0.5">MCP</span>
                <div className="flex flex-wrap gap-1">
                  {detail.mcpServers.map((s) => (
                    <Chip key={s} label={s} colorClass="bg-purple-500/10 text-purple-500 dark:text-purple-400" />
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {detail.skills.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-text-muted w-20 flex-shrink-0 pt-0.5">Skills</span>
                <div className="flex flex-wrap gap-1">
                  {detail.skills.map((s) => (
                    <Chip key={s} label={s} colorClass="bg-teal-50 text-teal-700" />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── SkillDetailDrawer ────────────────────────────────────────────────────────

interface SkillDetailDrawerProps {
  skill: SkillMetadata;
  onClose: () => void;
}

export function SkillDetailDrawer({ skill, onClose }: SkillDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "instructions">("overview");
  const [detail, setDetail] = useState<SkillFullDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setActiveTab("overview");
    window.jarvis.skill.get(skill.name).then((d: SkillFullDetail | null) => {
      setDetail(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [skill.name]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-[480px] bg-surface shadow-2xl z-50
                   flex flex-col transform transition-transform duration-300 ease-out translate-x-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-100">
              <Sparkles size={20} className="text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">{skill.name}</h2>
              <p className="text-xs text-text-muted">Skill</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-muted hover:bg-surface-2 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-surface-2 flex-shrink-0">
          <TabButton
            id="overview"
            label="Overview"
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <TabButton
            id="instructions"
            label="How it works"
            active={activeTab === "instructions"}
            onClick={() => setActiveTab("instructions")}
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "overview" ? (
            <SkillOverviewContent skill={skill} detail={detail} loading={loading} />
          ) : (
            <InstructionsContent prompt={detail?.prompt ?? null} loading={loading} />
          )}
        </div>
      </div>
    </>
  );
}

function SkillOverviewContent({
  skill,
  detail,
  loading,
}: {
  skill: SkillMetadata;
  detail: SkillFullDetail | null;
  loading: boolean;
}) {
  const toolCount = detail?.tools.length ?? skill.tools?.length ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted leading-relaxed">{skill.description}</p>

      {loading ? (
        <div className="space-y-2 pt-1">
          <ShimmerLine wide />
          <ShimmerLine />
        </div>
      ) : (
        toolCount > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-text-muted w-20 flex-shrink-0 pt-0.5">Tools</span>
            <Chip
              label={`${toolCount} tool${toolCount !== 1 ? "s" : ""}`}
              colorClass="bg-teal-50 text-teal-700"
            />
          </div>
        )
      )}
    </div>
  );
}

// ─── Shared: Instructions tab content ─────────────────────────────────────────

function InstructionsContent({
  prompt,
  loading,
}: {
  prompt: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!prompt) {
    return (
      <p className="text-sm text-text-muted text-center py-16">Instructions not available</p>
    );
  }

  return (
    <div className="prose prose-sm prose-gray max-w-none [&_li>p]:inline [&_li>p]:m-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {prompt}
      </ReactMarkdown>
    </div>
  );
}
