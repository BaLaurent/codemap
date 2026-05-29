import { createContext, useCallback, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { TtyPanel } from './TtyPanel';
import { useChat } from './ChatHost';
import { getTtyTitle, setTtyTitle, clearTtyTitle } from '../utils/tty-titles';

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
  hideTty: () => void;
  closeTty: (ttyId: string) => void;
  renameTty: (ttyId: string, newTitle: string) => void;
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

  // Réhydrater les sessions survivantes au mount (ex: reload de page),
  // en appliquant les titres personnalisés stockés en localStorage.
  useEffect(() => {
    fetch(`${API_URL}/tty`)
      .then(r => r.ok ? r.json() : [])
      .then((sessions: TtySessionClient[]) =>
        setTtySessions(sessions.map(s => ({ ...s, title: getTtyTitle(s.ttyId, s.title) })))
      )
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
    setTtySessions(prev => [...prev, { ...info, title: getTtyTitle(info.ttyId, info.title) }]);
    setOpenTtyId(info.ttyId);
  }, []);

  const openTty = useCallback((ttyId: string) => setOpenTtyId(ttyId), []);

  // Masque le panel sans tuer la session — le buffer 64KB côté serveur
  // assure le replay de l'historique à la prochaine ouverture.
  const hideTty = useCallback(() => setOpenTtyId(null), []);

  const closeTty = useCallback((ttyId: string) => {
    fetch(`${API_URL}/tty/${ttyId}`, { method: 'DELETE' }).catch(() => { /* ignore */ });
    clearTtyTitle(ttyId);
    setTtySessions(prev => prev.filter(s => s.ttyId !== ttyId));
    setOpenTtyId(prev => prev === ttyId ? null : prev);
  }, []);

  const renameTty = useCallback((ttyId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setTtyTitle(ttyId, trimmed);
    setTtySessions(prev => prev.map(s => s.ttyId === ttyId ? { ...s, title: trimmed } : s));
  }, []);

  const control = useMemo<TtyControl>(
    () => ({ openTtyId, ttySessions, spawnTty, openTty, hideTty, closeTty, renameTty }),
    [openTtyId, ttySessions, spawnTty, openTty, hideTty, closeTty, renameTty],
  );

  // Le TTY se décale à gauche si le chat est aussi ouvert (chat: right 16, TTY: right 452)
  const chatOpen = chatAgentId !== null;
  const rightOffset = chatOpen ? 452 : 16;

  return (
    <TtyContext.Provider value={control}>
      {children}
      {/* Tous les panneaux restent montés ; seul l'actif est visible (visibility:hidden
          pour les autres, pas display:none — ce dernier met les dimensions à zéro).
          Garder le xterm + la WS vivants préserve l'état du terminal (mode souris de
          tmux, alt-screen…) au switch, ce que le replay brut de 64 KB ne peut pas
          reconstruire. TtyPanel n'ouvre xterm qu'à la PREMIÈRE activation (lazy-open) :
          ouvrir sur un conteneur caché empêche xterm d'initialiser son renderer
          (mesure de glyphe à 0 sous Firefox) → crash sur .dimensions. */}
      {ttySessions.map(session => (
        <TtyPanel
          key={session.ttyId}
          ttyId={session.ttyId}
          title={session.title}
          cwd={session.cwd}
          rightOffset={rightOffset}
          active={session.ttyId === openTtyId}
          onClose={() => closeTty(session.ttyId)}
          onMinimize={hideTty}
          onRename={newTitle => renameTty(session.ttyId, newTitle)}
        />
      ))}
    </TtyContext.Provider>
  );
}
