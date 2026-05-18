import { describe, it, expect } from 'vitest';
import { calculateTreeLayout } from './tree-layout';
import { GraphNode } from '../types';

function n(id: string, depth: number, isFolder: boolean): GraphNode {
  return { id, name: id.split('/').pop() || id, isFolder, depth,
    activityCount: { reads: 0, writes: 0, searches: 0 } };
}

const tree: GraphNode[] = [
  n('root', -1, true),
  n('root/src', 0, true),
  n('root/src/a.ts', 1, false),
  n('root/src/b.ts', 1, false),
  n('root/README.md', 0, false),
];

describe('calculateTreeLayout', () => {
  it('lays out every node when nothing is collapsed', () => {
    const out = calculateTreeLayout(tree, new Set());
    expect(out.map(o => o.id).sort()).toEqual(
      ['root', 'root/README.md', 'root/src', 'root/src/a.ts', 'root/src/b.ts'].sort()
    );
  });

  it('prunes the subtree of a collapsed folder and annotates hidden count', () => {
    const out = calculateTreeLayout(tree, new Set(['root/src']));
    const ids = out.map(o => o.id);
    expect(ids).not.toContain('root/src/a.ts');
    expect(ids).not.toContain('root/src/b.ts');
    const src = out.find(o => o.id === 'root/src')!;
    expect(src.collapsedCount).toBe(2);
  });

  it('returns [] for empty input', () => {
    expect(calculateTreeLayout([], new Set())).toEqual([]);
  });

  const nested: GraphNode[] = [
    n('root', -1, true),
    n('root/src', 0, true),
    n('root/src/util', 1, true),
    n('root/src/util/x.ts', 2, false),
    n('root/src/a.ts', 1, false),
  ];

  it('counts nested descendants of a collapsed folder', () => {
    const out = calculateTreeLayout(nested, new Set(['root/src']));
    const ids = out.map(o => o.id);
    expect(ids).not.toContain('root/src/util');
    expect(ids).not.toContain('root/src/util/x.ts');
    expect(ids).not.toContain('root/src/a.ts');
    expect(out.find(o => o.id === 'root/src')!.collapsedCount).toBe(3);
  });

  it('reports the full unpruned subtree count even when an inner folder is also collapsed', () => {
    const out = calculateTreeLayout(nested, new Set(['root/src', 'root/src/util']));
    const ids = out.map(o => o.id);
    expect(ids).not.toContain('root/src/util');
    expect(ids).not.toContain('root/src/util/x.ts');
    expect(ids).not.toContain('root/src/a.ts');
    expect(out.find(o => o.id === 'root/src')!.collapsedCount).toBe(3);
  });

  it('collapses the root itself into a single counted node', () => {
    const out = calculateTreeLayout(tree, new Set(['root']));
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('root');
    expect(out[0].collapsedCount).toBe(tree.length - 1);
  });

  it('lays leaves out contiguously with no gaps left by pruned children', () => {
    const full = calculateTreeLayout(tree, new Set());
    const leafIds = ['root/README.md', 'root/src/a.ts', 'root/src/b.ts'];
    const ys = full
      .filter(o => leafIds.includes(o.id))
      .map(o => o.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBe(50);
    }

    const pruned = calculateTreeLayout(tree, new Set(['root/src']));
    const prunedLeafYs = pruned
      .filter(o => o.id === 'root/src' || o.id === 'root/README.md')
      .map(o => o.y)
      .sort((a, b) => a - b);
    expect(prunedLeafYs).toEqual([0, 50]);
  });
});
