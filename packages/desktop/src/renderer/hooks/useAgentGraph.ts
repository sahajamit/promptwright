import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";

export type NodeStatus = "idle" | "classifying" | "pending" | "executing" | "complete" | "error";

export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  displayName: string;
  category: string;
  status: NodeStatus;
  lastTool?: string;
  isOrchestrator?: boolean;
  model?: string;
}

export interface DelegationEntry {
  agent: string;
  agentDisplayName: string;
  reason: string;
  timestamp: number;
}

export interface AgentGraphState {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
  isActive: boolean;
  activeAgent: string | null;
  history: DelegationEntry[];
}

type AgentMeta = { name: string; displayName: string; category: string; model?: string };

// Orchestrator sits at the top-center; agents are laid out in a row below it.
const ORCHESTRATOR_POSITION = { x: 0, y: 0 };
const AGENT_ROW_Y = 160;       // vertical distance below orchestrator
const AGENT_COL_SPACING = 160; // horizontal gap between sibling agents

function computeAgentPositions(count: number): { x: number; y: number }[] {
  if (count === 0) return [];
  // Centre the row: total width = count * spacing - spacing, then offset left by half
  const totalWidth = (count - 1) * AGENT_COL_SPACING;
  return Array.from({ length: count }, (_, i) => ({
    x: -totalWidth / 2 + i * AGENT_COL_SPACING - 65,
    y: AGENT_ROW_Y - 29,
  }));
}

function makeOrchestratorNode(status: NodeStatus, model?: string): Node<AgentNodeData> {
  return {
    id: "orchestrator",
    type: "orchestratorNode",
    // Offset by half the node width (70) so the centre aligns with x=0
    position: { x: ORCHESTRATOR_POSITION.x - 70, y: ORCHESTRATOR_POSITION.y },
    data: {
      label: "Orchestrator",
      displayName: "Orchestrator",
      category: "orchestrator",
      status,
      isOrchestrator: true,
      model,
    },
  };
}

function makeAgentNodes(
  calledAgents: AgentMeta[],
  statuses: Map<string, NodeStatus>,
  lastTools: Map<string, string>,
): Node<AgentNodeData>[] {
  const positions = computeAgentPositions(calledAgents.length);
  return calledAgents.map((agent, i) => ({
    id: agent.name,
    type: "agentNode",
    position: positions[i],
    data: {
      label: agent.name,
      displayName: agent.displayName,
      category: agent.category,
      status: statuses.get(agent.name) ?? "idle",
      lastTool: lastTools.get(agent.name),
      model: agent.model,
    },
  }));
}

function makeEdge(agentId: string, animated: boolean, label?: string): Edge {
  return {
    id: `orchestrator->${agentId}`,
    source: "orchestrator",
    target: agentId,
    animated,
    label: label ? label.slice(0, 40) + (label.length > 40 ? "…" : "") : undefined,
    style: animated
      ? { stroke: "#3b82f6", strokeWidth: 2 }
      : { stroke: "#9ca3af", strokeWidth: 1, strokeDasharray: "4 4" },
    markerEnd: { type: "arrowclosed" as const, color: animated ? "#3b82f6" : "#9ca3af" },
  };
}

export function useAgentGraph(): AgentGraphState & { reset: () => void } {
  // Full registry loaded once — used as lookup for metadata
  const agentRegistryRef = useRef<Map<string, AgentMeta>>(new Map());
  const [orchestratorModel, setOrchestratorModel] = useState<string | undefined>();
  const [orchestratorStatus, setOrchestratorStatus] = useState<NodeStatus>("idle");
  const [agentStatuses, setAgentStatuses] = useState<Map<string, NodeStatus>>(new Map());
  const [lastTools, setLastTools] = useState<Map<string, string>>(new Map());
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [delegationEdges, setDelegationEdges] = useState<Map<string, { animated: boolean; label?: string }>>(new Map());
  const [history, setHistory] = useState<DelegationEntry[]>([]);
  const [isActive, setIsActive] = useState(false);
  // Only agents that have actually been delegated to appear as nodes
  const [calledAgentNames, setCalledAgentNames] = useState<string[]>([]);

  const agentsLoadedRef = useRef(false);

  // Load agent metadata once on mount (registry only — no nodes shown yet)
  useEffect(() => {
    if (agentsLoadedRef.current) return;
    agentsLoadedRef.current = true;

    const loadAgents = async () => {
      try {
        const [agentList, orchState] = await Promise.all([
          window.jarvis.agent.list(),
          window.jarvis.agent.getOrchestratorState(),
        ]);
        const registry = new Map<string, AgentMeta>();
        for (const a of agentList as AgentMeta[]) {
          if (a.name !== "orchestrator") registry.set(a.name, a);
        }
        agentRegistryRef.current = registry;
        if (orchState?.model) setOrchestratorModel(orchState.model);
      } catch {
        // Non-fatal
      }
    };

    loadAgents();
  }, []);

  const reset = useCallback(() => {
    setOrchestratorStatus("idle");
    setAgentStatuses(new Map());
    setLastTools(new Map());
    setActiveAgent(null);
    setDelegationEdges(new Map());
    setHistory([]);
    setIsActive(false);
    setCalledAgentNames([]);
  }, []);

  // Subscribe to jarvis events
  useEffect(() => {
    const unsubscribe = window.jarvis.onEvent((event: any) => {
      switch (event.type) {
        case "orchestrator:classifying": {
          setIsActive(true);
          setOrchestratorStatus("classifying");
          break;
        }

        case "orchestrator:agent_selected": {
          const agentName: string = event.agent;
          const reason: string = event.reason ?? "";
          setOrchestratorStatus("idle");
          // Add to called set if not already present
          setCalledAgentNames((prev) =>
            prev.includes(agentName) ? prev : [...prev, agentName],
          );
          setDelegationEdges((prev) => {
            const next = new Map(prev);
            next.set(agentName, { animated: false, label: reason });
            return next;
          });
          setHistory((prev) => [
            ...prev,
            { agent: agentName, agentDisplayName: agentName, reason, timestamp: Date.now() },
          ]);
          break;
        }

        case "agent:executing": {
          const agentName: string = event.agent;
          const agentDisplayName: string = event.agentDisplayName ?? agentName;
          setActiveAgent(agentName);
          setAgentStatuses((prev) => {
            const next = new Map(prev);
            next.set(agentName, "executing");
            return next;
          });
          setDelegationEdges((prev) => {
            const next = new Map(prev);
            const existing = next.get(agentName);
            next.set(agentName, { animated: true, label: existing?.label });
            return next;
          });
          setHistory((prev) =>
            prev.map((entry) =>
              entry.agent === agentName && entry.agentDisplayName === agentName
                ? { ...entry, agentDisplayName }
                : entry,
            ),
          );
          break;
        }

        case "agent:complete": {
          const agentName: string = event.agent;
          setActiveAgent(null);
          setAgentStatuses((prev) => {
            const next = new Map(prev);
            next.set(agentName, "complete");
            return next;
          });
          setDelegationEdges((prev) => {
            const next = new Map(prev);
            const existing = next.get(agentName);
            next.set(agentName, { animated: false, label: existing?.label });
            return next;
          });
          break;
        }

        case "tool_start": {
          const agentName = (event as any)._agentName as string | undefined;
          if (agentName && agentName !== "orchestrator") {
            setLastTools((prev) => {
              const next = new Map(prev);
              next.set(agentName, event.toolName);
              return next;
            });
          }
          break;
        }

        case "session_idle": {
          const idleAgentName = (event as any)._agentName as string | undefined;
          if (!idleAgentName || idleAgentName === "orchestrator") {
            setOrchestratorStatus("idle");
            setIsActive(false);
          }
          break;
        }

        case "connecting":
        case "connected": {
          reset();
          break;
        }
      }
    });

    return unsubscribe;
  }, [reset]);

  // Only build nodes for agents that have actually been called
  const nodes = useMemo<Node<AgentNodeData>[]>(() => {
    const orchestratorNode = makeOrchestratorNode(orchestratorStatus, orchestratorModel);
    const calledAgents = calledAgentNames
      .map((name) => agentRegistryRef.current.get(name))
      .filter((a): a is AgentMeta => a !== undefined);
    const agentNodes = makeAgentNodes(calledAgents, agentStatuses, lastTools);
    return [orchestratorNode, ...agentNodes];
  }, [calledAgentNames, agentStatuses, lastTools, orchestratorStatus, orchestratorModel]);

  const edges = useMemo<Edge[]>(
    () =>
      Array.from(delegationEdges.entries()).map(([agentId, config]) =>
        makeEdge(agentId, config.animated, config.label),
      ),
    [delegationEdges],
  );

  return { nodes, edges, isActive, activeAgent, history, reset };
}
