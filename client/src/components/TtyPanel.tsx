import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { cwdShort } from '../utils/path-display';

const WS_URL = 'ws://localhost:5174';
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 240;

const titleBarStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', background: '#1a1a1a', borderBottom: '4px solid #333',
  fontWeight: 700, flexShrink: 0, userSelect: 'none',
};

const iconBtn: CSSProperties = {
  cursor: 'pointer', fontWeight: 700, background: 'transparent', border: 'none',
  color: 'inherit', fontSize: 14, padding: '0 4px',
};

const titleInput: CSSProperties = {
  background: 'transparent', border: 'none', outline: 'none',
  color: 'inherit', fontWeight: 700, fontSize: 'inherit',
  fontFamily: 'inherit', padding: 0, width: '8em',
};

interface TtyPanelProps {
  ttyId: string;
  title: string;
  cwd: string;
  rightOffset: number;
  active: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRename: (newTitle: string) => void;
}

export function TtyPanel({ ttyId, title, cwd, rightOffset, active, onClose, onMinimize, onRename }: TtyPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // ── Rename ──────────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  // Sync local edit buffer when parent renames from outside (e.g., on mount)
  useEffect(() => { setEditValue(title); }, [title]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    else setEditValue(title);
  }, [editValue, title, onRename]);

  const handleRenameKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') { setEditing(false); setEditValue(title); }
  }, [commitRename, title]);

  // ── Width resize (left-edge drag) ────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(DEFAULT_WIDTH);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = resizeStartX.current - e.clientX; // drag left → wider
      const maxW = Math.floor(window.innerWidth * 0.92);
      setPanelWidth(Math.max(MIN_WIDTH, Math.min(maxW, resizeStartWidth.current + delta)));
    };
    const onUp = () => { isResizing.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── xterm ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'monospace',
      theme: { background: '#0d0d0d', foreground: '#f0f0f0', cursor: '#f0f0f0' },
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const ws = new WebSocket(`${WS_URL}/ws/tty/${ttyId}`);
    ws.onopen = () => {
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'exit') term.write('\r\n[Process exited]\r\n');
        } catch {
          term.write(e.data);
        }
      }
    };
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [ttyId]);

  // Le panel reste monté quand on en ouvre un autre (état xterm + WS préservés,
  // donc le mode souris de tmux survit au switch). Au retour : re-fit défensif si
  // la fenêtre a changé pendant qu'on était caché, puis focus pour router les frappes.
  useEffect(() => {
    if (!active) return;
    fitAddonRef.current?.fit();
    termRef.current?.focus();
  }, [active]);

  const short = cwdShort(cwd);

  return (
    <div style={{
      position: 'absolute', bottom: 16, right: rightOffset, zIndex: active ? 26 : 25,
      width: panelWidth, height: 'min(52vh, 520px)',
      display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      background: '#0d0d0d', color: '#f0f0f0',
      border: '4px solid #333', boxShadow: '8px 8px 0 rgba(0,0,0,0.35)',
      overflow: 'visible',
      // Caché mais TOUJOURS monté : visibility (≠ display:none) garde des dimensions
      // réelles pour fitAddon.fit(), et conserve le xterm + la WS vivants au switch.
      visibility: active ? 'visible' : 'hidden',
      pointerEvents: active ? 'auto' : 'none',
    }}>
      {/* Poignée de redimensionnement — bord gauche */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          position: 'absolute', left: -4, top: 0, bottom: 0, width: 8,
          cursor: 'ew-resize', zIndex: 1,
        }}
      />

      <div style={titleBarStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span>💻</span>
          {editing ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKey}
              style={titleInput}
            />
          ) : (
            <span
              onDoubleClick={() => { setEditing(true); setEditValue(title); }}
              title="Double-clic pour renommer"
              style={{ cursor: 'text' }}
            >
              {title}
            </span>
          )}
        </span>
        <span style={{
          fontSize: 11, color: '#888', flex: 1, marginLeft: 8,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {short}
        </span>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button style={iconBtn} onClick={onMinimize} title="Réduire">─</button>
          <button style={iconBtn} onClick={onClose} title="Fermer le terminal">✕</button>
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: 4 }} />
    </div>
  );
}
