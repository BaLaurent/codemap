// Hosts the single WebSocket stream (useFileActivity) ABOVE the building view so
// its refs survive town<->building navigation. HabboRoom remounts on key={project}
// to reset its canvas, but the data — graph, agents, and crucially the chat
// transcripts — lives here and persists. Consumers read it via useAgentStream().
import { createContext, useContext, type ReactNode } from 'react';
import { useFileActivity } from './useFileActivity';

type AgentStream = ReturnType<typeof useFileActivity>;

const AgentStreamContext = createContext<AgentStream | null>(null);

export function AgentStreamProvider({ projectId, children }: { projectId?: string; children: ReactNode }) {
  const stream = useFileActivity(projectId);
  return <AgentStreamContext.Provider value={stream}>{children}</AgentStreamContext.Provider>;
}

export function useAgentStream(): AgentStream {
  const stream = useContext(AgentStreamContext);
  if (!stream) throw new Error('useAgentStream must be used within an AgentStreamProvider');
  return stream;
}
