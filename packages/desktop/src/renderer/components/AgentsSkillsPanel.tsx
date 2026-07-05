import { Bot, Circle, Loader2, Sparkles, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentDetailDrawer, SkillDetailDrawer } from "./AgentDetailDrawer.js";

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

interface SkillMetadata {
  name: string;
  description: string;
  tools?: string[];
}

type MainTab = "agents" | "skills";
type SubTab = "built-in" | "marketplace";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; activeBorder: string; glowShadow: string; iconBg: string }> = {
  "web-ui-testing": { bg: "bg-accent/15", text: "text-accent", activeBorder: "border-accent", glowShadow: "shadow-blue-200/60", iconBg: "bg-accent/10" },
  "api-testing":    { bg: "bg-success/15", text: "text-success", activeBorder: "border-success/30", glowShadow: "shadow-green-200/60", iconBg: "bg-success/10" },
  "recording":      { bg: "bg-purple-500/10", text: "text-purple-500 dark:text-purple-400", activeBorder: "border-purple-500/30", glowShadow: "shadow-purple-200/60", iconBg: "bg-purple-500/10" },
  "orchestration":  { bg: "bg-surface-2", text: "text-text-muted", activeBorder: "border-border", glowShadow: "shadow-gray-200/60", iconBg: "bg-surface-2" },
};

const DEFAULT_COLORS = { bg: "bg-surface-2", text: "text-text-muted", activeBorder: "border-border", glowShadow: "shadow-gray-200/60", iconBg: "bg-surface-2" };

function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || DEFAULT_COLORS;
}

function getAgentBadge(name: string, displayName: string, tag?: string): { label: string; className: string } {
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
      className: "bg-slate-100 text-slate-600 border border-slate-300 text-xs font-semibold px-1.5 py-0.5 rounded-full",
    };
  }
  return {
    label,
    className: "bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold px-1.5 py-0.5 rounded-full",
  };
}

function AgentTile({ agent, isActive, onClick }: { agent: AgentMetadata; isActive: boolean; onClick: () => void }) {
  const colors = getCategoryColors(agent.category);
  const badge = getAgentBadge(agent.name, agent.displayName, agent.tag);

  return (
    <div
      onClick={onClick}
      className={`
        p-4 rounded-xl border-2 bg-surface-2 transition-all cursor-pointer
        hover:-translate-y-0.5 hover:shadow-md
        ${isActive
          ? `${colors.activeBorder} shadow-md ${colors.glowShadow}`
          : "border-border hover:border-border"
        }
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}>
            <Bot size={16} className={colors.text} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-text truncate">
                {agent.displayName}
              </span>
              {isActive && (
                <span className="flex items-center gap-1 text-[10px] text-lseg-blue font-medium whitespace-nowrap">
                  <Circle size={6} className="fill-lseg-blue" />
                  Active
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={badge.className}>{badge.label}</span>
      </div>

      {/* Description */}
      <p className="text-xs text-text-muted leading-relaxed mb-3">
        {agent.description}
      </p>

      {/* Footer badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${colors.bg} ${colors.text}`}>
          {agent.category}
        </span>
        {agent.builtIn && (
          <span className="text-[10px] px-1.5 py-0.5 bg-accent/15 text-accent rounded-md font-medium">
            Built-in
          </span>
        )}
        {agent.model && (
          <span className="text-[10px] px-1.5 py-0.5 bg-surface-2 text-text-muted rounded-md font-medium">
            {agent.model}
          </span>
        )}
      </div>
    </div>
  );
}

function SkillTile({ skill, onClick }: { skill: SkillMetadata; onClick: () => void }) {
  return (
    <div onClick={onClick} className="p-4 rounded-xl border-2 border-teal-200 bg-surface-2 hover:-translate-y-0.5 hover:shadow-md hover:shadow-teal-100/60 transition-all cursor-pointer">
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-teal-100">
          <Sparkles size={16} className="text-teal-600" />
        </div>
        <span className="text-sm font-semibold text-text truncate block">
          {skill.name}
        </span>
      </div>
      <p className="text-xs text-text-muted leading-relaxed mb-2">
        {skill.description}
      </p>
      {skill.tools && skill.tools.length > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded-md font-medium">
          {skill.tools.length} tool{skill.tools.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function MarketplacePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-8">
      <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
        <Store size={32} className="text-text-muted" />
      </div>
      <h3 className="text-base font-semibold text-text-muted mb-2">Coming Soon</h3>
      <p className="text-sm text-text-muted max-w-xs">
        The marketplace will let you browse and install community-built agents and skills.
      </p>
    </div>
  );
}

export function AgentsSkillsPanel() {
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>("agents");
  const [subTab, setSubTab] = useState<SubTab>("built-in");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentMetadata | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillMetadata | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      pollActiveAgent();
      if (agents.length === 0) loadData();
    }, 2000);
    return () => clearInterval(interval);
  }, [agents.length]);

  const loadData = async () => {
    try {
      const [agentList, skillList] = await Promise.all([
        window.jarvis.agent.list(),
        window.jarvis.skill.list(),
      ]);
      setAgents(agentList);
      setSkills(skillList);
    } catch (err) {
      console.error("Failed to load agents/skills:", err);
    } finally {
      setLoading(false);
    }
  };

  const pollActiveAgent = async () => {
    try {
      const active = await window.jarvis.agent.getActive();
      setActiveAgent(active);
    } catch {
      // ignore
    }
  };

  const categories = [...new Set(agents.map((a) => a.category))];
  const filteredAgents = selectedCategory
    ? agents.filter((a) => a.category === selectedCategory)
    : agents;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="px-6 py-4 border-b border-border bg-surface-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Bot size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text">Agents & Skills</h2>
            <p className="text-xs text-text-muted">Registered AI agents and capabilities</p>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 mt-4 bg-surface-2 rounded-lg p-1">
          <button
            onClick={() => setMainTab("agents")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              mainTab === "agents"
                ? "bg-surface-2 text-text shadow-sm"
                : "text-text-muted hover:text-text-muted"
            }`}
          >
            Agents
            <span className="ml-1.5 text-xs text-text-muted">({agents.length})</span>
          </button>
          <button
            onClick={() => setMainTab("skills")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              mainTab === "skills"
                ? "bg-surface-2 text-text shadow-sm"
                : "text-text-muted hover:text-text-muted"
            }`}
          >
            Skills
            <span className="ml-1.5 text-xs text-text-muted">({skills.length})</span>
          </button>
        </div>

        {/* Sub tabs */}
        <div className="flex gap-4 mt-3">
          <button
            onClick={() => setSubTab("built-in")}
            className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
              subTab === "built-in"
                ? "border-lseg-blue text-lseg-blue"
                : "border-transparent text-text-muted hover:text-text-muted"
            }`}
          >
            Built-in
          </button>
          <button
            onClick={() => setSubTab("marketplace")}
            className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
              subTab === "marketplace"
                ? "border-lseg-blue text-lseg-blue"
                : "border-transparent text-text-muted hover:text-text-muted"
            }`}
          >
            Marketplace
            <span className="ml-1.5 text-[10px] bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full">Soon</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {subTab === "marketplace" ? (
          <MarketplacePlaceholder />
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : mainTab === "agents" ? (
          <>
            {/* Category filter chips */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors font-medium ${
                    !selectedCategory
                      ? "bg-lseg-blue text-white"
                      : "bg-surface-2 text-text-muted hover:bg-surface-2"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors font-medium ${
                      selectedCategory === cat
                        ? "bg-lseg-blue text-white"
                        : "bg-surface-2 text-text-muted hover:bg-surface-2"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                <Bot size={32} className="mb-2" />
                <p className="text-sm">No agents registered</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredAgents.map((agent) => (
                  <AgentTile
                    key={agent.name}
                    agent={agent}
                    isActive={activeAgent === agent.name}
                    onClick={() => setSelectedAgent(agent)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Skills tab */
          skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted">
              <Sparkles size={32} className="mb-2" />
              <p className="text-sm">No skills loaded</p>
              <p className="text-xs mt-1 text-text-muted">Skills appear here when loaded by agents</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {skills.map((skill) => (
                <SkillTile key={skill.name} skill={skill} onClick={() => setSelectedSkill(skill)} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Detail drawers */}
      {selectedAgent && (
        <AgentDetailDrawer
          agent={selectedAgent}
          isActive={activeAgent === selectedAgent.name}
          onClose={() => setSelectedAgent(null)}
        />
      )}
      {selectedSkill && (
        <SkillDetailDrawer
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </div>
  );
}
