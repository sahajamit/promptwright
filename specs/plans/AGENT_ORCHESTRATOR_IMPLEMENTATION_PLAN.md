# Agent Orchestration Architecture - Implementation Plan

## Context

JARVIS-AI currently uses a persona-based architecture where personas (Manual Test Execution, Record & Repeat, API Test Execution) are static TypeScript configurations of system prompts + MCP servers. The user manually selects personas. This plan transforms JARVIS-AI into a hybrid orchestrator architecture where:

- An **orchestrator agent** (high-capability model) classifies intent and routes to specialized sub-agents
- Sub-agents run in **dedicated Copilot SDK sessions** with their own configs
- Agent definitions use **`.agent.md` files** (YAML frontmatter + markdown body)
- The UI gains a **VS Code-style left toolbar** replacing the header-based sidebar/activity toggles
- The persona system is **replaced** by the agent system

## Key SDK Findings

The Copilot SDK (`@github/copilot-sdk`) natively supports:
- `SessionConfig.customAgents: CustomAgentConfig[]` - agent definitions with name, prompt, mcpServers, tools
- `SessionConfig.tools: Tool[]` - custom tools via `defineTool()` with Zod schemas
- `SessionConfig.mcpServers: Record<string, MCPServerConfig>` - per-session MCP config
- `SessionConfig.skillDirectories: string[]` - skill loading from directories
- `session.sendAndWait()` - synchronous prompt execution (perfect for orchestrator → sub-agent delegation)
- `session.on(handler)` - event subscription per session
- `session.destroy()` - cleanup
- Multiple concurrent sessions from one `CopilotClient`

## Design Decisions (Confirmed)

1. **Auto-route by default**: Orchestrator LLM auto-classifies intent and routes. User can override with `--agent` flag (CLI) or agent selection (UI).
2. **Clean break from personas**: Remove persona system entirely. Migrate all persona prompts to `.agent.md` files. Config auto-migrates on first load.
3. **Custom frontmatter parser**: Simple regex-based YAML parser (~30 lines) instead of adding `gray-matter` dependency.

## Implementation Order

Phase 1 (Core) and Phase 2 (Desktop UI) will be implemented in this order to minimize risk:

### Step 1: Agent Types & Parser (packages/core)
### Step 2: Skill Types & Parser (packages/core)
### Step 3: Built-in Agent Definitions (.agent.md files)
### Step 4: Agent Registry
### Step 5: Skill Manager
### Step 6: Session Manager (multi-session + event proxy)
### Step 7: Orchestrator Tools (route_to_agent, list_agents)
### Step 8: Orchestrator Agent
### Step 9: JarvisClient Refactor (agent-based init)
### Step 10: Config System Updates
### Step 11: Core Exports Update
### Step 12: Desktop IPC & Preload Updates
### Step 13: Desktop Main Process Integration
### Step 14: Left Toolbar + Side Panel Components
### Step 15: Header Simplification
### Step 16: Agent Management Panel
### Step 17: Activity Logs Agent Attribution
### Step 18: Settings Inline Panel
### Step 19: App.tsx Layout Refactor

---

## Step 1: Agent Types & Parser

**Files to create:**
- `packages/core/src/agents/types.ts`
- `packages/core/src/agents/parser.ts`

**Agent types:**
```typescript
interface AgentDefinition {
  name: string;           // e.g. "pw-mcp-agent"
  displayName: string;    // e.g. "Playwright MCP Agent"
  description: string;
  model?: string;         // e.g. "claude-sonnet-4"
  tools?: string[];       // tool names or ["*"]
  category: string;       // e.g. "web-ui-testing"
  mcpServers?: Record<string, MCPServerConfig>;
  skills?: string[];      // skill names to inject
  prompt: string;         // full system prompt (markdown body)
  enabled: boolean;
  builtIn: boolean;       // true for built-in, false for external
  filePath?: string;      // source .agent.md path
}

interface AgentMetadata {
  name: string;
  displayName: string;
  description: string;
  category: string;
  model?: string;
  enabled: boolean;
  builtIn: boolean;
}
```

**Parser:** Custom regex-based YAML frontmatter parser (~30 lines). Extract YAML frontmatter → validate required fields → combine with markdown body as prompt.

---

## Step 2: Skill Types & Parser

**Files to create:**
- `packages/core/src/skills/types.ts`
- `packages/core/src/skills/parser.ts`

**Skill types:**
```typescript
interface SkillDefinition {
  name: string;
  description: string;
  tools?: string[];
  prompt: string;         // SKILL.md body
  dirPath: string;        // directory containing SKILL.md
}
```

**Parser:** Reads `SKILL.md` from skill directories. Same YAML frontmatter + markdown body pattern.

---

## Step 3: Built-in Agent Definitions

**Files to create in `packages/core/src/agents/built-in/`:**
- `pw-mcp.agent.md` - migrated from `MANUAL_TEST_EXECUTION_PERSONA` (MCP mode)
- `pw-cli.agent.md` - migrated from manual-test-execution (CLI mode)
- `api-test.agent.md` - migrated from `API_TEST_EXECUTION_SYSTEM_PROMPT`
- `workflow-observer.agent.md` - migrated from `RECORD_AND_REPEAT_PERSONA`
- `orchestrator.agent.md` - new orchestrator agent

Each agent.md migrates the existing persona's system prompt into the markdown body and the metadata into YAML frontmatter.

---

## Step 4: Agent Registry

**File to create:** `packages/core/src/agents/registry.ts`

```typescript
class AgentRegistry {
  private agents: Map<string, AgentDefinition> = new Map();

  async loadBuiltInAgents(): Promise<void>;      // scan built-in/ directory
  async loadExternalAgents(dir: string): Promise<void>; // scan ~/.jarvis-ai/agents/
  register(agent: AgentDefinition): void;
  unregister(name: string): void;
  get(name: string): AgentDefinition | undefined;
  getAll(): AgentDefinition[];
  getByCategory(category: string): AgentDefinition[];
  getMetadata(): AgentMetadata[];
}
```

Uses the parser from Step 1 to load `.agent.md` files.

---

## Step 5: Skill Manager

**File to create:** `packages/core/src/skills/manager.ts`

```typescript
class SkillManager {
  async loadSkills(directories: string[]): Promise<void>;
  get(name: string): SkillDefinition | undefined;
  getAll(): SkillDefinition[];
}
```

---

## Step 6: Session Manager

**File to create:** `packages/core/src/agents/session-manager.ts`

This is the **critical component** that manages multiple Copilot SDK sessions and acts as an event proxy.

```typescript
class AgentSessionManager extends EventEmitter {
  private client: CopilotClient;
  private orchestratorSession: CopilotSession | null = null;
  private activeAgentSession: CopilotSession | null = null;
  private activeAgentName: string | null = null;

  constructor(client: CopilotClient);

  // Create orchestrator session (persistent)
  async createOrchestratorSession(config: SessionConfig): Promise<CopilotSession>;

  // Spawn sub-agent session (ephemeral)
  async spawnAgentSession(agent: AgentDefinition, mcpServersOverride?: Record<string, any>): Promise<CopilotSession>;

  // Destroy active sub-agent session
  async destroyAgentSession(): Promise<void>;

  // Get active agent info
  getActiveAgentName(): string | null;

  // Event proxy: subscribes to active session events, re-emits with agent metadata
  // through "jarvis-event" so existing UI receives events unchanged
}
```

**Key design: Event Proxy Pattern**
- When a sub-agent session is spawned, the manager subscribes to its events
- Events are tagged with `_agentName` and `_agentDisplayName` (optional metadata)
- Events are re-emitted through the same `jarvis-event` channel
- Existing `useTestExecution`, `useChat`, `LiveExecutionLog` continue to work unchanged
- When switching agents, unsubscribe from old → subscribe to new

---

## Step 7: Orchestrator Tools

**Files to create:**
- `packages/core/src/agents/tools/route-to-agent.ts`
- `packages/core/src/agents/tools/list-agents.ts`

```typescript
// route-to-agent tool - called by orchestrator LLM to delegate work
const routeToAgentTool = defineTool("route_to_agent", {
  description: "Route the current task to a specialized agent for execution",
  parameters: z.object({
    agentName: z.string().describe("Name of the agent to route to"),
    taskDescription: z.string().describe("What the agent should do"),
  }),
  handler: async ({ agentName, taskDescription }, invocation) => {
    // Look up agent from registry
    // Spawn sub-agent session via SessionManager
    // Send taskDescription to sub-agent via sendAndWait
    // Return result to orchestrator for evaluation
  }
});

// list-agents tool - lets orchestrator see available agents
const listAgentsTool = defineTool("list_available_agents", {
  description: "List all available specialized agents",
  parameters: z.object({}),
  handler: async () => {
    return registry.getMetadata();
  }
});
```

---

## Step 8: Orchestrator Agent

**File to create:** `packages/core/src/agents/orchestrator.ts`

```typescript
class OrchestratorAgent {
  constructor(
    private registry: AgentRegistry,
    private sessionManager: AgentSessionManager,
    private options: OrchestratorOptions
  );

  // Initialize orchestrator session
  async initialize(): Promise<void>;

  // Send user query through orchestrator → routes to sub-agent → returns result
  async processQuery(prompt: string): Promise<void>;

  // Abort current execution
  async abort(): Promise<void>;

  // Cleanup
  async destroy(): Promise<void>;
}
```

The orchestrator creates its own Copilot session with:
- A system prompt listing all registered agents
- `route_to_agent` and `list_available_agents` as custom tools
- The high-capability model (configurable, default: claude-sonnet-4-5)

When a user sends a query:
1. Orchestrator's LLM classifies intent
2. LLM calls `route_to_agent(agentName, taskDescription)` tool
3. Tool handler spawns sub-agent session, sends task, waits for result
4. Result returns to orchestrator for evaluation
5. Orchestrator either concludes or routes again

---

## Step 9: JarvisClient Refactor

**File to modify:** `packages/core/src/client.ts`

Refactor to support two modes:
1. **Orchestrator mode** (default): Creates OrchestratorAgent, routes through it
2. **Direct agent mode**: Bypasses orchestrator, talks directly to a specific agent (for `--agent` CLI flag)

Key changes:
- Replace single `CopilotSession` with `OrchestratorAgent` + `AgentSessionManager`
- `start()` now initializes registry, skill manager, orchestrator
- `sendMessage()` delegates to orchestrator's `processQuery()`
- Event forwarding from SessionManager → JarvisClient's `emitEvent()`
- Keep `onEvent()` API identical for backward compatibility
- Add `getRegistry()`, `getActiveAgent()` methods

**Critical: The public API of JarvisClient (sendMessage, onEvent, abort, stop) MUST remain compatible** so the desktop main process doesn't need major IPC restructuring.

---

## Step 10: Config System Updates

**File to modify:** `packages/core/src/config/types.ts` and related config files

Add new config sections:
```yaml
orchestrator:
  model: "claude-sonnet-4-5-20250514"
  autoRoute: true

agents:
  pw-mcp-agent:
    model: "claude-sonnet-4"
    enabled: true
  # ... per-agent overrides

skills:
  directories:
    - "~/.jarvis-ai/skills"

# Keep existing browser config
browser:
  headless: true
  automationMode: "playwright-mcp"
```

Backward-compatible: if old `personas:` section exists, auto-migrate to `agents:`.

---

## Step 11: Core Exports Update

**File to modify:** `packages/core/src/index.ts`

Add exports for:
- Agent types, registry, parser
- Skill types, manager
- OrchestratorAgent
- AgentSessionManager
- Keep all existing exports (recording, CDP, gherkin, etc.)

---

## Step 12: Desktop IPC & Preload Updates

**Files to modify:**
- `packages/desktop/src/preload.ts`
- `packages/desktop/src/main/index.ts` (IPC handlers)

New IPC channels:
```typescript
"agent:list"            → AgentMetadata[]
"agent:getActive"       → string | null
"agent:configure"       → void
"orchestrator:getState" → { model, autoRoute }
"skill:list"            → SkillMetadata[]
```

Enhanced events: Add optional `_agentName`, `_agentDisplayName` to existing JarvisEvent types (additive, non-breaking).

New event types added to `jarvis-event` channel:
```typescript
| { type: "orchestrator:classifying" }
| { type: "orchestrator:agent_selected"; agent: string; reason: string; model: string }
| { type: "orchestrator:handoff"; from: string; to: string }
| { type: "agent:executing"; agent: string; agentDisplayName: string }
| { type: "agent:complete"; agent: string; result: any }
```

**Preserve** all existing IPC channels and preload API. The `window.jarvis` API is extended, not replaced.

---

## Step 13: Desktop Main Process Integration

**File to modify:** `packages/desktop/src/main/index.ts`

Key changes:
- Replace `personaManager` with `agentRegistry`
- Replace persona-based client initialization with agent-based
- `initializeClient()` now creates `JarvisClient` which internally creates orchestrator
- MCP server config building (the complex `buildMCPServersConfig()`) is now driven by agent definitions
- Event forwarding: `jarvisClient.onEvent()` already works — SessionManager proxies events through it
- Add IPC handlers for new agent/skill/orchestrator channels
- **Keep recording system intact** — it's agent-independent (CDP-based)

---

## Step 14: Left Toolbar + Side Panel Components

**Files to create:**
- `packages/desktop/src/renderer/components/ToolBar.tsx`
- `packages/desktop/src/renderer/components/SidePanel.tsx`

**ToolBar:** Persistent left activity bar with icons:
- Chat History, Agents, Skills, Activity, Settings
- Click toggles corresponding side panel
- Expand/collapse (icon-only vs icon+label)
- Active icon highlight with accent border
- Keyboard shortcut: Cmd+B / Ctrl+B

**SidePanel:** Generic container rendering active panel content.

---

## Step 15: Header Simplification

**File to modify:** `packages/desktop/src/renderer/components/Header.tsx`

Remove: sidebar toggle, activity toggle, settings button
Keep: Logo + connection status, active agent indicator, New Test button, folder picker

---

## Step 16: Agent Management Panel

**File to create:** `packages/desktop/src/renderer/components/AgentPanel.tsx`

Shows registered agents in a list with:
- Status badges (enabled/disabled)
- Model info per agent
- Built-in vs external badges
- Category filters

---

## Step 17: Activity Logs Agent Attribution

**File to modify:** `packages/desktop/src/renderer/components/ActivityLogs.tsx`
**File to modify:** `packages/desktop/src/renderer/types.ts`

Extend `LogEntry` with optional `agentName`, `agentDisplayName`, `agentCategory`.
Add agent badge on each tile, colored left borders, section separators on agent handoff.
Backward compatible: tiles without agent metadata render unchanged.

---

## Step 18: Settings Inline Panel

**File to modify:** `packages/desktop/src/renderer/components/Settings.tsx`

Convert from modal to inline panel component.
Add: per-agent model config, orchestrator model, agent/skill enable/disable.

---

## Step 19: App.tsx Layout Refactor

**File to modify:** `packages/desktop/src/renderer/App.tsx`

New layout: `ToolBar | SidePanel | MainContent`
- Replace `showSidebar`/`showLogs` state with `activePanel: PanelType | null`
- Remove PersonaModal (replaced by agent system)
- Remove persona selection logic → agent auto-routing via orchestrator
- Keep session management, execution, recording flows

---

## Critical Files Summary

### Core (create)
- `packages/core/src/agents/types.ts`
- `packages/core/src/agents/parser.ts`
- `packages/core/src/agents/registry.ts`
- `packages/core/src/agents/session-manager.ts`
- `packages/core/src/agents/orchestrator.ts`
- `packages/core/src/agents/tools/route-to-agent.ts`
- `packages/core/src/agents/tools/list-agents.ts`
- `packages/core/src/agents/built-in/*.agent.md` (5 files)
- `packages/core/src/skills/types.ts`
- `packages/core/src/skills/parser.ts`
- `packages/core/src/skills/manager.ts`

### Core (modify)
- `packages/core/src/client.ts` - Agent-based init
- `packages/core/src/types.ts` - Extended events
- `packages/core/src/config/types.ts` - Agent/skill config
- `packages/core/src/index.ts` - New exports

### Desktop (create)
- `packages/desktop/src/renderer/components/ToolBar.tsx`
- `packages/desktop/src/renderer/components/SidePanel.tsx`
- `packages/desktop/src/renderer/components/AgentPanel.tsx`

### Desktop (modify)
- `packages/desktop/src/main/index.ts` - Agent integration, new IPC handlers
- `packages/desktop/src/preload.ts` - New IPC channels
- `packages/desktop/src/renderer/App.tsx` - New layout
- `packages/desktop/src/renderer/components/Header.tsx` - Simplify
- `packages/desktop/src/renderer/components/ActivityLogs.tsx` - Agent attribution
- `packages/desktop/src/renderer/components/Settings.tsx` - Inline panel
- `packages/desktop/src/renderer/types.ts` - Extended LogEntry

---

## Verification Plan

1. **Build check:** `pnpm build` must pass after each step
2. **Smoke test:** `pnpm test:e2e:smoke` after UI changes
3. **Manual testing:**
   - Start desktop app → verify toolbar renders
   - Send a test query → verify orchestrator routes to correct agent
   - Verify live execution log shows events from sub-agent
   - Verify activity panel shows agent attribution badges
   - Verify screencast frames stream correctly
   - Verify recording system still works
4. **Backward compatibility:**
   - Config with old `personas:` section auto-migrates
   - Events without `_agentName` render normally in UI

---

## Dependencies to Add

- `zod` - Already available as transitive dependency via `@github/copilot-sdk`, needed for `defineTool` parameter schemas. Add as explicit dependency in `packages/core/package.json`.
