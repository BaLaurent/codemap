// Capabilities (slash commands + skills, models, subagents) discovered from a
// live Agent SDK session. The lists are identical for any agent sharing the same
// cwd/config, so we cache them by key: the per-agent lookup (chat autocompletion)
// and the per-project lookup (spawn-form selectors) share one cache, populated
// the first time any agent in that project is queried.
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentCapabilities } from '../types.js';

const cache = new Map<string, AgentCapabilities>();

// Fetch (or return cached) capabilities for a live session. `cacheKey` is the
// project id so sibling agents reuse one snapshot.
export async function fetchCapabilities(query: Query, cacheKey: string): Promise<AgentCapabilities> {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const [commands, models, agents] = await Promise.all([
    query.supportedCommands(),
    query.supportedModels(),
    query.supportedAgents(),
  ]);
  const caps: AgentCapabilities = {
    commands: commands.map(c => ({
      name: c.name, description: c.description, argumentHint: c.argumentHint, aliases: c.aliases,
    })),
    models: models.map(m => ({ value: m.value, displayName: m.displayName, description: m.description })),
    agents: agents.map(a => ({ name: a.name, description: a.description })),
  };
  cache.set(cacheKey, caps);
  return caps;
}

// Cached snapshot for a project, or undefined if no agent has been queried yet.
export function getCachedCapabilities(cacheKey: string): AgentCapabilities | undefined {
  return cache.get(cacheKey);
}
