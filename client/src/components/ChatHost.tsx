// Owns the agent chat UI ABOVE the building view, so the panel and its transcript
// survive town<->building navigation (the panel used to live in HabboRoom, which
// unmounts). State lives here; the WS stream (chat lines accumulate even while the
// panel is closed) comes from useAgentStream. openChat/closeChat are exposed via
// useChat() so the canvas (sprite click, spawn) and the roster can drive it.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AgentChatPanel } from './AgentChatPanel';
import { useAgentStream } from '../hooks/AgentStream';
import { mergeTranscript } from '../utils/chat-transcript';
import { getAgentName, AGENT_NAMES_CHANGED } from '../utils/agent-names';
import type { AgentCapabilities, ChatMessage, GraphData, ModelOption, SlashCommand } from '../types';

const API_URL = 'http://localhost:5174/api';

interface ChatControl {
  chatAgentId: string | null;
  openChat: (agentId: string) => void;
  closeChat: () => void;
}

const ChatContext = createContext<ChatControl | null>(null);

export function useChat(): ChatControl {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { chatHistoryRef, chatVersionRef, thinkingAgentsRef } = useAgentStream();

  const [chatAgentId, setChatAgentId] = useState<string | null>(null);
  // "/" commands+skills and "@" files for the live session, plus the models it can
  // switch to (same data the panel needs as when it lived in HabboRoom).
  const [chatCommands, setChatCommands] = useState<SlashCommand[]>([]);
  const [chatFiles, setChatFiles] = useState<string[]>([]);
  const [chatModels, setChatModels] = useState<ModelOption[]>([]);
  // Bumped when chatVersionRef advances (new line / permission) so the panel
  // re-renders from the ref. Only ticked while a chat is open.
  const [chatTick, setChatTick] = useState(0);

  const openChat = useCallback((agentId: string) => setChatAgentId(agentId), []);
  const closeChat = useCallback(() => setChatAgentId(null), []);

  // On open: seed the transcript from the server (covers F5 / cold start where the
  // local ref missed earlier lines), then load completion data. Merge keeps any
  // live lines that arrived after the server's last timestamp (avoids the race
  // where a WS line lands between request and response and gets clobbered).
  useEffect(() => {
    if (!chatAgentId) { setChatCommands([]); setChatFiles([]); setChatModels([]); return; }
    const id = chatAgentId;
    let cancelled = false;

    fetch(`${API_URL}/agent/${id}/transcript`)
      .then(r => (r.ok ? r.json() : []))
      .then((server: ChatMessage[]) => {
        if (cancelled || !Array.isArray(server) || server.length === 0) return;
        chatHistoryRef.current.set(id, mergeTranscript(server, chatHistoryRef.current.get(id) ?? []));
        chatVersionRef.current++;
      })
      .catch(() => { /* no transcript yet → rely on the live stream */ });

    fetch(`${API_URL}/agent/${id}/capabilities`)
      .then(r => (r.ok ? r.json() : null))
      .then((caps: AgentCapabilities | null) => {
        if (cancelled || !caps) return;
        setChatCommands(caps.commands);
        setChatModels(caps.models);
      })
      .catch(() => { /* no live session yet → no command completion */ });

    // File "@" completion for the agent's OWN project (may differ from the viewed
    // building), fetched fresh from the scoped graph.
    const agentProject = thinkingAgentsRef.current.find(a => a.agentId === id)?.projectId;
    const q = agentProject ? `?projectId=${encodeURIComponent(agentProject)}` : '';
    fetch(`${API_URL}/graph${q}`)
      .then(r => r.json())
      .then((g: GraphData) => {
        if (cancelled) return;
        const rootId = g.nodes.find(n => n.depth === -1)?.id ?? '';
        const toRel = (nodeId: string) => (nodeId.startsWith(rootId) ? nodeId.slice(rootId.length).replace(/^[/\\]/, '') : nodeId);
        setChatFiles(g.nodes.filter(n => !n.isFolder && n.depth >= 0).map(n => toRel(n.id)));
      })
      .catch(() => { /* graph unavailable → no file completion */ });

    return () => { cancelled = true; };
  }, [chatAgentId, chatHistoryRef, chatVersionRef, thinkingAgentsRef]);

  // Refresh the panel title when the user renames the focused agent (the roster
  // writes the custom name and dispatches this event).
  useEffect(() => {
    if (!chatAgentId) return;
    const onRename = () => setChatTick(t => t + 1);
    window.addEventListener(AGENT_NAMES_CHANGED, onRename);
    return () => window.removeEventListener(AGENT_NAMES_CHANGED, onRename);
  }, [chatAgentId]);

  // Poll the version ref (refs don't re-render) only while a chat is open, so the
  // panel refreshes on each new line without a permanent render loop.
  useEffect(() => {
    if (!chatAgentId) return;
    let raf = 0;
    let last = chatVersionRef.current;
    const loop = () => {
      if (chatVersionRef.current !== last) { last = chatVersionRef.current; setChatTick(t => t + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [chatAgentId, chatVersionRef]);

  const sendChat = (agentId: string, content: string) => {
    fetch(`${API_URL}/agent/${agentId}/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch(console.error);
  };
  const stopChat = (agentId: string) => {
    fetch(`${API_URL}/agent/${agentId}/stop`, { method: 'POST' }).catch(console.error);
  };
  const setModeForAgent = (agentId: string, mode: string) => {
    fetch(`${API_URL}/agent/${agentId}/mode`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).catch(console.error);
  };
  const setModelForAgent = (agentId: string, model: string) => {
    fetch(`${API_URL}/agent/${agentId}/model`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).catch(console.error);
  };

  // Recomputed on each tick so the panel reflects newly-arrived lines.
  const history = useMemo<ChatMessage[]>(
    () => (chatAgentId ? chatHistoryRef.current.get(chatAgentId) ?? [] : []),
    [chatAgentId, chatTick, chatHistoryRef],
  );

  const control = useMemo<ChatControl>(() => ({ chatAgentId, openChat, closeChat }), [chatAgentId, openChat, closeChat]);

  return (
    <ChatContext.Provider value={control}>
      {children}
      {chatAgentId && (() => {
        // The runner only emits a terminal 'system' line on crash/end, so a system
        // message in last position means the session is dead.
        const dead = history.length > 0 && history[history.length - 1].role === 'system';
        const agent = thinkingAgentsRef.current.find(a => a.agentId === chatAgentId);
        return (
          <AgentChatPanel
            agentName={getAgentName(chatAgentId, agent?.displayName || 'Agent')}
            messages={history}
            dead={dead}
            commands={chatCommands}
            files={chatFiles}
            models={chatModels}
            model={agent?.model}
            mode={agent?.permissionMode}
            onModelChange={model => setModelForAgent(chatAgentId, model)}
            onModeChange={mode => setModeForAgent(chatAgentId, mode)}
            onSend={content => sendChat(chatAgentId, content)}
            onStop={() => { stopChat(chatAgentId); closeChat(); }}
            onClose={closeChat}
          />
        );
      })()}
    </ChatContext.Provider>
  );
}
