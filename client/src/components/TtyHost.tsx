import { createContext, useCallback, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { TtyPanel } from './TtyPanel';
import { useChat } from './ChatHost';

const API_URL = 'http://localhost:5174/api';

interface TtySessionClient {
  ttyId: string;
  title: string;
  cwd: string;
}

interface TtyControl {
  openTtyId: string | null;
  ttySessions: TtySessionClient[];
  spawnTty: (projectId?: string) => Promise<void>;
  openTty: (ttyId: string) => void;
  closeTty: (ttyId: string) => void;
}

const TtyContext = createContext<TtyControl | null>(null);

export function useTty(): TtyControl {
  const ctx = useContext(TtyContext);
  if (!ctx) throw new Error('useTty must be used within a TtyProvider');
  return ctx;
}

export function TtyProvider({ children }: { children: ReactNode }) {
  const [openTtyId, setOpenTtyId] = useState<string | null>(null);
  const [ttySessions, setTtySessions] = useState<TtySessionClient[]>([]);
  const { chatAgentId } = useChat();

  // Réhydrater les sessions survivantes au mount (ex: reload de page)
  useEffect(() => {
    fetch(`${API_URL}/tty`)
      .then(r => r.ok ? r.json() : [])
      .then((sessions: TtySessionClient[]) => setTtySessions(sessions))
      .catch(() => { /* serveur indisponible */ });
  }, []);

  const spawnTty = useCallback(async (projectId?: string) => {
    const r = await fetch(`${API_URL}/tty/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    if (!r.ok) return;
    const info: TtySessionClient = await r.json();
    setTtySessions(prev => [...prev, info]);
    setOpenTtyId(info.ttyId);
  }, []);

  const openTty = useCallback((ttyId: string) => setOpenTtyId(ttyId), []);

  const closeTty = useCallback((ttyId: string) => {
    fetch(`${API_URL}/tty/${ttyId}`, { method: 'DELETE' }).catch(() => { /* ignore */ });
    setTtySessions(prev => prev.filter(s => s.ttyId !== ttyId));
    setOpenTtyId(prev => prev === ttyId ? null : prev);
  }, []);

  const control = useMemo<TtyControl>(
    () => ({ openTtyId, ttySessions, spawnTty, openTty, closeTty }),
    [openTtyId, ttySessions, spawnTty, openTty, closeTty],
  );

  // Le TTY se décale à gauche si le chat est aussi ouvert (chat: right 16, TTY: right 452)
  const chatOpen = chatAgentId !== null;
  const rightOffset = chatOpen ? 452 : 16;

  return (
    <TtyContext.Provider value={control}>
      {children}
      {/* Seul le panneau actif est monté — xterm.js requiert un conteneur
          visible pour initialiser son renderer. Le buffer serveur assure
          le replay de l'historique à chaque (re)connexion. */}
      {ttySessions.map(session =>
        session.ttyId === openTtyId ? (
          <TtyPanel
            key={session.ttyId}
            ttyId={session.ttyId}
            title={session.title}
            cwd={session.cwd}
            rightOffset={rightOffset}
            onClose={() => closeTty(session.ttyId)}
          />
        ) : null
      )}
    </TtyContext.Provider>
  );
}
