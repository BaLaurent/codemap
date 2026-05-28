// Tests for dispatchSdkMessage: the pure block-dispatcher that routes the SDK
// stream (assistant.text/tool_use/thinking + user.tool_result) to the runner
// callbacks. Exercises the wiring without spawning a real SDK session.
import { describe, it, expect, vi } from 'vitest';
import { dispatchSdkMessage } from './index.js';
import type { RunnerCallbacks } from './index.js';

function makeCallbacks(): RunnerCallbacks {
  return {
    onChat: vi.fn(),
    onToolUse: vi.fn(),
    onToolResult: vi.fn(),
    onThinking: vi.fn(),
    onTurnEnd: vi.fn(),
    onPermission: vi.fn(),
    onError: vi.fn(),
    onEnd: vi.fn(),
  };
}

describe('dispatchSdkMessage', () => {
  const agentId = 'a-1';

  it('forwards assistant text blocks to onChat (trimmed)', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '  Bonjour\n' }] },
    }, agentId, cb);
    expect(cb.onChat).toHaveBeenCalledWith(agentId, 'assistant', 'Bonjour');
  });

  it('skips empty/whitespace-only text blocks', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '   ' }] },
    }, agentId, cb);
    expect(cb.onChat).not.toHaveBeenCalled();
  });

  it('forwards tool_use with id, preview, AND full JSON input', () => {
    const cb = makeCallbacks();
    const input = { command: 'echo hi', description: 'greet' };
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input }] },
    }, agentId, cb);
    expect(cb.onToolUse).toHaveBeenCalledTimes(1);
    const args = (cb.onToolUse as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe(agentId);
    expect(args[1]).toBe('Bash');
    expect(args[2]).toBe('echo hi');               // preview from `command` key
    expect(args[3]).toBe('toolu_1');               // toolUseId propagated
    expect(JSON.parse(args[4])).toEqual(input);    // fullInput is JSON-stringified
  });

  it('skips tool_use missing id or name (defensive — SDK contract guarantees both)', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
    }, agentId, cb);
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'x', input: {} }] },
    }, agentId, cb);
    expect(cb.onToolUse).not.toHaveBeenCalled();
  });

  it('forwards thinking blocks via onThinking (trimmed)', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: '  je réfléchis…\n' }] },
    }, agentId, cb);
    expect(cb.onThinking).toHaveBeenCalledWith(agentId, 'je réfléchis…');
  });

  it('preserves block order: text, tool_use, text', () => {
    const cb = makeCallbacks();
    const calls: string[] = [];
    (cb.onChat as ReturnType<typeof vi.fn>).mockImplementation((_id, _role, c: string) => calls.push(`chat:${c}`));
    (cb.onToolUse as ReturnType<typeof vi.fn>).mockImplementation((_id, name: string) => calls.push(`tool:${name}`));
    dispatchSdkMessage({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'avant' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/x' } },
        { type: 'text', text: 'après' },
      ] },
    }, agentId, cb);
    expect(calls).toEqual(['chat:avant', 'tool:Read', 'chat:après']);
  });

  it('captures user.tool_result blocks via onToolResult', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'user',
      message: { content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'hi\n', is_error: false },
      ] },
    }, agentId, cb);
    expect(cb.onToolResult).toHaveBeenCalledWith(agentId, 'toolu_1', 'hi\n', false);
  });

  it('flattens array-shaped tool_result content (text blocks joined, non-text hinted)', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'user',
      message: { content: [
        { type: 'tool_result', tool_use_id: 't', content: [
          { type: 'text', text: 'line1' },
          { type: 'text', text: 'line2' },
          { type: 'image', source: { type: 'base64' } },
        ] },
      ] },
    }, agentId, cb);
    const args = (cb.onToolResult as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[2]).toBe('line1\nline2\n[image]');
  });

  it('propagates is_error flag on tool_result', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'boom', is_error: true }] },
    }, agentId, cb);
    const args = (cb.onToolResult as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[3]).toBe(true);
  });

  it("ignores user messages that aren't tool_result (raw user text is broadcast separately)", () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({
      type: 'user',
      message: { content: [{ type: 'text', text: 'salut' }] },
    }, agentId, cb);
    expect(cb.onChat).not.toHaveBeenCalled();
    expect(cb.onToolResult).not.toHaveBeenCalled();
  });

  it("forwards `result` (SDK turn-done marker) via onTurnEnd, but doesn't touch the block callbacks", () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({ type: 'result' }, agentId, cb);
    expect(cb.onTurnEnd).toHaveBeenCalledWith(agentId);
    expect(cb.onChat).not.toHaveBeenCalled();
    expect(cb.onToolUse).not.toHaveBeenCalled();
    expect(cb.onToolResult).not.toHaveBeenCalled();
    expect(cb.onThinking).not.toHaveBeenCalled();
  });

  it('handles `system` message type as a no-op (init/session-replay markers)', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage({ type: 'system' }, agentId, cb);
    expect(cb.onChat).not.toHaveBeenCalled();
    expect(cb.onToolUse).not.toHaveBeenCalled();
    expect(cb.onToolResult).not.toHaveBeenCalled();
    expect(cb.onThinking).not.toHaveBeenCalled();
    expect(cb.onTurnEnd).not.toHaveBeenCalled();
  });

  it('gracefully ignores malformed input (null, no type, no content)', () => {
    const cb = makeCallbacks();
    dispatchSdkMessage(null, agentId, cb);
    dispatchSdkMessage({}, agentId, cb);
    dispatchSdkMessage({ type: 'assistant' }, agentId, cb);
    expect(cb.onChat).not.toHaveBeenCalled();
  });
});
