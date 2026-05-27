import { describe, it, expect } from 'vitest';
import { registerRequest, awaitDecision, resolveRequest, hasRequest } from './pending-requests.js';

describe('pending-requests', () => {
  it('delivers a decision to a waiting long-poll', async () => {
    registerRequest('agentA', 'r1');
    const pending = awaitDecision('agentA', 'r1', 1000);
    expect(resolveRequest('agentA', 'r1', { outcome: 'answer', text: 'date-fns' })).toBe(true);
    await expect(pending).resolves.toEqual({ outcome: 'answer', text: 'date-fns' });
    expect(hasRequest('agentA', 'r1')).toBe(false);
  });

  it('returns a decision that arrived before the long-poll attached', async () => {
    registerRequest('agentA', 'r2');
    expect(resolveRequest('agentA', 'r2', { outcome: 'allow' })).toBe(true);
    await expect(awaitDecision('agentA', 'r2', 1000)).resolves.toEqual({ outcome: 'allow' });
  });

  it('times out when nobody answers', async () => {
    registerRequest('agentA', 'r3');
    await expect(awaitDecision('agentA', 'r3', 10)).resolves.toEqual({ outcome: 'timeout' });
  });

  it('returns timeout for an unknown request', async () => {
    await expect(awaitDecision('agentA', 'ghost', 10)).resolves.toEqual({ outcome: 'timeout' });
  });

  it('resolveRequest is false for an unknown request', () => {
    expect(resolveRequest('agentA', 'ghost', { outcome: 'allow' })).toBe(false);
  });
});
