// Pure recursive tree layout. `collapsed` holds folder ids whose subtrees are
// hidden; a collapsed folder gets `collapsedCount` = number of hidden descendants.
import { GraphNode } from '../types';

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  collapsedCount?: number;
}

// Tree node spacing in px (x = per-depth column, y = per-row).
const nodeSpacingX = 180;
const nodeSpacingY = 50;

// `collapsed` is expected to contain FOLDER ids only; a file id would just get
// a meaningless `collapsedCount: 0`. No guard needed: the caller
// (`collapsedFoldersRef`) only ever holds folder ids.
export function calculateTreeLayout(
  nodes: GraphNode[],
  collapsed: Set<string>
): LayoutNode[] {
  if (nodes.length === 0) return [];

  const childrenMap = new Map<string, GraphNode[]>();
  for (const node of nodes) childrenMap.set(node.id, []);

  let root: GraphNode | null = null;
  let minDepth = Infinity;
  for (const node of nodes) {
    if (node.depth < minDepth) { minDepth = node.depth; root = node; }
  }
  if (!root) return [];

  for (const node of nodes) {
    if (node.id === root.id) continue;
    const parentPath = node.id.substring(0, node.id.lastIndexOf('/'));
    if (childrenMap.has(parentPath)) childrenMap.get(parentPath)!.push(node);
    else childrenMap.get(root.id)?.push(node);
  }

  for (const [, children] of childrenMap) {
    children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  function countDescendants(id: string): number {
    const kids = childrenMap.get(id) || [];
    return kids.reduce((sum, k) => sum + 1 + countDescendants(k.id), 0);
  }

  const layoutNodes: LayoutNode[] = [];
  let currentY = 0;

  function layoutSubtree(node: GraphNode, depth: number): { minY: number; maxY: number } {
    const isCollapsed = collapsed.has(node.id);
    const children = isCollapsed ? [] : (childrenMap.get(node.id) || []);

    if (children.length === 0) {
      const y = currentY;
      currentY += nodeSpacingY;
      const ln: LayoutNode = { ...node, x: depth * nodeSpacingX, y };
      if (isCollapsed) ln.collapsedCount = countDescendants(node.id);
      layoutNodes.push(ln);
      return { minY: y, maxY: y };
    }

    const bounds = children.map(c => layoutSubtree(c, depth + 1));
    const minY = Math.min(...bounds.map(b => b.minY));
    const maxY = Math.max(...bounds.map(b => b.maxY));
    layoutNodes.push({ ...node, x: depth * nodeSpacingX, y: (minY + maxY) / 2 });
    return { minY, maxY };
  }

  layoutSubtree(root, 0);
  return layoutNodes;
}
