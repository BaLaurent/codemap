import { describe, it, expect } from 'vitest';
import { outcomeToPermissionResult } from './index.js';

describe('outcomeToPermissionResult', () => {
  const input = { command: 'rm -rf build' };

  it('maps allow to behavior:allow echoing the original input', () => {
    expect(outcomeToPermissionResult({ outcome: 'allow' }, input)).toEqual({
      behavior: 'allow', updatedInput: input,
    });
  });

  it('maps deny to behavior:deny with the given reason', () => {
    expect(outcomeToPermissionResult({ outcome: 'deny', reason: 'nope' }, input)).toEqual({
      behavior: 'deny', message: 'nope',
    });
  });

  it('maps deny without a reason to a default denial message', () => {
    const r = outcomeToPermissionResult({ outcome: 'deny' }, input);
    expect(r.behavior).toBe('deny');
    expect(r).toHaveProperty('message');
  });

  it('maps timeout to a denial (the agent must not hang)', () => {
    expect(outcomeToPermissionResult({ outcome: 'timeout' }, input).behavior).toBe('deny');
  });
});
