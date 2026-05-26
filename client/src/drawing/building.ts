export interface BuildingFacadeOpts {
  x: number; y: number; w: number; h: number;
  name: string;
  floorCount: number;   // visual height cue (clamped)
  agentCount: number;   // lit windows
  active: boolean;      // recently active → brighter
  hovered: boolean;
}

// Pixel-art building facade: flat fills, dark outlines. Height of the window
// grid scales with floorCount; lit windows scale with agentCount; a sign shows
// the project name.
export function drawBuilding(ctx: CanvasRenderingContext2D, o: BuildingFacadeOpts): void {
  const floors = Math.max(2, Math.min(8, o.floorCount || 2));
  const bodyTop = o.y + o.h - (floors * 28 + 40);
  const bodyH = o.y + o.h - bodyTop;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(o.x + 8, o.y + o.h - 10, o.w, 12);

  // Body
  ctx.fillStyle = o.active ? '#6b7fb5' : '#52607f';
  ctx.fillRect(o.x, bodyTop, o.w, bodyH);
  ctx.strokeStyle = o.hovered ? '#ffd34d' : '#2b3450';
  ctx.lineWidth = o.hovered ? 3 : 2;
  ctx.strokeRect(o.x, bodyTop, o.w, bodyH);

  // Roof
  ctx.fillStyle = '#3a445f';
  ctx.fillRect(o.x - 6, bodyTop - 14, o.w + 12, 14);

  // Windows grid (cols x floors), lit up to agentCount
  const cols = 4;
  const total = cols * floors;
  const lit = Math.max(0, Math.min(total, o.agentCount));
  const wW = 26, wH = 16, padX = (o.w - cols * wW) / (cols + 1);
  let n = 0;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const wx = o.x + padX + c * (wW + padX);
      const wy = bodyTop + 14 + f * 28;
      ctx.fillStyle = n < lit ? '#ffe27a' : '#27304a';
      ctx.fillRect(wx, wy, wW, wH);
      ctx.strokeStyle = '#1c2236';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx, wy, wW, wH);
      n++;
    }
  }

  // Door
  const doorW = 34, doorH = 40;
  ctx.fillStyle = '#2b2030';
  ctx.fillRect(o.x + o.w / 2 - doorW / 2, o.y + o.h - doorH, doorW, doorH);

  // Sign
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(o.x, bodyTop - 38, o.w, 22);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(o.name.slice(0, 18), o.x + o.w / 2, bodyTop - 22);
  ctx.textAlign = 'left';
}
