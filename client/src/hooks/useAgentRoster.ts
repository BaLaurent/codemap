// Builds the global agent roster shown in AgentRosterPanel. Unlike useProjects /
// useFileActivity (ref-based, for the canvas loop), this hook exposes React
// state so a DOM list re-renders when agents come and go. buildRoster is the
// pure, testable core (same split as sortProjects / reduceNav).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentThinkingState, ProjectInfo } from '../types';
import { getAgentName, AGENT_NAMES_CHANGED } from '../utils/agent-names';

const API_URL = 'http://localhost:5174/api';
const POLL_INTERVAL_MS = 1500;

// An agent counts as idle once it has neither been thinking nor waiting for this
// long. Matches the canvas threshold (HabboRoom sends idle agents to the coffee
// shop after the same 30s) so the list and the room tell the same story.
export const IDLE_THRESHOLD_MS = 30000;

export type RosterState = 'working' | 'waiting' | 'idle';

export interface RosterEntry {
  agentId: string;
  projectId?: string;
  projectName: string;
  displayName: string; // custom name if set, else the server's baseName
  baseName: string; // the server-assigned name (used as rename fallback)
  state: RosterState;
  currentCommand?: string;
  toolInput?: string;
  lastActivity: number;
}

export interface RosterGroup {
  projectId: string | null;
  projectName: string;
  agents: RosterEntry[];
}

const NO_PROJECT_KEY = '__none__';
const NO_PROJECT_LABEL = 'Sans projet';

export function deriveState(agent: AgentThinkingState, now: number): RosterState {
  if (agent.waitingForInput) return 'waiting';
  if (agent.isThinking) return 'working';
  // No tool running: still "active" briefly between tools, idle after the threshold.
  if (now - agent.lastActivity > IDLE_THRESHOLD_MS) return 'idle';
  return 'working';
}

// Combine the global agent list with the project registry into groups keyed by
// project, newest-active first, with custom names applied. `resolveName` is
// injected (the hook passes getAgentName) so this stays a pure function.
export function buildRoster(
  agents: AgentThinkingState[],
  projects: ProjectInfo[],
  now: number,
  resolveName: (agentId: string, fallback: string) => string
): RosterGroup[] {
  const projectNames = new Map(projects.map(p => [p.projectId, p.projectName]));
  const byProject = new Map<string, RosterGroup>();

  for (const agent of agents) {
    const key = agent.projectId ?? NO_PROJECT_KEY;
    const projectName = agent.projectId
      ? projectNames.get(agent.projectId) ?? 'Projet inconnu'
      : NO_PROJECT_LABEL;

    let group = byProject.get(key);
    if (!group) {
      group = { projectId: agent.projectId ?? null, projectName, agents: [] };
      byProject.set(key, group);
    }

    group.agents.push({
      agentId: agent.agentId,
      projectId: agent.projectId,
      projectName,
      baseName: agent.displayName,
      displayName: resolveName(agent.agentId, agent.displayName),
      state: deriveState(agent, now),
      currentCommand: agent.currentCommand,
      toolInput: agent.toolInput,
      lastActivity: agent.lastActivity,
    });
  }

  const groups = Array.from(byProject.values());
  for (const g of groups) {
    g.agents.sort((a, b) => b.lastActivity - a.lastActivity);
  }
  // Most-recently-active project first; the "no project" bucket sinks to the end.
  groups.sort((a, b) => {
    if ((a.projectId === null) !== (b.projectId === null)) {
      return a.projectId === null ? 1 : -1;
    }
    const aMax = a.agents[0]?.lastActivity ?? 0;
    const bMax = b.agents[0]?.lastActivity ?? 0;
    return bMax - aMax;
  });
  return groups;
}

export interface AgentRoster {
  groups: RosterGroup[];
  clearAgents: () => void;
}

export function useAgentRoster(): AgentRoster {
  const [groups, setGroups] = useState<RosterGroup[]>([]);
  const lastDataRef = useRef<{ agents: AgentThinkingState[]; projects: ProjectInfo[] }>({
    agents: [],
    projects: [],
  });

  useEffect(() => {
    let alive = true;

    const recompute = () => {
      const { agents, projects } = lastDataRef.current;
      setGroups(buildRoster(agents, projects, Date.now(), getAgentName));
    };

    const tick = () => {
      Promise.all([
        fetch(`${API_URL}/thinking`).then(r => r.json()),
        fetch(`${API_URL}/projects`).then(r => r.json()),
      ])
        .then(([agents, projects]: [AgentThinkingState[], ProjectInfo[]]) => {
          if (!alive) return;
          lastDataRef.current = { agents, projects };
          recompute();
        })
        .catch(() => {});
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    // Re-apply custom names immediately on rename -- recompute from cached data,
    // no network round-trip needed.
    window.addEventListener(AGENT_NAMES_CHANGED, recompute);

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener(AGENT_NAMES_CHANGED, recompute);
    };
  }, []);

  // Drop all tracked agents server-side; empty the list optimistically for
  // instant feedback (the next poll reconciles if a live agent re-registers).
  const clearAgents = useCallback(() => {
    fetch(`${API_URL}/agents/clear`, { method: 'POST' })
      .then(() => setGroups([]))
      .catch(() => {});
  }, []);

  return { groups, clearAgents };
}
