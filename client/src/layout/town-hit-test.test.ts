import { describe, it, expect } from 'vitest';
import { layoutTown, BUILDING_SIZE, buildingNameSignRect } from './town-layout';
import { hitTownAt, closeBadgeRect, removeAction } from './town-hit-test';
import { ProjectInfo } from '../types';

const p = (id: string, pinned: boolean, agents = 0): ProjectInfo =>
  ({ projectId: id, projectName: id, projectRoot: id, lastActivity: 0, agentCount: agents, isPinned: pinned });

describe('hitTownAt', () => {
  it('hits the building body at its top-left corner', () => {
    const placed = layoutTown([p('a', false)]);
    const b = placed[0];
    expect(hitTownAt(placed, b.x + 2, b.y + BUILDING_SIZE.h - 2)).toEqual({ building: b, region: 'body' });
  });

  it('hits the close badge at the name plaque level (pinned only)', () => {
    const placed = layoutTown([p('a', true)]);
    const b = placed[0];
    const sign = buildingNameSignRect(b);
    // The badge sits on the right edge of the plaque, vertically centred.
    const hit = hitTownAt(placed, sign.x + sign.w - 2, sign.y + sign.h / 2);
    expect(hit).toEqual({ building: b, region: 'close' });
  });

  it('puts the close badge in line with the project name (not at the top)', () => {
    const placed = layoutTown([p('a', true)]);
    const b = placed[0];
    const sign = buildingNameSignRect(b);
    const badge = closeBadgeRect(b);
    // Centre of the badge sits within the plaque's Y range.
    const badgeCenterY = badge.y + badge.h / 2;
    expect(badgeCenterY).toBeGreaterThanOrEqual(sign.y);
    expect(badgeCenterY).toBeLessThanOrEqual(sign.y + sign.h);
  });

  it('treats the top of a non-pinned building as body, not close', () => {
    const placed = layoutTown([p('a', false)]);
    const b = placed[0];
    const sign = buildingNameSignRect(b);
    expect(hitTownAt(placed, sign.x + sign.w - 2, sign.y + sign.h / 2)).toEqual({ building: b, region: 'body' });
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
