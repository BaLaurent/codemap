/**
 * Transcript Store
 *
 * Persists the chat transcript (user turns, assistant replies, tool calls, system
 * notices) for every hotel-spawned agent, so a client refresh or remount can
 * replay the full conversation instead of receiving only future messages.
 *
 * Design notes:
 * - Free functions over a module-level Map, following the singleton pattern used
 *   by pending-requests.ts (single transversal store, not one instance per project).
 * - Deep module: simple four-function interface hiding the cap/eviction detail.
 */

import type { ChatMessage } from './types.js';

// Maximum number of lines kept per agent.
// 1000 lines covers a full, detailed conversation without risk of memory
// explosion if the user never calls /api/agents/clear. Upper bound:
//   30 agents × 1000 lines × ~200 chars ≈ 6 MB — well within reason.
// (The activity debug buffer uses MAX_ACTIVITY_BUFFER=50, which is fine for
// ephemeral events; transcripts need much more depth to be useful for replay.)
export const MAX_TRANSCRIPT_LINES = 1000;

const transcripts = new Map<string, ChatMessage[]>();

/**
 * Append a chat message to the agent's transcript.
 * Creates the transcript array on first call for a given agentId.
 * Evicts the oldest message when the cap is reached.
 */
export function appendChatMessage(msg: ChatMessage): void {
  let arr = transcripts.get(msg.agentId);
  if (!arr) {
    arr = [];
    transcripts.set(msg.agentId, arr);
  }
  arr.push(msg);
  if (arr.length > MAX_TRANSCRIPT_LINES) {
    arr.shift(); // O(n) but bounded; avoids slice re-allocation on every push
  }
}

/**
 * Return a copy of the transcript for an agent.
 * Returns an empty array when the agent is unknown (e.g. post-kill post-mortem).
 * The copy is defensive: callers may mutate the returned array without
 * corrupting the internal state.
 */
export function getTranscript(agentId: string): ChatMessage[] {
  const arr = transcripts.get(agentId);
  return arr ? [...arr] : [];
}

/**
 * Delete all stored transcripts (called on /api/agents/clear for a full reset).
 */
export function clearTranscripts(): void {
  transcripts.clear();
}
