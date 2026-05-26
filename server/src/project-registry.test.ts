import { describe, it, expect, afterEach } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { ProjectRegistry } from './project-registry.js';

function makeProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-proj-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
  return dir;
}

describe('ProjectRegistry', () => {
  const dirs: string[] = [];
  afterEach(() => {
    dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
    dirs.length = 0;
  });

  it('creates a workspace on first access and reuses it', () => {
    const root = makeProjectDir(); dirs.push(root);
    const reg = new ProjectRegistry();
    const w1 = reg.getOrCreate('id-1', root, 'proj');
    const w2 = reg.getOrCreate('id-1', root, 'proj');
    expect(w1).toBe(w2);
    expect(reg.list().map(p => p.projectId)).toEqual(['id-1']);
    reg.dispose();
  });

  it('isolates stores between projects', () => {
    const rootA = makeProjectDir(); dirs.push(rootA);
    const rootB = makeProjectDir(); dirs.push(rootB);
    const reg = new ProjectRegistry();
    const a = reg.getOrCreate('A', rootA, 'a');
    const b = reg.getOrCreate('B', rootB, 'b');
    expect(a.store).not.toBe(b.store);
    expect(a.store.getProjectRoot()).toBe(rootA);
    expect(b.store.getProjectRoot()).toBe(rootB);
    reg.dispose();
  });

  it('relativizes an absolute path against the right project', () => {
    const root = makeProjectDir(); dirs.push(root);
    const reg = new ProjectRegistry();
    reg.getOrCreate('id-1', root, 'proj');
    expect(reg.toRelativePath('id-1', path.join(root, 'a.txt'))).toBe('a.txt');
    expect(reg.toRelativePath('id-1', root)).toBe('.');
    reg.dispose();
  });

  it('reports list() with lastActivity and agentCount', () => {
    const root = makeProjectDir(); dirs.push(root);
    const reg = new ProjectRegistry();
    const w = reg.getOrCreate('id-1', root, 'proj');
    w.lastActivity = 1234;
    const info = reg.list();
    expect(info[0]).toMatchObject({ projectId: 'id-1', projectName: 'proj', projectRoot: root, lastActivity: 1234 });
    reg.dispose();
  });
});
