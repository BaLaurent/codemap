import { describe, it, expect } from 'vitest';
import { layoutTown, BUILDINGS_PER_ROW } from './town-layout';
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
