import type { ChatMessage } from '../types';

// Reconcile the server's authoritative transcript (fetched on chat open) with any
// lines that arrived live over WebSocket while that fetch was in flight: keep
// every server line, then append local lines strictly newer than the server's
// last timestamp. The strict `>` (not `>=`) matters: a line sharing the last
// server timestamp is already in the server copy, so `>=` would duplicate it.
export function mergeTranscript(server: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  const lastTs = server.length > 0 ? server[server.length - 1].timestamp : 0;
  const liveAfter = local.filter(m => m.timestamp > lastTs);
  return [...server, ...liveAfter];
}
