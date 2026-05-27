// Queue-backed async generator of user messages for an SDK streaming session.
//
// The SDK consumes `stream()` as its prompt and parks on it between turns; the
// hotel pushes new user turns via `push()` whenever the user sends a message.
// This is what keeps a spawned agent alive for a multi-turn conversation.
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

export class SessionInput {
  private buffer: SDKUserMessage[] = [];
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = [];
  private closed = false;

  push(content: string, sessionId: string): void {
    if (this.closed) return;
    const msg = {
      type: 'user',
      session_id: sessionId,
      parent_tool_use_id: null,
      message: { role: 'user', content },
    } as unknown as SDKUserMessage;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: msg, done: false });
    else this.buffer.push(msg);
  }

  close(): void {
    this.closed = true;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) w({ value: undefined as unknown as SDKUserMessage, done: true });
  }

  async *stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (this.buffer.length) {
        yield this.buffer.shift()!;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<SDKUserMessage>>(res => this.waiters.push(res));
      if (next.done) return;
      yield next.value;
    }
  }
}
