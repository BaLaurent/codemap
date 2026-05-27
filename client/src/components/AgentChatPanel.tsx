// Chat panel for a hotel-spawned agent: shows the transcript (user/assistant/
// system lines streamed over WS) and lets the user send new turns. Same pixel-art
// palette as the interaction modal.
import { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { ChatMessage, SlashCommand, ModelOption } from '../types';
import { CompletionInput } from './chat-completion';
import { PERMISSION_MODE_OPTIONS } from './permission-modes';
import { buildModelOptions } from './model-options';

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

const subBar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '4px 10px', fontSize: 11, background: '#F1E7CC', borderBottom: `2px solid ${C.border}`,
};

const modeSelect: CSSProperties = {
  fontFamily: 'monospace', fontSize: 11, color: C.ink, background: '#fff',
  border: `2px solid ${C.border}`, padding: '2px 4px', maxWidth: '60%',
};

const transcript: CSSProperties = { flex: 1, overflowY: 'auto', padding: 10, fontSize: 13, lineHeight: 1.4 };

const inputRow: CSSProperties = {
  display: 'flex', gap: 6, padding: 8, borderTop: `4px solid ${C.border}`,
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
  if (role === 'tool') {
    // Compact monospace chip for a tool call the agent made.
    return { alignSelf: 'flex-start', background: '#EFE6CF', border: `1px dashed ${C.border}`, padding: '2px 6px', marginBottom: 4, maxWidth: '92%', fontSize: 11, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  }
  return { alignSelf: 'flex-start', background: '#fff', border: `2px solid rgba(74,59,26,0.4)`, padding: '5px 8px', marginBottom: 6, maxWidth: '85%', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
}

// What to show for a message: a "🔧 Tool · input" chip for tool calls, else text.
function lineText(m: ChatMessage): string {
  if (m.role === 'tool' && m.tool) return `🔧 ${m.tool.name}${m.tool.input ? ` · ${m.tool.input}` : ''}`;
  return m.content;
}

export function AgentChatPanel({ agentName, messages, dead, commands, files, models, model, mode, onModelChange, onModeChange, onSend, onStop, onClose }: {
  agentName: string;
  messages: ChatMessage[];
  dead?: boolean;  // session ended/crashed → input is disabled
  commands: SlashCommand[];  // "/" completion (commands + skills) for the live session
  files: string[];           // "@" completion (project-relative paths)
  models: ModelOption[];     // selectable models for the live session
  model?: string;            // current model value ('' / undefined → CLI default)
  mode?: string;             // current permission mode
  onModelChange: (model: string) => void;  // switch the live session's model
  onModeChange: (mode: string) => void;     // switch the live session's permission mode
  onSend: (content: string) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local mirrors so a pick reflects immediately, then resyncs if the
  // server-confirmed value (prop) changes.
  const [localMode, setLocalMode] = useState(mode ?? 'default');
  useEffect(() => { setLocalMode(mode ?? 'default'); }, [mode]);
  const changeMode = (m: string) => { setLocalMode(m); onModeChange(m); };

  // The agent reports model 'default' when on the default, so use that as the
  // reset value (server maps it back to "no model" → CLI default).
  const [localModel, setLocalModel] = useState(model || 'default');
  useEffect(() => { setLocalModel(model || 'default'); }, [model]);
  const changeModel = (m: string) => { setLocalModel(m); onModelChange(m); };
  const modelOptions = buildModelOptions(models, localModel);

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

      <div style={subBar}>
        <select
          style={modeSelect}
          value={localModel}
          disabled={dead}
          onChange={e => changeModel(e.target.value)}
          title="Modèle (à chaud)"
        >
          {modelOptions.map(o => <option key={o.value} value={o.value}>🧠 {o.label}</option>)}
        </select>
        <select
          style={modeSelect}
          value={localMode}
          disabled={dead}
          onChange={e => changeMode(e.target.value)}
          title="Mode de permission (à chaud)"
        >
          {PERMISSION_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>🛡 {o.label}</option>)}
        </select>
      </div>

      <div style={transcript} ref={scrollRef}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && (
            <div style={{ opacity: 0.6, fontStyle: 'italic' }}>L'agent démarre…</div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={bubbleStyle(m.role)} title={m.role === 'tool' ? m.tool?.input : undefined}>{lineText(m)}</div>
          ))}
        </div>
      </div>

      <div style={inputRow}>
        <CompletionInput
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          commands={commands}
          files={files}
          disabled={dead}
          placeholder={dead ? 'Session terminée — spawn un nouvel agent' : "Écris à l'agent… (/ commandes, @ fichiers)"}
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
