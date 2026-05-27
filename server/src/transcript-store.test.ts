/**
 * Transcript Store Tests
 *
 * Covers: append+get, isolation par agentId, copie défensive, cap MAX_TRANSCRIPT_LINES
 * (FIFO — les plus anciennes tombent), delete, clear.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendChatMessage,
  getTranscript,
  clearTranscripts,
  MAX_TRANSCRIPT_LINES,
} from './transcript-store.js';
import type { ChatMessage } from './types.js';

function msg(agentId: string, content: string, role: ChatMessage['role'] = 'assistant'): ChatMessage {
  return { agentId, role, content, timestamp: Date.now() };
}

describe('transcript-store', () => {
  beforeEach(() => {
    clearTranscripts();
  });

  it('getTranscript renvoie un tableau vide pour un agent inconnu', () => {
    expect(getTranscript('agent-x')).toEqual([]);
  });

  it('appendChatMessage persiste les messages et getTranscript les renvoie', () => {
    appendChatMessage(msg('a1', 'bonjour', 'user'));
    appendChatMessage(msg('a1', 'salut', 'assistant'));

    const transcript = getTranscript('a1');
    expect(transcript).toHaveLength(2);
    expect(transcript[0].content).toBe('bonjour');
    expect(transcript[1].content).toBe('salut');
  });

  it('les transcripts sont isolés par agentId', () => {
    appendChatMessage(msg('a1', 'message-A'));
    appendChatMessage(msg('a2', 'message-B'));

    expect(getTranscript('a1')).toHaveLength(1);
    expect(getTranscript('a1')[0].content).toBe('message-A');

    expect(getTranscript('a2')).toHaveLength(1);
    expect(getTranscript('a2')[0].content).toBe('message-B');
  });

  it('getTranscript renvoie un tableau que l\'on peut muter sans affecter l\'état interne', () => {
    appendChatMessage(msg('a1', 'original'));
    const copy = getTranscript('a1');

    // Muter le tableau retourné
    copy.push(msg('a1', 'intrus'));

    // L'état interne est intact
    expect(getTranscript('a1')).toHaveLength(1);
  });

  it(`cap à MAX_TRANSCRIPT_LINES : les messages les plus anciens sont évincés`, () => {
    for (let i = 0; i < MAX_TRANSCRIPT_LINES + 5; i++) {
      appendChatMessage(msg('a1', `ligne-${i}`));
    }

    const transcript = getTranscript('a1');
    expect(transcript).toHaveLength(MAX_TRANSCRIPT_LINES);

    // Les 5 premières lignes (les plus anciennes) doivent avoir disparu
    expect(transcript[0].content).toBe('ligne-5');
    // La dernière ligne est bien la toute dernière ajoutée
    expect(transcript[transcript.length - 1].content).toBe(`ligne-${MAX_TRANSCRIPT_LINES + 4}`);
  });

  it('clearTranscripts vide tous les transcripts', () => {
    appendChatMessage(msg('a1', 'x'));
    appendChatMessage(msg('a2', 'y'));

    clearTranscripts();

    expect(getTranscript('a1')).toEqual([]);
    expect(getTranscript('a2')).toEqual([]);
  });

  it('appendChatMessage préserve tous les champs du ChatMessage, dont tool', () => {
    const m: ChatMessage = {
      agentId: 'a1',
      role: 'tool',
      content: '',
      timestamp: 1234567890,
      tool: { name: 'Read', input: 'src/index.ts' },
    };
    appendChatMessage(m);

    const [stored] = getTranscript('a1');
    expect(stored.tool).toEqual({ name: 'Read', input: 'src/index.ts' });
    expect(stored.timestamp).toBe(1234567890);
  });
});
