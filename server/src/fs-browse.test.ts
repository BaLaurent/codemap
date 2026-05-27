import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listSubdirectories } from './fs-browse.js';

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cm-fs-')));
  fs.mkdirSync(path.join(root, 'alpha'));
  fs.mkdirSync(path.join(root, 'beta'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.writeFileSync(path.join(root, 'file.txt'), 'x');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('listSubdirectories', () => {
  it('returns sub-directories only, sorted, excluding dotfiles and files', () => {
    const r = listSubdirectories(root);
    expect(r.entries.map(e => e.name)).toEqual(['alpha', 'beta']);
    expect(r.entries[0].path).toBe(path.join(root, 'alpha'));
    expect(r.path).toBe(root);
  });

  it('exposes the parent directory', () => {
    const r = listSubdirectories(root);
    expect(r.parent).toBe(path.dirname(root));
  });

  it('defaults to the home directory for an empty path', () => {
    const r = listSubdirectories('');
    expect(r.path).toBe(os.homedir());
  });

  it('includes a symlink pointing to a real directory', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-fs-link-'));
    try {
      const target = path.join(base, 'real-target');
      fs.mkdirSync(target);
      fs.symlinkSync(target, path.join(base, 'link-to-dir'));
      const r = listSubdirectories(base);
      expect(r.entries.map(e => e.name)).toContain('link-to-dir');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it('excludes a dangling symlink', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-fs-dangle-'));
    try {
      fs.symlinkSync(path.join(base, 'does-not-exist'), path.join(base, 'broken'));
      const r = listSubdirectories(base);
      expect(r.entries.map(e => e.name)).not.toContain('broken');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
