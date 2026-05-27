import { describe, it, expect } from 'vitest';
import { fileFromActivityEvent } from './agent-file';

describe('fileFromActivityEvent', () => {
  it('records the relative path for read events (start and end)', () => {
    expect(fileFromActivityEvent('read-start', 'bin/setup.js')).toBe('bin/setup.js');
    expect(fileFromActivityEvent('read-end', 'bin/setup.js')).toBe('bin/setup.js');
  });

  it('records the relative path for write events (start and end)', () => {
    expect(fileFromActivityEvent('write-start', 'client/src/App.tsx')).toBe('client/src/App.tsx');
    expect(fileFromActivityEvent('write-end', 'client/src/App.tsx')).toBe('client/src/App.tsx');
  });

  it('ignores search events (the path is "searchPath:pattern", not a file)', () => {
    expect(fileFromActivityEvent('search-start', '.:TODO')).toBeUndefined();
    expect(fileFromActivityEvent('search-end', 'client:use.*')).toBeUndefined();
  });

  it('returns undefined for an empty path so currentFile stays sticky', () => {
    expect(fileFromActivityEvent('read-end', '')).toBeUndefined();
  });
});
