import { useEffect, useRef, type CSSProperties } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const WS_URL = 'ws://localhost:5174';

const panel: CSSProperties = {
  position: 'absolute', bottom: 16, zIndex: 25,
  width: 'min(420px, 92vw)', height: 'min(52vh, 520px)',
  display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
  background: '#0d0d0d', color: '#f0f0f0',
  border: '4px solid #333', boxShadow: '8px 8px 0 rgba(0,0,0,0.35)',
};

const titleBar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', background: '#1a1a1a', borderBottom: '4px solid #333',
  fontWeight: 700, flexShrink: 0,
};

const iconBtn: CSSProperties = {
  cursor: 'pointer', fontWeight: 700, background: 'transparent', border: 'none',
  color: 'inherit', fontSize: 14, padding: '0 4px',
};

interface TtyPanelProps {
  ttyId: string;
  title: string;
  cwd: string;
  rightOffset: number;  // px from right edge (accounts for chat panel being open)
  onClose: () => void;
}

export function TtyPanel({ ttyId, title, cwd, rightOffset, onClose }: TtyPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const cwdShort = cwd.split('/').slice(-2).join('/');

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'monospace',
      theme: {
        background: '#0d0d0d',
        foreground: '#f0f0f0',
        cursor: '#f0f0f0',
      },
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    const ws = new WebSocket(`${WS_URL}/ws/tty/${ttyId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'exit') { term.write('\r\n[Process exited]\r\n'); }
        } catch {
          term.write(e.data);
        }
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
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
    };
  }, [ttyId]);

  return (
    <div style={{ ...panel, right: rightOffset }}>
      <div style={titleBar}>
        <span>💻 {title}</span>
        <span style={{ fontSize: 11, color: '#888', flex: 1, marginLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cwdShort}
        </span>
        <button style={iconBtn} onClick={onClose} title="Fermer le terminal">✕</button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: 4 }} />
    </div>
  );
}
