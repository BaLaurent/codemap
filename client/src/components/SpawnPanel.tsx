// Spawn form for launching an agent from the hotel with terminal-like choices:
// the task, the permission mode (which decides whether tool use opens the hotel
// modal), and — when the project's capabilities are known — the model and the
// subagent type. Pixel-art palette matches the chat panel.
import { useState, type CSSProperties } from 'react';
import type { ModelOption, SubagentOption } from '../types';
import { PERMISSION_MODE_OPTIONS } from './permission-modes';
import { buildModelOptions } from './model-options';
import { EFFORT_OPTIONS, EFFORT_TOOLTIP } from './effort-options-ui';

const C = { ink: '#3A2E12', border: '#4A3B1A', gold: '#FFE040', cream: '#FFF8E6' };

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, width: 320, boxSizing: 'border-box',
  background: C.cream, border: `4px solid ${C.border}`, boxShadow: '6px 6px 0 rgba(0,0,0,0.35)', padding: 10,
};
const field: CSSProperties = {
  boxSizing: 'border-box', width: '100%', padding: '6px 8px', fontFamily: 'monospace', fontSize: 13,
  color: C.ink, background: '#fff', border: `2px solid ${C.border}`,
};
const label: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 };
const goldBtn: CSSProperties = {
  fontFamily: 'monospace', fontWeight: 700, fontSize: 13, padding: '6px 12px',
  color: C.ink, background: C.gold, border: `3px solid ${C.border}`, boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', cursor: 'pointer',
};

export interface SpawnRequest {
  initialPrompt: string;
  permissionMode: string;
  model?: string;
  agent?: string;
  /** Effort knob for thinking depth. Sent as-is; the server whitelists it.
   *  Values: 'low'|'medium'|'high'|'xhigh'|'max'|'off' (off → thinking disabled).
   *  Undefined → not sent → SDK adaptive default (Opus 4.6+). */
  effort?: string;
}

// (effort presets live in effort-options-ui.ts so the chat panel reuses them)

export function SpawnPanel({ models, agents, onSpawn, onClose }: {
  models: ModelOption[];
  agents: SubagentOption[];
  onSpawn: (req: SpawnRequest) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [permissionMode, setPermissionMode] = useState('default');
  const [model, setModel] = useState('default');  // 'default' → CLI default
  const [agent, setAgent] = useState('');           // '' → no specific subagent
  const [effort, setEffort] = useState('default'); // 'default' → don't pass to SDK

  const launch = () => {
    const initialPrompt = draft.trim();
    if (!initialPrompt) return;
    onSpawn({
      initialPrompt, permissionMode,
      model: model && model !== 'default' ? model : undefined,
      agent: agent || undefined,
      effort: effort && effort !== 'default' ? effort : undefined,
    });
  };

  return (
    <div style={wrap} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>🪄 Nouvel agent</span>
        <button style={{ ...goldBtn, background: 'transparent', boxShadow: 'none', border: 'none' }} onClick={onClose} title="Fermer">✕</button>
      </div>

      <input
        autoFocus
        style={field}
        placeholder="Tâche pour le nouvel agent…"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); launch(); } }}
      />

      <div>
        <div style={label}>Permissions</div>
        <select style={field} value={permissionMode} onChange={e => setPermissionMode(e.target.value)}>
          {PERMISSION_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <div style={label}>Modèle</div>
        <select style={field} value={model} onChange={e => setModel(e.target.value)}>
          {buildModelOptions(models, model).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <div style={label}>Agent</div>
        <select style={field} value={agent} onChange={e => setAgent(e.target.value)}>
          <option value="">Défaut</option>
          {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
      </div>

      <div>
        <div style={label}>Effort de réflexion</div>
        <select style={field} value={effort} onChange={e => setEffort(e.target.value)} title={EFFORT_TOOLTIP}>
          {EFFORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <button style={goldBtn} onClick={launch}>Lancer</button>
    </div>
  );
}
