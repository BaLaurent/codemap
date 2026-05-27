// Runs Claude agents in-process via the Agent SDK so the user can spawn and chat
// with them from the hotel. Each session is keyed by an agentId that is forced as
// the SDK sessionId, so the agent's own hooks report under the same id and it
// appears as a normal hotel character (no separate event bridge needed).
//
// v1 runs spawned agents in bypassPermissions (autonomous) for a frictionless
// chat; supervising their tool use via the hotel modal is a later refinement.
import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import { SessionInput } from './session-input.js';

export interface RunnerCallbacks {
  onChat: (agentId: string, role: 'user' | 'assistant', content: string) => void;
  onError: (agentId: string, message: string) => void;
  onEnd: (agentId: string) => void;
}

interface Session {
  query: Query;
  input: SessionInput;
  projectId?: string;
}

const sessions = new Map<string, Session>();

export function isRunning(agentId: string): boolean {
  return sessions.has(agentId);
}

function extractText(message: { message?: { content?: Array<{ type: string; text?: string }> } }): string {
  const blocks = message.message?.content ?? [];
  return blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim();
}

export function spawnAgent(
  opts: { agentId: string; cwd: string; projectId?: string; initialPrompt: string },
  cb: RunnerCallbacks,
): void {
  const { agentId, cwd, projectId, initialPrompt } = opts;
  const input = new SessionInput();
  input.push(initialPrompt, agentId);

  const q = query({
    prompt: input.stream(),
    options: { cwd, sessionId: agentId, permissionMode: 'bypassPermissions' },
  });
  sessions.set(agentId, { query: q, input, projectId });

  // Output pump: forward assistant turns to the hotel chat for this session's life.
  (async () => {
    for await (const message of q) {
      if (message.type === 'assistant') {
        const text = extractText(message as never);
        if (text) cb.onChat(agentId, 'assistant', text);
      }
      // 'result' marks a turn done; we keep the session open for the next turn.
    }
    sessions.delete(agentId);
    cb.onEnd(agentId);
  })().catch((err: unknown) => {
    sessions.delete(agentId);
    cb.onError(agentId, err instanceof Error ? err.message : String(err));
  });
}

// Push a new user turn into a live session. Returns false if there's no session.
export function sendMessage(agentId: string, content: string): boolean {
  const session = sessions.get(agentId);
  if (!session) return false;
  session.input.push(content, agentId);
  return true;
}

// Interrupt and close a session.
export async function stopAgent(agentId: string): Promise<boolean> {
  const session = sessions.get(agentId);
  if (!session) return false;
  try {
    await session.query.interrupt?.();
  } catch { /* already stopping */ }
  session.input.close();
  sessions.delete(agentId);
  return true;
}
