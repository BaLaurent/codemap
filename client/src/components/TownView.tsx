import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useProjects } from '../hooks/useProjects';
import { layoutTown, BUILDING_SIZE, PlacedBuilding } from '../layout/town-layout';
import { drawBuilding } from '../drawing';
import { HabboRoom } from './HabboRoom';
import type { FocusRequest, ActionRequest } from './AgentRosterPanel';
import { hitTownAt, closeBadgeRect, removeAction } from '../layout/town-hit-test';
import { FolderBrowser } from './FolderBrowser';

// Controlled by the parent: `selected` is the project being viewed (null = town
// overview), `onSelect` flips it. The "Town" back control lives in the parent's
// nav cluster, so this component only renders the town canvas or the interior.
// `focusRequest` is forwarded to the interior so the roster panel can fly the
// camera to a specific agent.
export function TownView({ selected, onSelect, focusRequest, actionRequest }: {
  selected: string | null;
  onSelect: (projectId: string | null) => void;
  focusRequest?: FocusRequest | null;
  actionRequest?: ActionRequest | null;
}) {
  const { projectsRef } = useProjects();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const placedRef = useRef<PlacedBuilding[]>([]);
  const hoverRef = useRef<string | null>(null);

  const API_URL = 'http://localhost:5174/api';
  const [browsing, setBrowsing] = useState(false);
  const [confirmKill, setConfirmKill] = useState<{ projectId: string; name: string; agents: number } | null>(null);

  useEffect(() => {
    if (selected) return; // interior takes over
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let raf = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      placedRef.current = layoutTown(projectsRef.current);
      ctx.fillStyle = '#1b2233';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // street
      ctx.fillStyle = '#10151f';
      ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
      for (const b of placedRef.current) {
        drawBuilding(ctx, {
          x: b.x, y: b.y, w: BUILDING_SIZE.w, h: BUILDING_SIZE.h,
          name: b.projectName,
          floorCount: Math.max(2, b.agentCount + 2),
          agentCount: b.agentCount,
          active: Date.now() - b.lastActivity < 60000,
          hovered: hoverRef.current === b.projectId,
        });
      }
      // Close (✕) badge on pinned buildings.
      for (const b of placedRef.current) {
        if (!b.isPinned) continue;
        const r = closeBadgeRect(b);
        ctx.fillStyle = '#B00020';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✕', r.x + r.w / 2, r.y + r.h - 4);
        ctx.textAlign = 'left';
      }
      // "+" button to add a folder (top-right corner).
      ctx.fillStyle = '#FFE040';
      ctx.fillRect(canvas.width - 44, 12, 32, 32);
      ctx.fillStyle = '#3A2E12';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+', canvas.width - 28, 37);
      ctx.textAlign = 'left';
      if (placedRef.current.length === 0) {
        ctx.fillStyle = '#8a93a6';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Aucun projet — lance Claude/Cursor dans un repo, ou clique « + » pour ajouter un dossier.', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
      }
      raf = requestAnimationFrame(render);
    };
    render();

    const onMove = (e: MouseEvent) => {
      const h = hitTownAt(placedRef.current, e.clientX, e.clientY);
      hoverRef.current = h ? h.building.projectId : null;
      canvas.style.cursor = h ? 'pointer' : 'default';
    };
    const onClick = (e: MouseEvent) => {
      // "+" button (top-right corner) opens the folder browser.
      if (e.clientX >= canvas.width - 44 && e.clientX <= canvas.width - 12 && e.clientY >= 12 && e.clientY <= 44) {
        setBrowsing(true);
        return;
      }
      const h = hitTownAt(placedRef.current, e.clientX, e.clientY);
      if (!h) return;
      if (h.region === 'close') {
        if (removeAction(h.building) === 'confirm') {
          setConfirmKill({ projectId: h.building.projectId, name: h.building.projectName, agents: h.building.agentCount });
        } else {
          fetch(`${API_URL}/projects/${encodeURIComponent(h.building.projectId)}`, { method: 'DELETE' }).catch(() => {});
        }
        return;
      }
      onSelect(h.building.projectId);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [selected, projectsRef, onSelect]);

  if (selected) {
    // key={selected} forces a fresh HabboRoom when jumping straight from one
    // building to another (e.g. via the roster panel). Without it React reuses
    // the instance and its refs stay pinned to the previous building, so the
    // target agent never materializes and the camera never moves. Re-mounting
    // gives a clean scene; focusRequest (a prop) is read on mount and applied
    // once the agent appears.
    return <HabboRoom key={selected} projectId={selected} focusRequest={focusRequest} actionRequest={actionRequest} />;
  }

  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.4)', zIndex: 50,
  };

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      {browsing && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setBrowsing(false); }}>
          <FolderBrowser onClose={() => setBrowsing(false)} />
        </div>
      )}
      {confirmKill && (
        <div style={overlay}>
          <div style={{ background: '#FFF8E6', border: '4px solid #4A3B1A', boxShadow: '6px 6px 0 rgba(0,0,0,0.35)', padding: 16, fontFamily: 'monospace', color: '#3A2E12', width: 340 }}>
            <div style={{ marginBottom: 12 }}>
              {confirmKill.agents} agent(s) tournent dans « {confirmKill.name} ». Les tuer et retirer le bâtiment ?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ fontFamily: 'monospace', padding: '6px 12px', border: '3px solid #4A3B1A', background: '#fff', cursor: 'pointer' }} onClick={() => setConfirmKill(null)}>Non</button>
              <button style={{ fontFamily: 'monospace', fontWeight: 700, padding: '6px 12px', border: '3px solid #4A3B1A', background: '#B00020', color: '#fff', cursor: 'pointer' }}
                onClick={() => { fetch(`${API_URL}/projects/${encodeURIComponent(confirmKill.projectId)}?kill=true`, { method: 'DELETE' }).catch(() => {}); setConfirmKill(null); }}>Oui, tuer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
