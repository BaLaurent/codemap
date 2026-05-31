/**
 * Pending-interaction policy for an agent: the single source of truth for when an
 * agent counts as "blocked waiting on the user" and how that block is lifted.
 *
 * Two halves of the same knowledge live together here, because they must agree on
 * exactly which fields encode "pending":
 *   - the periodic detector RAISES the flag when a tool started but never reported
 *     back (the agent is stuck on a native permission prompt the hotel can't see);
 *   - resolving an interaction in the hotel CLEARS the flag.
 *
 * The bug this prevents: when the hotel answers an AskUserQuestion, the tool is
 * DENIED, so no PostToolUse ever fires to clear `pendingToolStart`. Clearing only
 * `waitingForInput` at resolve let the detector re-raise it `thresholdMs` later,
 * re-posing an already-answered question. Clearing every pending field keeps the
 * two halves in lockstep.
 */
import type { AgentThinkingState } from './types';

// The subset of agent state that encodes a pending user interaction.
type PendingInteractionState = Pick<
  AgentThinkingState,
  'waitingForInput' | 'pendingToolStart' | 'question'
>;

// The periodic detector's predicate: a tool started but never reported back, and
// enough time has passed that the agent is almost certainly blocked on a native
// permission prompt the hotel never saw. An already-true `waitingForInput` means
// the hotel is handling it, so we never double-flag.
export function shouldFlagWaitingForPermission(
  state: PendingInteractionState,
  now: number,
  thresholdMs: number,
): boolean {
  if (state.pendingToolStart == null || state.waitingForInput) return false;
  return now - state.pendingToolStart > thresholdMs;
}

// Lift every trace of a pending interaction once it is resolved (answered,
// allowed, denied, or bypassed). Clearing `pendingToolStart` is essential: a
// hotel-answered question is denied, so the PostToolUse that would otherwise
// clear it never fires, and the detector would re-raise `waitingForInput`.
export function clearPendingInteraction(state: PendingInteractionState): void {
  state.waitingForInput = false;
  state.pendingToolStart = undefined;
  state.question = undefined;
}
