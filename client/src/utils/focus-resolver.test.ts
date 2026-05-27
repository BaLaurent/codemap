import { describe, it, expect } from 'vitest';
import { resolveFocus } from './focus-resolver';

describe('resolveFocus', () => {
  it('returns null when there is no pending request', () => {
    expect(resolveFocus(null, new Set(['a', 'b']))).toBeNull();
  });

  it('returns null while the requested agent is not yet present', () => {
    expect(resolveFocus('a', new Set(['b', 'c']))).toBeNull();
  });

  it('returns the agentId once it is present', () => {
    expect(resolveFocus('a', new Set(['a', 'b']))).toBe('a');
  });

  it('returns null against an empty canvas', () => {
    expect(resolveFocus('a', new Set())).toBeNull();
  });
});
