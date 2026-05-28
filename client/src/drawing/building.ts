import { seededRandom, adjustBrightness } from './utils';
import { buildingFloorCount, buildingNameSignRect } from '../layout/town-layout';

export interface BuildingFacadeOpts {
  x: number; y: number; w: number; h: number;
  name: string;
  agentCount: number;   // drives both floor count (visual height) and lit windows
  active: boolean;      // recently active → brighter
  hovered: boolean;
  seed: number;         // stable per project → picks the facade variant
}

// Warm, daytime palette matching the hotel interior. Each project draws a
// deterministic variant (body colour, roof shape, window columns, awning) so
// buildings stop looking like clones.
const BODY_COLORS = ['#E8C8A0', '#D8A878', '#C8B8E0', '#A8C8B0', '#E0B0A0', '#C8D0B0'];
const ROOF_COLORS = ['#B05038', '#8B6F47', '#5A7D8C', '#A05A7D', '#C87838'];
const GLASS_UNLIT = '#A8D0E8';  // hotel window glass (was near-black)
const GLASS_LIT = '#FFE27A';    // warm lit window (kept)

// Pixel-art building facade: flat fills, dark outlines, warm daytime palette.
// Window-grid height scales with agentCount (more agents → taller building);
// the same agentCount lights up the corresponding number of windows. The
// facade geometry helpers in town-layout.ts are the single source of truth so
// the hit-test (✕ badge) lines up with what we paint.
export function drawBuilding(ctx: CanvasRenderingContext2D, o: BuildingFacadeOpts): void {
  const rnd = (n: number) => seededRandom(o.seed + n);
  const floors = buildingFloorCount(o.agentCount);
  const cols = 3 + Math.floor(rnd(2) * 3);            // 3–5 window columns
  const roofStyle = Math.floor(rnd(3) * 3);           // 0 flat · 1 pitched · 2 stepped
  const hasAwning = rnd(4) > 0.5;
  const bodyBase = BODY_COLORS[Math.floor(rnd(0) * BODY_COLORS.length)];
  const body = o.active ? adjustBrightness(bodyBase, 0.1) : bodyBase;
  const roof = ROOF_COLORS[Math.floor(rnd(1) * ROOF_COLORS.length)];

  const bodyTop = o.y + o.h - (floors * 28 + 40);
  const bodyH = o.y + o.h - bodyTop;

  // Ground shadow.
  ctx.fillStyle = 'rgba(60, 50, 40, 0.28)';
  ctx.fillRect(o.x + 8, o.y + o.h - 10, o.w, 12);

  // Body.
  ctx.fillStyle = body;
  ctx.fillRect(o.x, bodyTop, o.w, bodyH);
  // Soft vertical shading for depth.
  ctx.fillStyle = adjustBrightness(body, -0.08);
  ctx.fillRect(o.x + o.w - 10, bodyTop, 10, bodyH);
  ctx.strokeStyle = o.hovered ? '#ffd34d' : adjustBrightness(body, -0.3);
  ctx.lineWidth = o.hovered ? 3 : 2;
  ctx.strokeRect(o.x, bodyTop, o.w, bodyH);

  drawRoof(ctx, o.x, bodyTop, o.w, roof, roofStyle);

  // Door geometry — reserved BEFORE the window grid so no window is drawn over
  // the doorway (a window on woodwork looks wrong). The awning sits just above.
  const doorW = 34, doorH = 40;
  const doorX = o.x + o.w / 2 - doorW / 2;
  const doorY = o.y + o.h - doorH;
  const awningTop = hasAwning ? doorY - 10 : doorY;
  const overlapsDoor = (wx: number, wy: number, wW: number, wH: number) =>
    wx < doorX + doorW && wx + wW > doorX && wy < doorY + doorH && wy + wH > awningTop;

  // Windows grid (cols × floors), lit up to agentCount; skip cells over the door.
  const total = cols * floors;
  const lit = Math.max(0, Math.min(total, o.agentCount));
  const wW = 26, wH = 16, padX = (o.w - cols * wW) / (cols + 1);
  let n = 0;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const wx = o.x + padX + c * (wW + padX);
      const wy = bodyTop + 14 + f * 28;
      if (overlapsDoor(wx, wy, wW, wH)) { n++; continue; }
      ctx.fillStyle = n < lit ? GLASS_LIT : GLASS_UNLIT;
      ctx.fillRect(wx, wy, wW, wH);
      // Glass glare.
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(wx + 2, wy + 2, wW - 12, 3);
      ctx.strokeStyle = adjustBrightness(body, -0.35);
      ctx.lineWidth = 1;
      ctx.strokeRect(wx, wy, wW, wH);
      n++;
    }
  }

  // Door (+ optional awning).
  if (hasAwning) {
    ctx.fillStyle = adjustBrightness(roof, 0.08);
    ctx.fillRect(doorX - 8, doorY - 10, doorW + 16, 8);
    ctx.fillStyle = adjustBrightness(roof, -0.12);
    ctx.fillRect(doorX - 8, doorY - 3, doorW + 16, 3);
  }
  ctx.fillStyle = '#5A3B2A';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = '#6E4A34';
  ctx.fillRect(doorX + 3, doorY + 3, doorW - 6, doorH - 3);
  ctx.fillStyle = '#E8C860';   // door knob
  ctx.fillRect(doorX + doorW - 9, doorY + doorH / 2, 3, 3);

  // Name sign — warm wood plaque. Geometry lives in town-layout so the close
  // badge (hit-test) can anchor to the exact same rect.
  const sign = buildingNameSignRect({ x: o.x, y: o.y, agentCount: o.agentCount });
  ctx.fillStyle = '#4A3B1A';
  ctx.fillRect(sign.x, sign.y, sign.w, sign.h);
  ctx.fillStyle = '#FFF8E8';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(o.name.slice(0, 18), sign.x + sign.w / 2, sign.y + sign.h - 6);
  ctx.textAlign = 'left';
}

function drawRoof(ctx: CanvasRenderingContext2D, x: number, bodyTop: number, w: number, roof: string, style: number): void {
  if (style === 1) {
    // Pitched roof (triangle).
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - 6, bodyTop);
    ctx.lineTo(x + w / 2, bodyTop - 26);
    ctx.lineTo(x + w + 6, bodyTop);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = adjustBrightness(roof, 0.12);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, bodyTop - 26);
    ctx.lineTo(x + w + 6, bodyTop);
    ctx.lineTo(x + w - 6, bodyTop);
    ctx.closePath();
    ctx.fill();
  } else if (style === 2) {
    // Stepped / two-tier slab.
    ctx.fillStyle = roof;
    ctx.fillRect(x - 6, bodyTop - 14, w + 12, 14);
    ctx.fillStyle = adjustBrightness(roof, 0.1);
    ctx.fillRect(x + w / 4, bodyTop - 24, w / 2, 12);
  } else {
    // Flat slab.
    ctx.fillStyle = roof;
    ctx.fillRect(x - 6, bodyTop - 14, w + 12, 14);
    ctx.fillStyle = adjustBrightness(roof, -0.12);
    ctx.fillRect(x - 6, bodyTop - 4, w + 12, 4);
  }
}
