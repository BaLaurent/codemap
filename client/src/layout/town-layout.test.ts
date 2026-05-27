import { describe, it, expect } from 'vitest';
import { layoutTown, streetGeometry, BUILDINGS_PER_ROW, BUILDING_SIZE } from './town-layout';
import { ProjectInfo } from '../types';

const p = (id: string, name: string): ProjectInfo =>
  ({ projectId: id, projectName: name, projectRoot: id, lastActivity: 0, agentCount: 0, isPinned: false });

describe('layoutTown', () => {
  it('places buildings left-to-right, wrapping into rows', () => {
    const many = Array.from({ length: BUILDINGS_PER_ROW + 1 }, (_, i) => p(`${i}`, `p${i}`));
    const placed = layoutTown(many);
    expect(placed[0].row).toBe(0);
    expect(placed[0].col).toBe(0);
    expect(placed[BUILDINGS_PER_ROW].row).toBe(1);
    expect(placed[BUILDINGS_PER_ROW].col).toBe(0);
    expect(placed[1].x).toBeGreaterThan(placed[0].x);
    expect(placed[BUILDINGS_PER_ROW].x).toBe(placed[0].x);
  });

  it('preserves input order (caller sorts)', () => {
    const placed = layoutTown([p('z', 'z'), p('a', 'a')]);
    expect(placed.map(b => b.projectId)).toEqual(['z', 'a']);
  });
});

describe('streetGeometry', () => {
  it('derives one street row per distinct building row, with ordered bands', () => {
    const placed = layoutTown(Array.from({ length: BUILDINGS_PER_ROW + 1 }, (_, i) => p(`${i}`, `p${i}`)));
    const geo = streetGeometry(placed, 1600);
    expect(geo.rows).toHaveLength(2);
    // Sidewalk sits exactly under the building feet; road sits below the sidewalk.
    expect(geo.rows[0].sidewalkY).toBe(placed[0].y + BUILDING_SIZE.h);
    expect(geo.rows[0].roadY).toBe(geo.rows[0].sidewalkY + geo.rows[0].sidewalkH);
    expect(geo.rows[1].sidewalkY).toBeGreaterThan(geo.rows[0].roadY);
  });

  it('emits one lamppost per building, all within the canvas width', () => {
    const placed = layoutTown([p('a', 'a'), p('b', 'b')]);
    const geo = streetGeometry(placed, 1600);
    expect(geo.lampposts).toHaveLength(2);
    for (const l of geo.lampposts) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(1600);
    }
  });

  it('only places trees that fit inside the canvas', () => {
    const placed = layoutTown([p('a', 'a')]);
    const wide = streetGeometry(placed, 1600).trees.length;
    const narrow = streetGeometry(placed, 200).trees.length;
    expect(wide).toBeGreaterThanOrEqual(narrow);
  });

  it('returns empty geometry when there are no buildings', () => {
    const geo = streetGeometry([], 1600);
    expect(geo.rows).toEqual([]);
    expect(geo.lampposts).toEqual([]);
    expect(geo.trees).toEqual([]);
  });
});
