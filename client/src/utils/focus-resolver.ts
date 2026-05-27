// Decides when an externally requested agent-focus can be applied.
//
// The roster panel may ask HabboRoom to focus an agent right after switching
// buildings, before that agent has materialized in the canvas (agent data loads
// asynchronously on mount). resolveFocus returns the agentId to focus only once
// it's actually present; until then the caller keeps the request pending. Pure
// and isolated so the timing logic can be tested directly (like reduceNav).
export function resolveFocus(
  pendingAgentId: string | null,
  presentAgentIds: Set<string>
): string | null {
  if (!pendingAgentId) return null;
  return presentAgentIds.has(pendingAgentId) ? pendingAgentId : null;
}
