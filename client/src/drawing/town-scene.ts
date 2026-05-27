// Town backdrop: grass map, sidewalks, roads and street furniture.
// Draws ONLY the environment — buildings are drawn separately by the caller,
// on top of this scene. Pure draw function; all geometry is injected.
import type { StreetGeometry } from '../layout/town-layout';
import { TILE_SIZE } from './types';
import { drawGrassTile, drawPathTile } from './tiles';
import { drawTree } from './outdoor';
import { adjustBrightness } from './utils';

const ASPHALT = '#6B6358';      // warm grey road, fits the hotel's warm palette
const CURB = '#CFC4B4';         // pale curb edge on the sidewalk
const LANE = '#E8D060';         // dashed centre line (amber)
const CROSSWALK = '#EDE6D6';

export interface TownSceneOpts {
  width: number;
  height: number;
  geometry: StreetGeometry;
  frame: number;
}

export function drawTownScene(ctx: CanvasRenderingContext2D, o: TownSceneOpts): void {
  drawGrassGround(ctx, o.width, o.height, o.frame);
  for (const row of o.geometry.rows) {
    drawSidewalk(ctx, o.width, row.sidewalkY, row.sidewalkH);
    drawRoad(ctx, o.width, row.roadY, row.roadH);
  }
  // Trees first (they sit on the grass behind the sidewalk), lampposts last.
  for (const t of o.geometry.trees) drawTree(ctx, t.x, t.y, t.type, t.seed, o.frame);
  for (const l of o.geometry.lampposts) drawLamppost(ctx, l.x, l.y);
}

// Tiled grass across the whole canvas — seed is positional (never frame-based)
// so the variant pattern stays stable and never flickers between frames.
function drawGrassGround(ctx: CanvasRenderingContext2D, width: number, height: number, frame: number): void {
  const cols = Math.ceil(width / TILE_SIZE) + 1;
  const rows = Math.ceil(height / TILE_SIZE) + 1;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      drawGrassTile(ctx, tx * TILE_SIZE, ty * TILE_SIZE, tx * 127 + ty * 311, frame);
    }
  }
}

function drawSidewalk(ctx: CanvasRenderingContext2D, width: number, y: number, h: number): void {
  const cols = Math.ceil(width / TILE_SIZE) + 1;
  const rows = Math.ceil(h / TILE_SIZE);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      drawPathTile(ctx, tx * TILE_SIZE, y + ty * TILE_SIZE, tx * 53 + ty * 97);
    }
  }
  ctx.fillStyle = CURB;
  ctx.fillRect(0, y, width, 2);
  ctx.fillRect(0, y + h - 2, width, 2);
}

function drawRoad(ctx: CanvasRenderingContext2D, width: number, y: number, h: number): void {
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, y, width, h);
  // Subtle shading at the edges for depth.
  ctx.fillStyle = adjustBrightness(ASPHALT, -0.12);
  ctx.fillRect(0, y, width, 3);
  ctx.fillRect(0, y + h - 3, width, 3);
  // Dashed centre line.
  ctx.fillStyle = LANE;
  const cy = y + h / 2 - 2;
  for (let x = 12; x < width; x += 48) ctx.fillRect(x, cy, 24, 4);
  // Crosswalk down the middle of the map, tying the rows together.
  const cwX = width / 2 - 42;
  ctx.fillStyle = CROSSWALK;
  for (let i = 0; i < 6; i++) ctx.fillRect(cwX + i * 14, y + 4, 8, h - 8);
}

// Pixel-art street lamp. `baseY` is the sidewalk surface the pole stands on.
function drawLamppost(ctx: CanvasRenderingContext2D, x: number, baseY: number): void {
  const poleH = 64;
  const top = baseY - poleH;
  // Foot.
  ctx.fillStyle = '#3A3630';
  ctx.fillRect(x - 4, baseY - 6, 11, 8);
  // Pole + highlight.
  ctx.fillStyle = '#4A4640';
  ctx.fillRect(x - 2, top, 5, poleH);
  ctx.fillStyle = '#5C574E';
  ctx.fillRect(x - 2, top, 2, poleH);
  // Arm reaching toward the building.
  ctx.fillStyle = '#4A4640';
  ctx.fillRect(x - 2, top, 13, 3);
  // Lamp housing + warm bulb.
  ctx.fillStyle = '#3A3630';
  ctx.fillRect(x + 8, top - 3, 9, 9);
  ctx.fillStyle = '#FFE070';
  ctx.fillRect(x + 9, top - 1, 7, 6);
  // Soft glow.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#FFF0A0';
  ctx.beginPath();
  ctx.arc(x + 12, top + 2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
