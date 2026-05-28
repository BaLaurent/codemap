import { ProjectInfo } from '../types';
import type { TreeType } from '../drawing';

export const BUILDINGS_PER_ROW = 4;
const BUILDING_W = 220;   // px, facade footprint
const BUILDING_H = 260;
const GAP_X = 80;
const GAP_Y = 120;
const MARGIN = 80;

export interface PlacedBuilding extends ProjectInfo {
  row: number;
  col: number;
  x: number;   // top-left px in town world space
  y: number;
}

// Arranges buildings into a wrapping grid. Caller provides them pre-sorted;
// layout preserves that order.
export function layoutTown(projects: ProjectInfo[]): PlacedBuilding[] {
  return projects.map((proj, i) => {
    const col = i % BUILDINGS_PER_ROW;
    const row = Math.floor(i / BUILDINGS_PER_ROW);
    return {
      ...proj,
      row, col,
      x: MARGIN + col * (BUILDING_W + GAP_X),
      y: MARGIN + row * (BUILDING_H + GAP_Y),
    };
  });
}

export const BUILDING_SIZE = { w: BUILDING_W, h: BUILDING_H };

// --- Facade geometry (shared between drawer and hit-test) ----------------
// The facade height grows with agent count (more agents = taller building).
// Both the renderer (drawing/building.ts) and the hit-test (town-hit-test.ts)
// need the same numbers — the ✕ badge must sit exactly on the name plaque the
// renderer paints. Anything that needs to derive coordinates from a building's
// activity uses these helpers; no module re-implements the formula.

// Number of visible floors on a building, clamped to the renderer's range.
export function buildingFloorCount(agentCount: number): number {
  return Math.max(2, Math.min(8, agentCount + 2));
}

// Top-of-body Y in world coordinates. Everything above this line is roof.
export function buildingBodyTop(b: { y: number; agentCount: number }): number {
  return b.y + BUILDING_H - (buildingFloorCount(b.agentCount) * 28 + 40);
}

// Pixel rect of the warm-wood name plaque painted above the body. The close
// badge anchors to its top-right corner so it always lines up with the name.
export function buildingNameSignRect(b: { x: number; y: number; agentCount: number }): { x: number; y: number; w: number; h: number } {
  return { x: b.x, y: buildingBodyTop(b) - 38, w: BUILDING_W, h: 22 };
}

// --- Street furniture geometry -------------------------------------------
// The town reads as a top-down map (like the hotel's grass exterior) with
// front-facing building facades. Each row of buildings stands on a continuous
// sidewalk, with a road running in front of it. Derived purely from the placed
// buildings so the scene never hard-codes positions.

const SIDEWALK_H = 32;       // 2 tiles — buildings stand on this
const ROAD_H = 56;           // asphalt strip in front of the sidewalk
const LAMP_OFFSET = 18;      // lamppost sits just left of each building
const TREE_GAP_INSET = 24;   // tree sits in the gap to the right of a building
const TREE_RISE = 46;        // lift the tree so its base meets the grass
const TREE_TYPES: TreeType[] = ['oak', 'bush', 'pine', 'fruit'];

export interface StreetRow {
  sidewalkY: number;   // top of the sidewalk = building feet
  sidewalkH: number;
  roadY: number;       // top of the road
  roadH: number;
}

export interface StreetGeometry {
  rows: StreetRow[];
  lampposts: { x: number; y: number }[];
  trees: { x: number; y: number; type: TreeType; seed: number }[];
}

// Builds the decor geometry (sidewalk/road bands, lampposts, trees) from the
// placed buildings. `canvasW` clamps props that would fall off-screen.
export function streetGeometry(placed: PlacedBuilding[], canvasW: number): StreetGeometry {
  if (placed.length === 0) return { rows: [], lampposts: [], trees: [] };

  // One band per distinct building-row Y.
  const ys = [...new Set(placed.map(b => b.y))].sort((a, b) => a - b);
  const rows: StreetRow[] = ys.map(y => {
    const sidewalkY = y + BUILDING_H;
    return { sidewalkY, sidewalkH: SIDEWALK_H, roadY: sidewalkY + SIDEWALK_H, roadH: ROAD_H };
  });

  const lampposts: StreetGeometry['lampposts'] = [];
  const trees: StreetGeometry['trees'] = [];
  placed.forEach((b, i) => {
    const sidewalkY = b.y + BUILDING_H;
    lampposts.push({ x: b.x - LAMP_OFFSET, y: sidewalkY });
    const treeX = b.x + BUILDING_W + TREE_GAP_INSET;
    if (treeX < canvasW) {
      trees.push({ x: treeX, y: sidewalkY - TREE_RISE, type: TREE_TYPES[i % TREE_TYPES.length], seed: i + 1 });
    }
  });

  return { rows, lampposts, trees };
}
