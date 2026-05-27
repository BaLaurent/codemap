// In-memory store of interaction requests a blocking hook is waiting on.
//
// Flow: the hook POSTs to register a request, then long-polls awaitDecision().
// The hotel POSTs the user's choice, which resolveRequest() delivers to the
// waiting long-poll. The store tolerates either order (decision before or after
// the long-poll attaches) and times out so a hook is never trapped.
import type { InteractionOutcome } from './types.js';

interface Entry {
  resolved?: InteractionOutcome;                 // decision arrived before the long-poll attached
  waiter?: (outcome: InteractionOutcome) => void; // releases the held long-poll
  timer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, Entry>();

const key = (agentId: string, requestId: string) => `${agentId}:${requestId}`;

export function registerRequest(agentId: string, requestId: string): void {
  entries.set(key(agentId, requestId), {});
}

export function hasRequest(agentId: string, requestId: string): boolean {
  return entries.has(key(agentId, requestId));
}

// Long-poll: resolves when the hotel decides, or after maxWaitMs ('timeout').
export function awaitDecision(
  agentId: string,
  requestId: string,
  maxWaitMs: number,
): Promise<InteractionOutcome> {
  const k = key(agentId, requestId);
  const entry = entries.get(k);
  if (!entry) return Promise.resolve({ outcome: 'timeout' });   // unknown / already expired
  if (entry.resolved) {
    entries.delete(k);
    return Promise.resolve(entry.resolved);
  }
  return new Promise(resolve => {
    entry.waiter = resolve;
    entry.timer = setTimeout(() => {
      entries.delete(k);
      resolve({ outcome: 'timeout' });
    }, maxWaitMs);
  });
}

// Deliver the hotel's decision. Returns false if there was no such pending request.
export function resolveRequest(
  agentId: string,
  requestId: string,
  outcome: InteractionOutcome,
): boolean {
  const k = key(agentId, requestId);
  const entry = entries.get(k);
  if (!entry) return false;
  if (entry.waiter) {
    if (entry.timer) clearTimeout(entry.timer);
    entries.delete(k);
    entry.waiter(outcome);
  } else {
    entry.resolved = outcome;   // decision beat the long-poll; hand it over when it attaches
  }
  return true;
}
