// client/src/components/FolderBrowser.tsx
// Pixel-art directory browser: descends the filesystem via /api/fs/list and pins
// the chosen folder as a building (POST /api/projects). Palette matches SpawnPanel.
import { useEffect, useState, type CSSProperties } from 'react';

const API_URL = 'http://localhost:5174/api';
const C = { ink: '#3A2E12', border: '#4A3B1A', gold: '#FFE040', cream: '#FFF8E6' };

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, width: 380, maxHeight: '70vh', boxSizing: 'border-box',
  background: C.cream, border: `4px solid ${C.border}`, boxShadow: '6px 6px 0 rgba(0,0,0,0.35)', padding: 10,
};
const row: CSSProperties = {
  fontFamily: 'monospace', fontSize: 13, color: C.ink, background: '#fff',
  border: `2px solid ${C.border}`, padding: '5px 8px', cursor: 'pointer', textAlign: 'left',
};
const goldBtn: CSSProperties = {
  fontFamily: 'monospace', fontWeight: 700, fontSize: 13, padding: '6px 12px', color: C.ink,
  background: C.gold, border: `3px solid ${C.border}`, boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', cursor: 'pointer',
};

interface Listing { path: string; parent: string | null; entries: { name: string; path: string }[]; }

export function FolderBrowser({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState('');

  const load = (path?: string) => {
    const url = path ? `${API_URL}/fs/list?path=${encodeURIComponent(path)}` : `${API_URL}/fs/list`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: Listing) => { setListing(d); setError(''); })
      .catch(() => setError('Dossier illisible'));
  };

  useEffect(() => { load(); }, []);

  const addHere = () => {
    if (!listing) return;
    fetch(`${API_URL}/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: listing.path }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => { onAdded(); onClose(); })
      .catch(() => setError('Impossible d’ajouter ce dossier'));
  };

  return (
    <div style={wrap} tabIndex={-1} autoFocus onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>📁 Ajouter un dossier</span>
        <button style={{ ...goldBtn, background: 'transparent', boxShadow: 'none', border: 'none' }} onClick={onClose} title="Fermer">✕</button>
      </div>

      <div style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.7, wordBreak: 'break-all' }}>{listing?.path ?? '…'}</div>
      {error && <div style={{ color: '#B00020', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
        {listing?.parent && <button style={row} onClick={() => load(listing.parent!)}>⬆ ..</button>}
        {listing?.entries.map(e => (
          <button key={e.path} style={row} onClick={() => load(e.path)}>📁 {e.name}</button>
        ))}
        {listing && listing.entries.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.6, padding: 4 }}>(aucun sous-dossier)</div>
        )}
      </div>

      <button style={goldBtn} onClick={addHere} disabled={!listing}>Ajouter ici</button>
    </div>
  );
}
