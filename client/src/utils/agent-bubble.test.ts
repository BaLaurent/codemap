import { describe, it, expect } from 'vitest';
import { bubbleSecondaryText, bubbleStuckLines, wrapText } from './agent-bubble';

describe('bubbleSecondaryText', () => {
  it('shows the current file basename for file commands', () => {
    expect(bubbleSecondaryText('Read', 'bin/setup.js', 'setup.js')).toBe('setup.js');
    expect(bubbleSecondaryText('Edit', 'client/src/components/HabboRoom.tsx', 'x'))
      .toBe('HabboRoom.tsx');
    expect(bubbleSecondaryText('Write', 'server/src/index.ts', undefined)).toBe('index.ts');
    expect(bubbleSecondaryText('MultiEdit', 'a/b/c.ts', undefined)).toBe('c.ts');
  });

  it('prefers currentFile over a divergent toolInput (kills the desync)', () => {
    // Bubble used to lag behind movement because toolInput came from a separate
    // hook; now both derive from currentFile, so the file always wins for reads.
    expect(bubbleSecondaryText('Read', 'bin/setup.js', 'stale-other.js')).toBe('setup.js');
  });

  it('shows toolInput for non-file commands (Bash/Grep), ignoring sticky currentFile', () => {
    expect(bubbleSecondaryText('Bash', 'bin/setup.js', 'npm test')).toBe('npm test');
    expect(bubbleSecondaryText('Grep', 'bin/setup.js', 'TODO')).toBe('TODO');
  });

  it('falls back to toolInput when no currentFile is known', () => {
    expect(bubbleSecondaryText('Read', undefined, 'setup.js')).toBe('setup.js');
  });

  it('returns null when there is nothing to show', () => {
    expect(bubbleSecondaryText('Bash', undefined, undefined)).toBeNull();
    expect(bubbleSecondaryText(undefined, undefined, undefined)).toBeNull();
  });
});

describe('wrapText', () => {
  it('keeps short text on a single line', () => {
    expect(wrapText('Which DB?', 24)).toEqual(['Which DB?']);
  });

  it('wraps across multiple lines on word boundaries, showing the full text', () => {
    const lines = wrapText('Quelle approche pour le cache des requetes', 24);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(l => l.length <= 24)).toBe(true);
    // No word is split mid-way and nothing is dropped (rejoining restores it).
    expect(lines.join(' ')).toBe('Quelle approche pour le cache des requetes');
  });

  it('never truncates a long sentence — it just uses more lines', () => {
    const text = 'a b c d e f g h i j k l m n o p';
    const lines = wrapText(text, 3);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.some(l => l.endsWith('…'))).toBe(false);
    expect(lines.join(' ')).toBe(text);
  });

  it('hard-truncates only a single word longer than the limit', () => {
    const lines = wrapText('Supercalifragilisticexpialidocious', 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(10);
    expect(lines[0].endsWith('…')).toBe(true);
  });

  it('returns a single empty line for empty input', () => {
    expect(wrapText('', 24)).toEqual(['']);
  });
});

describe('bubbleStuckLines', () => {
  it('falls back to the generic message when no question was captured', () => {
    expect(bubbleStuckLines(undefined)).toEqual([{ text: "Hey! I'm stuck!", bold: true }]);
    // A permission prompt detected by timeout has no question text.
    expect(bubbleStuckLines({ question: '' })).toEqual([{ text: "Hey! I'm stuck!", bold: true }]);
  });

  it('shows a short question at the largest font on one line', () => {
    expect(bubbleStuckLines({ question: 'Which DB?' }))
      .toEqual([{ text: 'Which DB?', bold: true, size: 10 }]);
    expect(bubbleStuckLines({ question: 'Which DB?', options: [] }))
      .toEqual([{ text: 'Which DB?', bold: true, size: 10 }]);
  });

  it('appends a non-bold options line', () => {
    const lines = bubbleStuckLines({ question: 'Which DB?', options: ['Postgres', 'MySQL'] });
    expect(lines[0]).toEqual({ text: 'Which DB?', bold: true, size: 10 });
    expect(lines[lines.length - 1]).toEqual({ text: 'Postgres / MySQL', bold: false });
  });

  it('shrinks the font for a long question and shows it in full (no truncation)', () => {
    const longQuestion =
      'Quelle approche veux-tu pour la gestion du cache des requetes vers la base de ' +
      'donnees distante, et quelle strategie d invalidation des entrees expirees du cache partage ?';
    const lines = bubbleStuckLines({ question: longQuestion });
    const questionLines = lines.filter(l => l.bold);
    expect(questionLines.length).toBeGreaterThan(0);
    // Adapted to a smaller font than a short question would use...
    expect(questionLines[0].size).toBeLessThan(10);
    // ...and the entire question is shown, nothing ellipsized away.
    expect(questionLines.some(l => l.text.endsWith('…'))).toBe(false);
    expect(questionLines.map(l => l.text).join(' ')).toBe(longQuestion);
  });
});
