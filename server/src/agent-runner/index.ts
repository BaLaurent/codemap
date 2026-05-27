// Runs Claude agents in-process via the Agent SDK so the user can spawn and chat
// with them from the hotel. Each session is keyed by an agentId that is forced as
// the SDK sessionId, so the agent's own hooks report under the same id and it
// appears as a normal hotel character (no separate event bridge needed).
//
// Tool use is supervised through the hotel via canUseTool: the chosen
// permissionMode decides when the SDK calls it (only 'default' opens the human
// modal; 'bypassPermissions' skips checks, 'auto' lets a model classifier decide,
// 'plan' runs no tools).
import { query, type Query, type CanUseTool, type PermissionMode, type PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { SessionInput } from './session-input.js';
import { fetchCapabilities, getCachedCapabilities } from './capabilities.js';
import type { AgentCapabilities, InteractionOutcome } from '../types.js';

// A tool call awaiting the user's allow/deny, surfaced to the hotel modal.
export interface PermissionRequest {
  toolUseID: string;
  toolName: string;
  toolInput?: string;   // compact preview (command, path, pattern…)
  title?: string;       // SDK-rendered prompt sentence, when present
  description?: string; // SDK-rendered subtitle, when present
}

export interface RunnerCallbacks {
  onChat: (agentId: string, role: 'user' | 'assistant', content: string) => void;
  onToolUse: (agentId: string, name: string, input?: string) => void;
  onPermission: (agentId: string, req: PermissionRequest) => Promise<InteractionOutcome>;
  onError: (agentId: string, message: string) => void;
  onEnd: (agentId: string) => void;
}

interface Session {
  query: Query;
  input: SessionInput;
  projectId?: string;
  mode: PermissionMode;  // current permission mode (kept in sync via setMode)
}

const sessions = new Map<string, Session>();

export function isRunning(agentId: string): boolean {
  return sessions.has(agentId);
}

// Compact, human-readable preview of a tool call's input for the transcript:
// the command for Bash, the path for file tools, the pattern for search, else
// a truncated JSON of the input object.
function previewToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  const pick = o.command ?? o.file_path ?? o.path ?? o.pattern ?? o.url ?? o.prompt;
  const text = typeof pick === 'string' ? pick : JSON.stringify(o);
  return text.length > 100 ? text.slice(0, 99) + '…' : text;
}

// Translate the hotel user's decision into the SDK's allow/deny shape. Allow
// echoes the original input unchanged; deny/timeout become a denial with a reason.
export function outcomeToPermissionResult(outcome: InteractionOutcome, input: Record<string, unknown>): PermissionResult {
  if (outcome.outcome === 'allow') return { behavior: 'allow', updatedInput: input };
  const reason = outcome.outcome === 'deny' ? (outcome.reason ?? 'Refusé via CodeMap') : 'Aucune réponse';
  return { behavior: 'deny', message: reason };
}

export function spawnAgent(
  opts: {
    agentId: string; cwd: string; projectId?: string; initialPrompt: string;
    permissionMode?: PermissionMode; model?: string; agent?: string;
  },
  cb: RunnerCallbacks,
): void {
  const { agentId, cwd, projectId, initialPrompt, permissionMode = 'default', model, agent } = opts;
  const input = new SessionInput();
  input.push(initialPrompt, agentId);

  // Route every permission check the SDK raises to the hotel modal and translate
  // the user's decision back into the SDK's allow/deny shape.
  const canUseTool: CanUseTool = async (toolName, toolInput, ctx) => {
    // Belt-and-suspenders: if the session is in bypass, never prompt — allow
    // outright (the SDK shouldn't even call us here, but mode switches at
    // runtime can be timing-sensitive).
    if (sessions.get(agentId)?.mode === 'bypassPermissions') return { behavior: 'allow', updatedInput: toolInput };
    const outcome = await cb.onPermission(agentId, {
      toolUseID: ctx.toolUseID,
      toolName,
      toolInput: previewToolInput(toolInput),
      title: ctx.title,
      description: ctx.description,
    });
    return outcomeToPermissionResult(outcome, toolInput);
  };

  const q = query({
    prompt: input.stream(),
    options: {
      cwd,
      sessionId: agentId,
      permissionMode,
      canUseTool,
      // Optional spawn-form picks; omitted falls back to the CLI defaults.
      ...(model ? { model } : {}),
      ...(agent ? { agent } : {}),
      // Opt into bypass capability up front so switching to bypassPermissions
      // mid-session actually skips checks (the active mode still governs: in
      // 'default' tools are still prompted via canUseTool).
      allowDangerouslySkipPermissions: true,
      // Surface skills as runnable slash commands (omitted ≠ "skills off", but
      // not guaranteed either) and load filesystem settings so custom project/
      // user commands appear in supportedCommands().
      skills: 'all',
      settingSources: ['user', 'project', 'local'],
    },
  });
  sessions.set(agentId, { query: q, input, projectId, mode: permissionMode });

  // Output pump: forward assistant turns to the hotel chat for this session's
  // life. Iterate content blocks IN ORDER so a tool call lands between the text
  // that precedes and follows it (not lumped after everything).
  (async () => {
    for await (const message of q) {
      if (message.type === 'assistant') {
        const blocks = (message as { message?: { content?: Array<{ type: string; text?: string; name?: string; input?: unknown }> } })
          .message?.content ?? [];
        for (const block of blocks) {
          if (block.type === 'text') {
            const text = block.text?.trim();
            if (text) cb.onChat(agentId, 'assistant', text);
          } else if (block.type === 'tool_use' && block.name) {
            cb.onToolUse(agentId, block.name, previewToolInput(block.input));
          }
        }
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

// Terminal-like capabilities (slash commands/skills, models, subagents) of a
// live session, for the chat autocompletion and spawn-form selectors. Returns
// undefined if the agent has no running session.
export async function getAgentCapabilities(agentId: string): Promise<AgentCapabilities | undefined> {
  const session = sessions.get(agentId);
  if (!session) return undefined;
  return fetchCapabilities(session.query, session.projectId ?? agentId);
}

// Cached capabilities for a project (populated once any of its agents has run),
// or undefined on a cold start with no live session yet.
export function getProjectCapabilities(projectId: string): AgentCapabilities | undefined {
  return getCachedCapabilities(projectId);
}

// Push a new user turn into a live session. Returns false if there's no session.
export function sendMessage(agentId: string, content: string): boolean {
  const session = sessions.get(agentId);
  if (!session) return false;
  session.input.push(content, agentId);
  return true;
}

// Switch the permission mode of a live session (e.g. default → bypassPermissions).
export async function setMode(agentId: string, mode: PermissionMode): Promise<boolean> {
  const session = sessions.get(agentId);
  if (!session) return false;
  session.mode = mode;  // canUseTool reads this to short-circuit bypass
  await session.query.setPermissionMode?.(mode);
  return true;
}

// Switch the model of a live session. Empty / 'default' resets to the CLI default.
export async function setModel(agentId: string, model?: string): Promise<boolean> {
  const session = sessions.get(agentId);
  if (!session) return false;
  const target = model && model !== 'default' ? model : undefined;
  await session.query.setModel?.(target);
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
