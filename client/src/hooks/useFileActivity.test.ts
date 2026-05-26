import { describe, it, expect } from 'vitest';
import { shouldApplyMessage } from './useFileActivity';

describe('shouldApplyMessage', () => {
  it('applies any message when no projectId filter is set', () => {
    expect(shouldApplyMessage({ type: 'graph', projectId: 'A' }, undefined)).toBe(true);
  });
  it('applies messages whose projectId matches the watched building', () => {
    expect(shouldApplyMessage({ type: 'activity', projectId: 'A' }, 'A')).toBe(true);
  });
  it('drops messages for other buildings', () => {
    expect(shouldApplyMessage({ type: 'activity', projectId: 'B' }, 'A')).toBe(false);
  });
  it('always applies thinking (global agent list) even when filtering', () => {
    expect(shouldApplyMessage({ type: 'thinking' }, 'A')).toBe(true);
  });
});
