import { describe, it, expect } from 'vitest';
import { buildRoster, deriveState, IDLE_THRESHOLD_MS } from './useAgentRoster';
import { AgentThinkingState, ProjectInfo } from '../types';

const NOW = 1_000_000;

function agent(over: Partial<AgentThinkingState>): AgentThinkingState {
  return {
    agentId: 'a',
    isThinking: false,
    lastActivity: NOW,
    displayName: 'Claude 1',
    ...over,
  };
}

const identityName = (_id: string, fallback: string) => fallback;

describe('deriveState', () => {
  it('reports waiting when the agent waits for input', () => {
    expect(deriveState(agent({ waitingForInput: true, isThinking: true }), NOW)).toBe('waiting');
  });

  it('reports working while thinking', () => {
    expect(deriveState(agent({ isThinking: true }), NOW)).toBe('working');
  });

  it('reports working when recently active between tools', () => {
    expect(deriveState(agent({ lastActivity: NOW - 5000 }), NOW)).toBe('working');
  });

  it('reports idle past the inactivity threshold', () => {
    expect(deriveState(agent({ lastActivity: NOW - IDLE_THRESHOLD_MS - 1 }), NOW)).toBe('idle');
  });
});

describe('buildRoster', () => {
  const projects: ProjectInfo[] = [
    { projectId: 'p1', projectName: 'Toto', projectRoot: '/toto', lastActivity: NOW, agentCount: 1, isPinned: false },
    { projectId: 'p2', projectName: 'Tutu', projectRoot: '/tutu', lastActivity: NOW, agentCount: 1, isPinned: false },
  ];

  it('groups agents by project and resolves the project name', () => {
    const groups = buildRoster(
      [agent({ agentId: 'a', projectId: 'p1' }), agent({ agentId: 'b', projectId: 'p2' })],
      projects,
      NOW,
      identityName
    );
    const names = groups.map(g => g.projectName).sort();
    expect(names).toEqual(['Toto', 'Tutu']);
  });

  it('falls back to "Projet inconnu" for an unknown projectId', () => {
    const groups = buildRoster([agent({ projectId: 'ghost' })], [], NOW, identityName);
    expect(groups[0].projectName).toBe('Projet inconnu');
  });

  it('buckets project-less agents under "Sans projet" and sinks them last', () => {
    const groups = buildRoster(
      [agent({ agentId: 'orphan' }), agent({ agentId: 'a', projectId: 'p1' })],
      projects,
      NOW,
      identityName
    );
    expect(groups[groups.length - 1].projectName).toBe('Sans projet');
    expect(groups[groups.length - 1].projectId).toBeNull();
  });

  it('applies custom names via the injected resolver', () => {
    const resolve = (id: string, fb: string) => (id === 'a' ? 'Renamed' : fb);
    const groups = buildRoster([agent({ agentId: 'a', projectId: 'p1' })], projects, NOW, resolve);
    expect(groups[0].agents[0].displayName).toBe('Renamed');
    expect(groups[0].agents[0].baseName).toBe('Claude 1');
  });

  it('carries the permission mode through to the roster entry (for the mode badge)', () => {
    const groups = buildRoster(
      [agent({ agentId: 'a', projectId: 'p1', spawned: true, permissionMode: 'bypassPermissions' })],
      projects,
      NOW,
      identityName
    );
    expect(groups[0].agents[0].permissionMode).toBe('bypassPermissions');
  });

  it('sorts agents within a group by most recent activity', () => {
    const groups = buildRoster(
      [
        agent({ agentId: 'old', projectId: 'p1', lastActivity: NOW - 10000 }),
        agent({ agentId: 'new', projectId: 'p1', lastActivity: NOW }),
      ],
      projects,
      NOW,
      identityName
    );
    expect(groups[0].agents.map(a => a.agentId)).toEqual(['new', 'old']);
  });

  it('orders groups by most-recently-active project first', () => {
    const groups = buildRoster(
      [
        agent({ agentId: 'a', projectId: 'p1', lastActivity: NOW - 50000 }),
        agent({ agentId: 'b', projectId: 'p2', lastActivity: NOW }),
      ],
      projects,
      NOW,
      identityName
    );
    expect(groups[0].projectId).toBe('p2');
  });
});
