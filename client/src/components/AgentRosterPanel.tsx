// Persistent, collapsible roster of every agent across all projects. Lives in
// HotelView (the always-mounted parent), so it stays visible in the town view
// and inside any building. Left-click an agent to fly the camera to it;
// right-click to rename. Data comes from useAgentRoster (React state); custom
// names from the agent-names store (shared with the canvas bubble).
import { useEffect, useState, type CSSProperties } from 'react';
import { useAgentRoster, RosterState } from '../hooks/useAgentRoster';
import { setAgentName, clearAgentName, hasCustomName } from '../utils/agent-names';

export interface AgentFocusRequest {
  projectId?: string;
  agentId: string;
}

// A focus request stamped with a timestamp so re-clicking the SAME agent still
// re-triggers the consumer's effect (a plain agentId would compare equal).
export interface FocusRequest extends AgentFocusRequest {
  ts: number;
}

const COLLAPSED_KEY = 'codemap-roster-collapsed';
const GROUPS_KEY = 'codemap-roster-groups-collapsed';

const STATE_META: Record<RosterState, { color: string; label: string }> = {
  working: { color: '#34d399', label: 'Travaille' },
  waiting: { color: '#f87171', label: 'En attente' },
  idle: { color: '#6b7280', label: 'Inactif' },
};

function groupKey(projectId: string | null): string {
  return projectId ?? '__none__';
}

function loadBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `il y a ${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `il y a ${Math.floor(ms / 60_000)}min`;
  return `il y a ${Math.floor(ms / 3_600_000)}h`;
}

const panel: CSSProperties = {
  position: 'absolute', top: 70, right: 16, zIndex: 20, width: 260,
  backgroundColor: 'rgba(17, 24, 39, 0.9)', borderRadius: 12,
  color: '#e5e7eb', fontSize: 13,
  border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(8px)',
  maxHeight: '60vh', display: 'flex', flexDirection: 'column',
};

const header: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 14px', cursor: 'pointer', fontWeight: 600, color: '#f9fafb',
  userSelect: 'none',
};

const groupHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 14px', cursor: 'pointer', userSelect: 'none',
  fontSize: 12, fontWeight: 600, color: '#9ca3af',
  borderTop: '1px solid rgba(255,255,255,0.06)',
};

const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 14px 6px 22px', cursor: 'pointer',
};

const menuStyle: CSSProperties = {
  position: 'fixed', zIndex: 30, minWidth: 160,
  backgroundColor: 'rgba(17, 24, 39, 0.98)', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  overflow: 'hidden', fontSize: 13,
};

const menuItem: CSSProperties = {
  padding: '8px 14px', cursor: 'pointer', color: '#e5e7eb',
};

export function AgentRosterPanel({ onSelectAgent }: {
  onSelectAgent: (req: AgentFocusRequest) => void;
}) {
  const groups = useAgentRoster();
  const [collapsed, setCollapsed] = useState(() => loadBool(COLLAPSED_KEY));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => loadSet(GROUPS_KEY));
  const [menu, setMenu] = useState<{ agentId: string; baseName: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ agentId: string; value: string } | null>(null);

  const totalAgents = groups.reduce((n, g) => n + g.agents.length, 0);

  const togglePanel = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? 'true' : 'false'); } catch { /* ignore */ }
  };

  const toggleGroup = (projectId: string | null) => {
    const key = groupKey(projectId);
    const next = new Set(collapsedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedGroups(next);
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };

  // Close the context menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  const commitEdit = () => {
    if (editing) setAgentName(editing.agentId, editing.value);
    setEditing(null);
  };

  const now = Date.now();

  return (
    <>
      <div style={panel}>
        <div style={header} onClick={togglePanel} title={collapsed ? 'Déplier' : 'Replier'}>
          <span>Agents ({totalAgents})</span>
          <span>{collapsed ? '▸' : '▾'}</span>
        </div>

        {!collapsed && (
          <div style={{ overflowY: 'auto' }}>
            {groups.length === 0 && (
              <div style={{ padding: '10px 14px', color: '#8a93a6' }}>Aucun agent actif.</div>
            )}
            {groups.map(group => {
              const gkey = groupKey(group.projectId);
              const groupCollapsed = collapsedGroups.has(gkey);
              return (
                <div key={gkey}>
                  <div style={groupHeader} onClick={() => toggleGroup(group.projectId)}>
                    <span>{groupCollapsed ? '▸' : '▾'}</span>
                    <span>{group.projectName}</span>
                    <span style={{ opacity: 0.6 }}>({group.agents.length})</span>
                  </div>
                  {!groupCollapsed && group.agents.map(a => {
                    const meta = STATE_META[a.state];
                    const isEditing = editing?.agentId === a.agentId;
                    return (
                      <div
                        key={a.agentId}
                        style={row}
                        title={a.toolInput || undefined}
                        onClick={() => { if (!isEditing) onSelectAgent({ projectId: a.projectId, agentId: a.agentId }); }}
                        onContextMenu={e => {
                          e.preventDefault();
                          setMenu({ agentId: a.agentId, baseName: a.baseName, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <span style={{
                          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                          backgroundColor: meta.color, boxShadow: `0 0 6px ${meta.color}80`,
                        }} title={meta.label} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editing!.value}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setEditing({ agentId: a.agentId, value: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitEdit();
                                else if (e.key === 'Escape') setEditing(null);
                              }}
                              onBlur={commitEdit}
                              style={{
                                width: '100%', boxSizing: 'border-box', fontSize: 13,
                                background: 'rgba(255,255,255,0.1)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, padding: '2px 4px',
                              }}
                            />
                          ) : (
                            <>
                              <div style={{
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>{a.displayName}</div>
                              <div style={{ fontSize: 11, color: '#8a93a6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {a.currentCommand ? `${a.currentCommand} · ` : ''}{formatAge(now - a.lastActivity)}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {menu && (
        <div style={{ ...menuStyle, left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}>
          <div
            style={menuItem}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setEditing({ agentId: menu.agentId, value: menu.baseName }); setMenu(null); }}
          >Renommer</div>
          {hasCustomName(menu.agentId) && (
            <div
              style={{ ...menuItem, borderTop: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => { clearAgentName(menu.agentId); setMenu(null); }}
            >Réinitialiser le nom</div>
          )}
        </div>
      )}
    </>
  );
}
