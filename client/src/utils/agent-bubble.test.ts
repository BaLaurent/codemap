import { describe, it, expect } from 'vitest';
import { bubbleSecondaryText } from './agent-bubble';

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
