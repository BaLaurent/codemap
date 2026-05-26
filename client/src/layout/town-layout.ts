import { ProjectInfo } from '../types';

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
