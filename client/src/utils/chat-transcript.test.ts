import { describe, it, expect } from 'vitest';
import { mergeTranscript } from './chat-transcript';
import type { ChatMessage } from '../types';

const line = (ts: number, content = `m${ts}`): ChatMessage => ({
  agentId: 'a1', role: 'assistant', content, timestamp: ts,
});

describe('mergeTranscript', () => {
  it('returns the server transcript unchanged when there are no local lines', () => {
    const server = [line(1), line(2)];
    expect(mergeTranscript(server, [])).toEqual(server);
  });

  it('drops local lines at or before the last server timestamp (already persisted)', () => {
    const server = [line(1), line(2)];
    const local = [line(1), line(2)]; // same lines echoed over WS
    expect(mergeTranscript(server, local)).toEqual(server);
  });

  it('appends only local lines strictly newer than the server tail', () => {
    const server = [line(1), line(2)];
    const local = [line(2), line(3, 'live'), line(4, 'live2')];
    expect(mergeTranscript(server, local)).toEqual([line(1), line(2), line(3, 'live'), line(4, 'live2')]);
  });

  it('does not duplicate a line sharing the last server timestamp', () => {
    const server = [line(1), line(5)];
    const local = [line(5)]; // exact same timestamp as server tail
    const merged = mergeTranscript(server, local);
    expect(merged).toHaveLength(2);
    expect(merged).toEqual(server);
  });

  it('keeps server lines first, preserving order', () => {
    const server = [line(10), line(20)];
    const local = [line(30)];
    const merged = mergeTranscript(server, local);
    expect(merged.map(m => m.timestamp)).toEqual([10, 20, 30]);
  });

  it('treats an empty server transcript as keeping all local lines', () => {
    const local = [line(1), line(2)];
    expect(mergeTranscript([], local)).toEqual(local);
  });
});
