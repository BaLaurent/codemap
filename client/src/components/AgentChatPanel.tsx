// Chat panel for a hotel-spawned agent: shows the transcript (user/assistant/
// system lines streamed over WS) and lets the user send new turns. Same pixel-art
// palette as the interaction modal.
import { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { ChatMessage } from '../types';

const C = { ink: '#3A2E12', border: '#4A3B1A', gold: '#FFE040', cream: '#FFF8E6' };

const panel: CSSProperties = {
  position: 'absolute', right: 16, bottom: 16, zIndex: 25,
  width: 'min(360px, 92vw)', height: 'min(52vh, 520px)',
  display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
  background: C.cream, color: C.ink,
  border: `4px solid ${C.border}`, boxShadow: '8px 8px 0 rgba(0,0,0,0.35)',
};

const titleBar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', background: C.gold, borderBottom: `4px solid ${C.border}`, fontWeight: 700,
};

const iconBtn: CSSProperties = {
  cursor: 'pointer', fontWeight: 700, background: 'transparent', border: 'none',
  color: C.ink, fontFamily: 'monospace', fontSize: 14, padding: '0 4px',
};

const transcript: CSSProperties = { flex: 1, overflowY: 'auto', padding: 10, fontSize: 13, lineHeight: 1.4 };

const inputRow: CSSProperties = {
  display: 'flex', gap: 6, padding: 8, borderTop: `4px solid ${C.border}`,
};

const textInput: CSSProperties = {
  flex: 1, boxSizing: 'border-box', padding: '6px 8px', fontFamily: 'monospace', fontSize: 13,
  color: C.ink, background: '#fff', border: `2px solid ${C.border}`,
};

const sendBtn: CSSProperties = {
  fontFamily: 'monospace', fontWeight: 700, fontSize: 13, padding: '6px 12px',
  color: C.ink, background: C.gold, border: `3px solid ${C.border}`,
  boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', cursor: 'pointer',
};

function bubbleStyle(role: ChatMessage['role']): CSSProperties {
  if (role === 'user') {
    return { alignSelf: 'flex-end', background: '#FFF0B8', border: `2px solid ${C.border}`, padding: '5px 8px', marginBottom: 6, maxWidth: '85%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
  }
  if (role === 'system') {
    return { alignSelf: 'center', fontStyle: 'italic', opacity: 0.7, margin: '6px 0', fontSize: 12 };
  }
  return { alignSelf: 'flex-start', background: '#fff', border: `2px solid rgba(74,59,26,0.4)`, padding: '5px 8px', marginBottom: 6, maxWidth: '85%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
}

export function AgentChatPanel({ agentName, messages, dead, onSend, onStop, onClose }: {
  agentName: string;
  messages: ChatMessage[];
  dead?: boolean;  // session ended/crashed → input is disabled
  onSend: (content: string) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    if (dead) return;
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div style={panel}>
      <div style={titleBar}>
        <span>💬 {agentName}</span>
        <span>
          <button style={iconBtn} onClick={onStop} title="Arrêter l'agent">⏹</button>
          <button style={iconBtn} onClick={onClose} title="Fermer">✕</button>
        </span>
      </div>

      <div style={transcript} ref={scrollRef}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && (
            <div style={{ opacity: 0.6, fontStyle: 'italic' }}>L'agent démarre…</div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={bubbleStyle(m.role)}>{m.content}</div>
          ))}
        </div>
      </div>

      <div style={inputRow}>
        <input
          style={{ ...textInput, opacity: dead ? 0.5 : 1, cursor: dead ? 'not-allowed' : 'text' }}
          placeholder={dead ? 'Session terminée — spawn un nouvel agent' : "Écris à l'agent…"}
          value={draft}
          disabled={dead}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button
          style={{ ...sendBtn, opacity: dead ? 0.5 : 1, cursor: dead ? 'not-allowed' : 'pointer' }}
          disabled={dead}
          onClick={send}
        >➤</button>
      </div>
    </div>
  );
}
