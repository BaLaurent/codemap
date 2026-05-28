// Tests for resolveEffortOptions: the server-boundary translator from the
// spawn-form's free-form string to a sanitized SDK option pair.
import { describe, it, expect } from 'vitest';
import { resolveEffortOptions, effortToMaxThinkingTokens, isEffortValue } from './effort-options.js';

describe('resolveEffortOptions', () => {
  it('passes through the 5 EffortLevel values as { effort }', () => {
    for (const v of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      expect(resolveEffortOptions(v)).toEqual({ effort: v });
    }
  });

  it("maps 'off' to thinking: { type: 'disabled' } (not an effort)", () => {
    expect(resolveEffortOptions('off')).toEqual({ thinking: { type: 'disabled' } });
  });

  it("returns {} for 'default' so the SDK's adaptive default kicks in", () => {
    expect(resolveEffortOptions('default')).toEqual({});
  });

  it('rejects unknown strings and non-string garbage instead of forwarding them', () => {
    expect(resolveEffortOptions('extreme')).toEqual({});
    expect(resolveEffortOptions('')).toEqual({});
    expect(resolveEffortOptions(undefined)).toEqual({});
    expect(resolveEffortOptions(null)).toEqual({});
    expect(resolveEffortOptions(42)).toEqual({});
    expect(resolveEffortOptions({ effort: 'high' })).toEqual({});
  });
});

describe('isEffortValue', () => {
  it('accepts the 7 known values', () => {
    for (const v of ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'off']) {
      expect(isEffortValue(v)).toBe(true);
    }
  });
  it('rejects unknown values, empty string, non-strings', () => {
    expect(isEffortValue('extreme')).toBe(false);
    expect(isEffortValue('')).toBe(false);
    expect(isEffortValue(undefined)).toBe(false);
    expect(isEffortValue(42)).toBe(false);
  });
});

describe('effortToMaxThinkingTokens', () => {
  it('maps default to null (clears the limit)', () => {
    expect(effortToMaxThinkingTokens('default')).toBeNull();
  });
  it('maps off to 0 (disabled on Opus 4.6+)', () => {
    expect(effortToMaxThinkingTokens('off')).toBe(0);
  });
  it('maps the 5 levels to a strictly increasing token budget', () => {
    const seq = (['low', 'medium', 'high', 'xhigh', 'max'] as const)
      .map(effortToMaxThinkingTokens) as number[];
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThan(seq[i - 1]);
    }
    expect(seq[0]).toBeGreaterThan(0);
  });
  it('returns undefined for unknown values so the caller skips the SDK call', () => {
    expect(effortToMaxThinkingTokens('extreme')).toBeUndefined();
    expect(effortToMaxThinkingTokens('')).toBeUndefined();
    expect(effortToMaxThinkingTokens(null)).toBeUndefined();
    expect(effortToMaxThinkingTokens(42)).toBeUndefined();
  });
});
