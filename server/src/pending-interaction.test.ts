import { describe, it, expect } from 'vitest';
import { shouldFlagWaitingForPermission, clearPendingInteraction } from './pending-interaction';

const THRESHOLD = 60000;

describe('shouldFlagWaitingForPermission', () => {
  it('flags an agent whose tool started but never reported back', () => {
    const state = { pendingToolStart: 0, waitingForInput: false };
    expect(shouldFlagWaitingForPermission(state, THRESHOLD + 1, THRESHOLD)).toBe(true);
  });

  it('does not flag while still within the threshold', () => {
    const state = { pendingToolStart: 0, waitingForInput: false };
    expect(shouldFlagWaitingForPermission(state, THRESHOLD - 1, THRESHOLD)).toBe(false);
  });

  it('does not flag when no tool is pending', () => {
    const state = { pendingToolStart: undefined, waitingForInput: false };
    expect(shouldFlagWaitingForPermission(state, THRESHOLD + 1, THRESHOLD)).toBe(false);
  });

  it('does not double-flag an agent the hotel is already handling', () => {
    const state = { pendingToolStart: 0, waitingForInput: true };
    expect(shouldFlagWaitingForPermission(state, THRESHOLD + 1, THRESHOLD)).toBe(false);
  });
});

describe('clearPendingInteraction', () => {
  it('lifts the question bubble and the waiting flag together', () => {
    const state = {
      waitingForInput: true,
      pendingToolStart: 0,
      question: { questions: [{ question: 'Which DB?', options: [{ label: 'Postgres' }] }] },
    };
    clearPendingInteraction(state);
    expect(state.waitingForInput).toBe(false);
    expect(state.question).toBeUndefined();
  });

  // The reported bug, on the real code: a hotel-answered AskUserQuestion is
  // denied, so PostToolUse never clears `pendingToolStart`. Resolving must clear
  // it too, otherwise the detector re-arms `waitingForInput` once the threshold
  // elapses and re-poses the already-answered question.
  it('keeps the permission detector from re-arming after resolve', () => {
    const state = { waitingForInput: true, pendingToolStart: 0 };

    clearPendingInteraction(state);

    // Plenty of time has now passed since the (long-gone) tool start.
    expect(shouldFlagWaitingForPermission(state, THRESHOLD * 10, THRESHOLD)).toBe(false);
  });
});
