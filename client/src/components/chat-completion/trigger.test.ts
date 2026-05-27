import { describe, it, expect } from 'vitest';
import { detectTrigger, applyCompletion, filterCommands, filterFiles } from './trigger';
import type { SlashCommand } from '../../types';

describe('detectTrigger', () => {
  it('opens command menu when the line starts with "/" within the first token', () => {
    expect(detectTrigger('/gra', 4)).toEqual({ kind: 'command', query: 'gra', start: 0, end: 4 });
  });

  it('closes the command menu once a space follows the command token', () => {
    expect(detectTrigger('/graphify foo', 13)).toBeNull();
  });

  it('does not treat a mid-line slash as a command', () => {
    expect(detectTrigger('see src/a', 9)).toBeNull();
  });

  it('opens file menu on "@" at the start of the line', () => {
    expect(detectTrigger('@src/ind', 8)).toEqual({ kind: 'file', query: 'src/ind', start: 0, end: 8 });
  });

  it('opens file menu on "@" after whitespace', () => {
    expect(detectTrigger('edit @cli', 9)).toEqual({ kind: 'file', query: 'cli', start: 5, end: 9 });
  });

  it('does not open file menu when "@" is glued to a previous word (email-like)', () => {
    expect(detectTrigger('me@host', 7)).toBeNull();
  });

  it('closes file menu once a space follows the path', () => {
    expect(detectTrigger('@src/a b', 8)).toBeNull();
  });
});

describe('applyCompletion', () => {
  it('replaces the command token and appends a trailing space', () => {
    const t = detectTrigger('/gra', 4)!;
    expect(applyCompletion('/gra', t, 'graphify')).toEqual({ value: '/graphify ', caret: 10 });
  });

  it('replaces the file token, preserving text after the caret', () => {
    const t = detectTrigger('edit @cli', 9)!;
    const r = applyCompletion('edit @cli', t, 'client/src/App.tsx');
    expect(r.value).toBe('edit @client/src/App.tsx ');
    expect(r.caret).toBe(r.value.length);
  });
});

describe('filterCommands', () => {
  const cmds: SlashCommand[] = [
    { name: 'preview', description: 'p', argumentHint: '' },  // 'rev' is a substring
    { name: 'review', description: 'r', argumentHint: '' },   // 'rev' is a prefix
    { name: 'commit', description: 'c', argumentHint: '', aliases: ['ci'] },
  ];

  it('returns everything for an empty query', () => {
    expect(filterCommands(cmds, '')).toHaveLength(3);
  });

  it('ranks prefix matches before substring matches', () => {
    expect(filterCommands(cmds, 'rev').map(c => c.name)).toEqual(['review', 'preview']);
  });

  it('matches on aliases', () => {
    expect(filterCommands(cmds, 'ci').map(c => c.name)).toContain('commit');
  });
});

describe('filterFiles', () => {
  const files = ['client/src/App.tsx', 'server/src/index.ts', 'client/src/index.ts'];

  it('ranks basename prefix matches first', () => {
    const r = filterFiles(files, 'index');
    expect(r[0]).toMatch(/index\.ts$/);
  });

  it('filters out non-matches', () => {
    expect(filterFiles(files, 'zzz')).toHaveLength(0);
  });
});
