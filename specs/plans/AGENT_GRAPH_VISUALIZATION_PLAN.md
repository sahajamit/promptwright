# Plan: Real-Time Agent Orchestration Graph Visualization

## Context

The new orchestrator architecture delegates tasks from a central orchestrator agent to specialized sub-agents (pw-mcp-agent, api-test-agent, etc.). Users currently have no visual way to understand this delegation workflow — they only see raw log text. This feature adds a real-time animated node graph that shows the orchestrator routing tasks to agents, with live status transitions and animated edges, making the multi-agent workflow immediately intuitive.

---

## UX / UI Integration

### Where It Lives

The existing right-side panel (currently **Activity Logs**, toggled via the ToolBar) is converted into a **tabbed right panel** with two tabs:

```
┌─────────────────────────────────────┐
│  [ Activity ]  [ Agent Graph ]      │  ← tab row at top of right panel
├─────────────────────────────────────┤
│                                     │
│   (content of selected tab)         │
│                                     │
└─────────────────────────────────────┘
```

- **Activity tab** — existing `ActivityLogs` component, zero changes to its internals
- **Agent Graph tab** — new `AgentGraphPanel` component

The ToolBar button and `toggle-activity` action remain unchanged — they still open/close the right panel. Only the content inside gets a tab header.

### How the User Sees It

1. **User sends a task** in the chat interface as normal
2. **When the orchestrator starts routing** (`orchestrator:agent_selected` event fires):
   - If the right panel is **closed**: a glowing dot badge appears on the ToolBar activity icon (same `showLogs` toggle), signaling something is happening
   - If the right panel is **open**: it **auto-switches to the "Agent Graph" tab** and animates the delegation
3. **User can click the ToolBar icon** at any time to open the panel and see the live graph
4. **After execution completes**: graph remains visible with completion state (checkmarks, timing labels). User can switch back to "Activity" tab to see raw logs.
5. **On next execution**: graph resets and replays the new workflow

### Visual Walkthrough

```
[Step 1] User sends prompt → right panel shows:

    Activity  | Agent Graph ←(active tab)
   ───────────────────────────────────

        ┌─────────────────┐
        │  ORCHESTRATOR   │  ← amber pulsing ring (classifying)
        └────────┬────────┘
                 │
        (no edges yet)

        pw-mcp-agent    api-test-agent
        [gray/idle]     [gray/idle]

────────────────────────────────────────

[Step 2] orchestrator:agent_selected → pw-mcp-agent

        ┌─────────────────┐
        │  ORCHESTRATOR   │  ← blue (routing)
        └────────┬────────┘
                 │  ──►  animated dashed edge appears
                 ▼
        ┌─────────────────┐
        │  pw-mcp-agent   │  ← blue spinning ring (executing)
        └─────────────────┘

    Task label on edge: "Test that login button is clickable"

────────────────────────────────────────

[Step 3] agent:complete

        ┌─────────────────┐
        │  ORCHESTRATOR   │  ← gray/idle
        └────────┬────────┘
                 │  ── solid green edge ──
                 ▼
        ┌─────────────────┐
        │  pw-mcp-agent ✓ │  ← emerald + checkmark
        └─────────────────┘
    Duration label: "12.4s"
```

### ToolBar Change (minimal)

The existing ToolBar icon for "toggle-activity" gets a **badge dot** (small amber or green circle overlay on the icon) when:
- A delegation is in progress (amber pulsing) — if panel is closed
- Execution just completed (green, fades after 3s) — if panel is closed

This is the same pattern used by notification systems and requires only a prop addition to the existing ToolBar component.

---

## Implementation Plan

### Step 1 — Install Dependency

```bash
pnpm --filter @jarvis-ai/desktop add @xyflow/react
```

`@xyflow/react` is ~170KB gzipped, MIT license, peer deps: React 18+.

---

### Step 2 — Create `useAgentGraph` Hook

**File**: `packages/desktop/src/renderer/hooks/useAgentGraph.ts` *(new)*

Subscribes to `window.jarvis.onEvent()` and builds graph state from orchestration events.

**Node state machine:**
```
idle → classifying  (orchestrator:classifying)
     → agent_selected  (orchestrator:agent_selected)
     → executing  (agent:executing)
     → complete  (agent:complete)
     → idle  (session_idle)
```

**State produced:**
```typescript
{
  nodes: Node[]              // orchestrator + all known sub-agents
  edges: Edge[]              // delegation arrows, animated when active
  isActive: boolean          // execution in progress
  hasPendingActivity: boolean  // true when graph has activity but panel is closed
  activeAgent: string | null
  history: DelegationEntry[] // all delegations this run with timing
}
```

**Event → graph effect mapping:**

| JarvisEvent | Graph Effect |
|---|---|
| `orchestrator:classifying` | Orchestrator node → "classifying" (amber pulse ring) |
| `orchestrator:agent_selected` | Dashed preview edge appears; orchestrator → "routing" (blue) |
| `agent:executing` | Target node → "executing" (green spin); edge → `animated: true` |
| `tool_start` (tagged `_agentName`) | Tool activity badge on executing node |
| `agent:complete` | Node → "complete" (emerald + checkmark); edge → solid green; timing label |
| `session_idle` | Orchestrator → idle; `isActive = false` |

Initial nodes populated via `window.jarvis.getAgents()` IPC call on mount.

---

### Step 3 — Create `AgentGraphPanel` Component

**File**: `packages/desktop/src/renderer/components/AgentGraphPanel.tsx` *(new)*

Uses `@xyflow/react` with two custom node types:

**`OrchestratorNode`**: 120×60px, centered, shows label + model name, status ring animation via CSS keyframes.

**`AgentNode`**: Outer nodes, shows `displayName` + `category` pill badge, status indicator (idle/executing/complete/error), last tool call label below node during execution.

**Layout**: Orchestrator at `(400, 250)`. Sub-agents placed in a circle using polar coordinates — `angle = (index / total) * 2π`, radius = 180px.

**Panel chrome**: Fixed-height container (fills tab area), React Flow canvas with `fitView`, minimap disabled, controls disabled (no zoom/pan clutter). Shows execution timer in top-right corner during active runs.

---

### Step 4 — Convert Right Panel to Tabbed Panel

**File**: `packages/desktop/src/renderer/App.tsx` *(modify)*

Add state:
```typescript
const [rightPanelTab, setRightPanelTab] = useState<"activity" | "agent-graph">("activity");
```

Auto-switch logic (in the existing `jarvis-event` handler):
```typescript
// When orchestrator starts delegating, auto-switch tab
if (event.type === "orchestrator:agent_selected") {
  if (showLogs) setRightPanelTab("agent-graph");
}
```

Replace the existing `{showLogs && <ActivityLogs ... />}` pattern (appears 4 times across view branches) with:
```tsx
{showLogs && (
  <RightPanel
    activeTab={rightPanelTab}
    onTabChange={setRightPanelTab}
    logs={logs}
    onClearLogs={handleClearLogs}
    hasPendingGraphActivity={agentGraphState.hasPendingActivity}
  />
)}
```

**File**: `packages/desktop/src/renderer/components/RightPanel.tsx` *(new — thin wrapper)*

Renders the tab header + conditionally renders `ActivityLogs` or `AgentGraphPanel`:
```tsx
<div className="w-80 border-l border-gray-200 flex flex-col">
  {/* Tab header */}
  <div className="flex border-b border-gray-200 bg-white">
    <button onClick={() => onTabChange("activity")}>Activity</button>
    <button onClick={() => onTabChange("agent-graph")}>
      Agent Graph
      {hasPendingGraphActivity && <span className="badge-dot" />}
    </button>
  </div>
  {/* Tab content */}
  {activeTab === "activity" ? <ActivityLogs ... /> : <AgentGraphPanel ... />}
</div>
```

---

### Step 5 — Add ToolBar Badge

**File**: `packages/desktop/src/renderer/components/ToolBar.tsx` (or wherever the activity toggle button lives) *(minor modify)*

Add a `showActivityBadge` prop. When true and the panel is closed, render a small pulsing amber dot overlay on the activity icon.

Pass `agentGraphState.hasPendingActivity && !showLogs` from App.tsx.

---

### Step 6 — Expose Agent List via IPC

**File**: `packages/core/src/client.ts` *(5-line add)*
```typescript
getAgents(): AgentDefinition[] {
  return this.agentRegistry?.getEnabled() ?? []
}
```

**File**: `packages/desktop/src/main/index.ts` *(5-line add)*
```typescript
ipcMain.handle("jarvis:get-agents", async () => {
  return jarvisClient?.getAgents() ?? []
})
```

**File**: `packages/desktop/src/preload.ts` *(1-line add)*
```typescript
getAgents: () => ipcRenderer.invoke("jarvis:get-agents")
```

---

## Critical Files

| File | Role | Action |
|---|---|---|
| `packages/desktop/src/renderer/hooks/useAgentGraph.ts` | Graph state from events | **Create** |
| `packages/desktop/src/renderer/components/AgentGraphPanel.tsx` | React Flow visualization | **Create** |
| `packages/desktop/src/renderer/components/RightPanel.tsx` | Tabbed right panel wrapper | **Create** |
| `packages/desktop/src/renderer/App.tsx` | Tab state + auto-switch logic | **Modify** |
| `packages/desktop/src/main/index.ts` | IPC handler for agent list | **Minor add** |
| `packages/desktop/src/preload.ts` | Expose getAgents() to renderer | **Minor add** |
| `packages/core/src/client.ts` | getAgents() method | **Minor add** |
| `packages/desktop/package.json` | Add @xyflow/react | **Dependency** |

---

## Reuse Opportunities

- **Event subscription pattern**: `useEffect(() => { return window.jarvis.onEvent(...) }, [])` — same as `useTestExecution.ts:107`
- **ActivityLogs dims**: `w-80` (320px), flex column — `RightPanel` inherits same dimensions
- **IPC handler pattern**: same `ipcMain.handle()` style as all handlers in `main/index.ts`
- **AgentRegistry.getEnabled()** — `packages/core/src/agents/registry.ts` — provides `name`, `displayName`, `category` for pre-populating nodes
- **Existing `activeAgentName` state in App.tsx** — already tracks active agent from `agent:executing` events, can be reused by `useAgentGraph`

---

## Verification

1. `pnpm build` — TypeScript compiles cleanly across all packages
2. `pnpm dev:desktop` — launch Electron app
3. Open right panel via ToolBar icon, switch to "Agent Graph" tab — graph shows orchestrator + idle agent nodes
4. Send a prompt that triggers routing (e.g., "run a web test on google.com")
5. Verify: orchestrator node pulses amber → animated edge appears → agent node spins green → completes with checkmark + timing
6. Verify tab auto-switches to "Agent Graph" when delegation fires
7. Verify badge dot appears on ToolBar icon when panel is closed and execution is active
8. Switch to "Activity" tab — existing logs still work unchanged
9. `pnpm test:e2e:smoke` — confirm no regressions in app launch and persona selection
