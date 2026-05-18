import { describe, it, expect } from 'vitest';
import { calculateTreeLayout, pruneToActive } from './tree-layout';
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

// Helpers for pruneToActive tests
function inactive(id: string, depth: number, isFolder: boolean): GraphNode {
  return {
    id, name: id.split('/').pop() || id, isFolder, depth,
    activityCount: { reads: 0, writes: 0, searches: 0 },
  };
}

function withLastActivity(node: GraphNode): GraphNode {
  return { ...node, lastActivity: { type: 'read', timestamp: Date.now() } };
}

describe('pruneToActive', () => {
  const fullTree: GraphNode[] = [
    inactive('root', -1, true),
    inactive('root/src', 0, true),
    inactive('root/src/utils', 1, true),
    inactive('root/src/a.ts', 1, false),
    inactive('root/src/utils/helper.ts', 2, false),
    inactive('root/docs', 0, true),
    inactive('root/docs/guide.md', 1, false),
  ];

  it('returns [] for empty input', () => {
    expect(pruneToActive([])).toEqual([]);
  });

  it('returns only the root when no files are active', () => {
    const result = pruneToActive(fullTree);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('root');
  });

  it('root is always present when input is non-empty', () => {
    const activeTree = fullTree.map(n =>
      n.id === 'root/src/a.ts' ? { ...n, activityCount: { reads: 2, writes: 0, searches: 0 } } : n
    );
    const result = pruneToActive(activeTree);
    expect(result.some(n => n.id === 'root')).toBe(true);
  });

  it('keeps an active file and all its ancestor folders', () => {
    const activeTree = fullTree.map(n =>
      n.id === 'root/src/utils/helper.ts'
        ? { ...n, activityCount: { reads: 0, writes: 1, searches: 0 } }
        : n
    );
    const result = pruneToActive(activeTree);
    const ids = result.map(r => r.id);
    expect(ids).toContain('root/src/utils/helper.ts');
    expect(ids).toContain('root/src/utils');
    expect(ids).toContain('root/src');
    expect(ids).toContain('root');
  });

  it('drops inactive files', () => {
    const activeTree = fullTree.map(n =>
      n.id === 'root/src/a.ts' ? { ...n, activityCount: { reads: 1, writes: 0, searches: 0 } } : n
    );
    const result = pruneToActive(activeTree);
    const ids = result.map(r => r.id);
    expect(ids).not.toContain('root/docs/guide.md');
    expect(ids).not.toContain('root/docs');
    expect(ids).not.toContain('root/src/utils/helper.ts');
    expect(ids).not.toContain('root/src/utils');
  });

  it('keeps a file with lastActivity but zero counts', () => {
    const activeTree = fullTree.map(n =>
      n.id === 'root/docs/guide.md' ? withLastActivity(n) : n
    );
    const result = pruneToActive(activeTree);
    const ids = result.map(r => r.id);
    expect(ids).toContain('root/docs/guide.md');
    expect(ids).toContain('root/docs');
    expect(ids).toContain('root');
  });

  it('keeps a file with searches count > 0', () => {
    const activeTree = fullTree.map(n =>
      n.id === 'root/src/a.ts' ? { ...n, activityCount: { reads: 0, writes: 0, searches: 3 } } : n
    );
    const result = pruneToActive(activeTree);
    expect(result.map(r => r.id)).toContain('root/src/a.ts');
  });

  it('the kept set is connected: every non-root kept node has its parent-by-prefix also kept', () => {
    const activeTree = fullTree.map(n =>
      n.id === 'root/src/utils/helper.ts'
        ? { ...n, activityCount: { reads: 1, writes: 1, searches: 0 } }
        : n
    );
    const result = pruneToActive(activeTree);
    const ids = new Set(result.map(r => r.id));
    for (const id of ids) {
      const lastSlash = id.lastIndexOf('/');
      if (lastSlash <= 0) continue; // root has no parent prefix in set
      const parentPrefix = id.substring(0, lastSlash);
      if (parentPrefix) {
        expect(ids.has(parentPrefix)).toBe(true);
      }
    }
  });

  it('handles multiple active files from different branches', () => {
    const activeTree = fullTree.map(n => {
      if (n.id === 'root/src/a.ts') return { ...n, activityCount: { reads: 1, writes: 0, searches: 0 } };
      if (n.id === 'root/docs/guide.md') return { ...n, activityCount: { reads: 0, writes: 1, searches: 0 } };
      return n;
    });
    const result = pruneToActive(activeTree);
    const ids = result.map(r => r.id);
    expect(ids).toContain('root/src/a.ts');
    expect(ids).toContain('root/src');
    expect(ids).toContain('root/docs/guide.md');
    expect(ids).toContain('root/docs');
    expect(ids).toContain('root');
    // Unrelated inactive sibling folder contents not included
    expect(ids).not.toContain('root/src/utils/helper.ts');
    expect(ids).not.toContain('root/src/utils');
  });
});
