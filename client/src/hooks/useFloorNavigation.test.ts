import { describe, it, expect } from 'vitest';
import { reduceNav, INITIAL_NAV_STATE, NavState } from './useFloorNavigation';

const base = INITIAL_NAV_STATE;

describe('reduceNav', () => {
  it('first agent activity becomes focus and follows its floor', () => {
    const next = reduceNav(base, { kind: 'agentActivity', agentId: 'a', floor: 2 }, new Map([['a', 2]]));
    expect(next.focusAgentId).toBe('a');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(2);
  });

  it('follows the focus agent when it moves floor', () => {
    const s: NavState = { currentFloorIndex: 2, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'agentActivity', agentId: 'a', floor: 4 }, new Map([['a', 4]]));
    expect(next.currentFloorIndex).toBe(4);
  });

  it('ignores a non-focus agent activity while following', () => {
    const s: NavState = { currentFloorIndex: 2, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'agentActivity', agentId: 'b', floor: 7 }, new Map([['a', 2], ['b', 7]]));
    expect(next.currentFloorIndex).toBe(2);
  });

  it('manual floor selection pauses follow', () => {
    const s: NavState = { currentFloorIndex: 2, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'selectFloor', floor: 5 }, new Map([['a', 2]]));
    expect(next.currentFloorIndex).toBe(5);
    expect(next.follow).toBe(false);
  });

  it('does not auto-move while follow is paused', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: false };
    const next = reduceNav(s, { kind: 'agentActivity', agentId: 'a', floor: 1 }, new Map([['a', 1]]));
    expect(next.currentFloorIndex).toBe(5);
    expect(next.follow).toBe(false);
  });

  it('selecting an agent re-enables follow and jumps to its floor', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: false };
    const next = reduceNav(s, { kind: 'selectAgent', agentId: 'b' }, new Map([['a', 5], ['b', 3]]));
    expect(next.focusAgentId).toBe('b');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(3);
  });

  it('removing focus agent falls back to first remaining active agent', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'removeAgent', agentId: 'a' }, new Map([['b', 8]]));
    expect(next.focusAgentId).toBe('b');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(8);
  });

  it('removing the last agent keeps the floor and stops following', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'removeAgent', agentId: 'a' }, new Map());
    expect(next.focusAgentId).toBeNull();
    expect(next.follow).toBe(false);
    expect(next.currentFloorIndex).toBe(5);
  });

  it('selecting an agent absent from the floor map keeps the current floor', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'selectAgent', agentId: 'b' }, new Map([['a', 5]]));
    expect(next.focusAgentId).toBe('b');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(5);
  });

  it('removing focus agent falls back to a remaining agent absent from the floor map, keeping the floor', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: true };
    // 'b' is a remaining key but has no floor entry (lookup yields undefined).
    const agentFloors = new Map<string, number | undefined>([['b', undefined]]) as Map<string, number>;
    const next = reduceNav(s, { kind: 'removeAgent', agentId: 'a' }, agentFloors);
    expect(next.focusAgentId).toBe('b');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(5);
  });
});
