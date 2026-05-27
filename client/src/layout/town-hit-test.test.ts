import { describe, it, expect } from 'vitest';
import { layoutTown, BUILDING_SIZE } from './town-layout';
import { hitTownAt, removeAction } from './town-hit-test';
import { ProjectInfo } from '../types';

const p = (id: string, pinned: boolean, agents = 0): ProjectInfo =>
  ({ projectId: id, projectName: id, projectRoot: id, lastActivity: 0, agentCount: agents, isPinned: pinned });

describe('hitTownAt', () => {
  it('hits the building body at its top-left corner', () => {
    const placed = layoutTown([p('a', false)]);
    const b = placed[0];
    expect(hitTownAt(placed, b.x + 2, b.y + BUILDING_SIZE.h - 2)).toEqual({ building: b, region: 'body' });
  });

  it('hits the close badge (top-right) only on pinned buildings', () => {
    const placed = layoutTown([p('a', true)]);
    const b = placed[0];
    const hit = hitTownAt(placed, b.x + BUILDING_SIZE.w - 2, b.y + 2);
    expect(hit).toEqual({ building: b, region: 'close' });
  });

  it('treats the top-right of a non-pinned building as body, not close', () => {
    const placed = layoutTown([p('a', false)]);
    const b = placed[0];
    expect(hitTownAt(placed, b.x + BUILDING_SIZE.w - 2, b.y + 2)).toEqual({ building: b, region: 'body' });
  });

  it('returns null on empty space', () => {
    const placed = layoutTown([p('a', true)]);
    expect(hitTownAt(placed, 99999, 99999)).toBeNull();
  });
});

describe('removeAction', () => {
  it('asks for confirmation when agents are running', () => {
    expect(removeAction(layoutTown([p('a', true, 2)])[0])).toBe('confirm');
  });
  it('deletes directly when no agents', () => {
    expect(removeAction(layoutTown([p('a', true, 0)])[0])).toBe('delete');
  });
});
