import { useEffect, useRef, useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { layoutTown, BUILDING_SIZE, PlacedBuilding } from '../layout/town-layout';
import { drawBuilding } from '../drawing';
import { HabboRoom } from './HabboRoom';

export function TownView() {
  const { projectsRef } = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const placedRef = useRef<PlacedBuilding[]>([]);
  const hoverRef = useRef<string | null>(null);

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
      if (placedRef.current.length === 0) {
        ctx.fillStyle = '#8a93a6';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No projects yet — run Claude/Cursor in a repo to raise a building.', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
      }
      raf = requestAnimationFrame(render);
    };
    render();

    const hit = (mx: number, my: number) =>
      placedRef.current.find(b =>
        mx >= b.x && mx <= b.x + BUILDING_SIZE.w && my >= b.y && my <= b.y + BUILDING_SIZE.h);
    const onMove = (e: MouseEvent) => {
      const b = hit(e.clientX, e.clientY);
      hoverRef.current = b ? b.projectId : null;
      canvas.style.cursor = b ? 'pointer' : 'default';
    };
    const onClick = (e: MouseEvent) => {
      const b = hit(e.clientX, e.clientY);
      if (b) setSelected(b.projectId);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [selected, projectsRef]);

  if (selected) {
    return (
      <>
        <HabboRoom projectId={selected} />
        <button
          onClick={() => setSelected(null)}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 30,
            padding: '10px 18px', cursor: 'pointer',
            background: 'rgba(17,24,39,0.95)', color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
            fontWeight: 600,
          }}
        >← Town</button>
      </>
    );
  }

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}
