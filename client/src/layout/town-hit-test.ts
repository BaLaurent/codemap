import { PlacedBuilding, BUILDING_SIZE } from './town-layout';

export type TownHit = { building: PlacedBuilding; region: 'body' | 'close' } | null;

// Size (px) of the ✕ badge anchored at a pinned building's top-right corner.
const CLOSE = 16;

export function closeBadgeRect(b: PlacedBuilding): { x: number; y: number; w: number; h: number } {
  return { x: b.x + BUILDING_SIZE.w - CLOSE, y: b.y, w: CLOSE, h: CLOSE };
}

// Resolve what a click at (mx,my) hits. The close badge (pinned only) is tested
// first so it wins over the building body it overlaps.
export function hitTownAt(placed: PlacedBuilding[], mx: number, my: number): TownHit {
  for (const b of placed) {
    if (!b.isPinned) continue;
    const r = closeBadgeRect(b);
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return { building: b, region: 'close' };
  }
  for (const b of placed) {
    if (mx >= b.x && mx <= b.x + BUILDING_SIZE.w && my >= b.y && my <= b.y + BUILDING_SIZE.h) {
      return { building: b, region: 'body' };
    }
  }
  return null;
}

// Whether removing a building needs a kill confirmation (live agents) or can
// delete straight away.
export function removeAction(b: PlacedBuilding): 'confirm' | 'delete' {
  return b.agentCount > 0 ? 'confirm' : 'delete';
}
