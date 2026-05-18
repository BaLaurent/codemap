import { describe, it, expect } from 'vitest';
import { floorOfFolder, findFloorForFile, buildFloorsByDepth } from './floor-by-depth';
import { GraphNode, FolderScore } from '../types';

// Helper: build a folder node with ABSOLUTE id (matching real server contract).
// rootId is an absolute path like '/proj'.
function folderNode(rootId: string, relPath: string, depth: number): GraphNode {
  const absId = relPath === '' ? rootId : `${rootId}/${relPath}`;
  const name = relPath === '' ? rootId.split('/').pop() || rootId : relPath.split('/').pop()!;
  return {
    id: absId,
    name,
    isFolder: true,
    depth,
    activityCount: { reads: 0, writes: 0, searches: 0 },
  };
}

// Root node (depth -1) matching the real server contract.
function rootNode(rootId: string): GraphNode {
  return folderNode(rootId, '', -1);
}

describe('floorOfFolder', () => {
  it('maps root markers to floor 0', () => {
    expect(floorOfFolder('.')).toBe(0);
    expect(floorOfFolder('')).toBe(0);
  });
  it('maps depth to path segment count - 1', () => {
    expect(floorOfFolder('client')).toBe(0);
    expect(floorOfFolder('client/src')).toBe(1);
    expect(floorOfFolder('client/src/components')).toBe(2);
  });
});

describe('findFloorForFile', () => {
  it('returns the floor of the containing folder', () => {
    expect(findFloorForFile('client/src/App.tsx')).toBe(1);
    expect(findFloorForFile('README.md')).toBe(0);
  });
});

describe('buildFloorsByDepth', () => {
  const ROOT = '/proj';

  it('groups folders into floors by node.depth (multi-root + nested case)', () => {
    // Nodes have ABSOLUTE ids (as real server emits). depth is correctly relativized.
    const nodes: GraphNode[] = [
      rootNode(ROOT),                                    // depth -1 (root, excluded from floors)
      folderNode(ROOT, 'client', 0),                     // depth 0 → floor 0
      folderNode(ROOT, 'server', 0),                     // depth 0 → floor 0
      folderNode(ROOT, 'client/src', 1),                 // depth 1 → floor 1
      folderNode(ROOT, 'server/src', 1),                 // depth 1 → floor 1
      folderNode(ROOT, 'client/src/components', 2),      // depth 2 → floor 2
    ];
    const hot: FolderScore[] = [
      { folder: 'client/src', score: 9, recentFiles: ['App.tsx'] },
      { folder: 'client', score: 5, recentFiles: [] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);

    expect(floors[0].floor).toBe(0);
    expect(floors[0].rooms.map(r => r.name).sort()).toEqual(['client', 'server']);
    expect(floors[1].floor).toBe(1);
    expect(floors[1].rooms.map(r => r.name).sort()).toEqual(['src', 'src']);
    expect(floors[2].floor).toBe(2);
    expect(floors[2].rooms.map(r => r.name)).toEqual(['components']);
  });

  it('orders rooms within a floor by git score (highest first), using project-relative folder lookup', () => {
    // hotFolders.folder is project-relative; node ids are absolute.
    // Score lookup must join via relPath, not node.id.
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'a', 0),
      folderNode(ROOT, 'b', 0),
      folderNode(ROOT, 'c', 0),
    ];
    const hot: FolderScore[] = [
      { folder: 'b', score: 50, recentFiles: [] },
      { folder: 'a', score: 10, recentFiles: [] },
      // c has no entry → score 0
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    expect(floors[0].rooms.map(r => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('registers the full relative file key (not basename, not absolute) and the relative folder key', () => {
    // recentFiles are BASENAMES as emitted by git-activity.ts (path.basename).
    // The implementation must join them with the relative folder path.
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'client/src', 1),
    ];
    const hot: FolderScore[] = [
      { folder: 'client/src', score: 3, recentFiles: ['App.tsx'] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    const floor1 = floors.find(f => f.floor === 1)!;

    // Must be full relative path — what HabboRoom matches against
    expect(floor1.filePositions.has('client/src/App.tsx')).toBe(true);
    // Relative folder routing key must be registered
    expect(floor1.filePositions.has('client/src')).toBe(true);

    // Must NOT be a bare basename
    expect(floor1.filePositions.has('App.tsx')).toBe(false);
    // Must NOT be an absolute path
    expect(floor1.filePositions.has('/proj/client/src/App.tsx')).toBe(false);
    expect(floor1.filePositions.has('/proj/client/src')).toBe(false);
  });

  it('emits no phantom desk for folders without recent files', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'absent', 0),
      folderNode(ROOT, 'emptyrecent', 0),
    ];
    const hot: FolderScore[] = [
      { folder: 'emptyrecent', score: 5, recentFiles: [] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    const floor0 = floors.find(f => f.floor === 0)!;

    const absentRoom = floor0.rooms.find(r => r.name === 'absent')!;
    const emptyRoom = floor0.rooms.find(r => r.name === 'emptyrecent')!;
    expect(absentRoom.files).toHaveLength(0);
    expect(emptyRoom.files).toHaveLength(0);

    // Relative folder routing keys must still be registered
    expect(floor0.filePositions.get('absent')).toBeDefined();
    expect(floor0.filePositions.get('emptyrecent')).toBeDefined();
  });

  it('breaks a git-score tie alphabetically by relative path', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'x', 0),
      folderNode(ROOT, 'm', 0),
    ];
    const hot: FolderScore[] = [
      { folder: 'x', score: 5, recentFiles: [] },
      { folder: 'm', score: 5, recentFiles: [] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    expect(floors[0].rooms.map(r => r.name)).toEqual(['m', 'x']);
  });

  it('returns [] for an empty tree', () => {
    expect(buildFloorsByDepth([], [])).toEqual([]);
  });

  it('handles missing root node gracefully (falls back to identity for relPath)', () => {
    // No root node: rootId becomes '', toRel returns the id unchanged.
    // Folder nodes happen to use relative ids in this degenerate case.
    const nodes: GraphNode[] = [
      folderNode(ROOT, 'solo', 0),
    ];
    const hot: FolderScore[] = [];
    const floors = buildFloorsByDepth(nodes, hot);
    // Should return 1 floor with 1 room (not crash)
    expect(floors).toHaveLength(1);
    expect(floors[0].floor).toBe(0);
    expect(floors[0].rooms).toHaveLength(1);
  });
});
