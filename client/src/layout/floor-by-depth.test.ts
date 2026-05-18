import { describe, it, expect } from 'vitest';
import { floorOfFolder, findFloorForFile, buildFloorsByDepth } from './floor-by-depth';
import { GraphNode, FolderScore } from '../types';

function folderNode(id: string, depth: number): GraphNode {
  return {
    id, name: id.split('/').pop() || id, isFolder: true, depth,
    activityCount: { reads: 0, writes: 0, searches: 0 },
  };
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
  it('groups folders into floors by depth, multi-root', () => {
    const nodes: GraphNode[] = [
      folderNode('client', 0),
      folderNode('server', 0),
      folderNode('client/src', 1),
      folderNode('server/src', 1),
      folderNode('client/src/components', 2),
    ];
    const hot: FolderScore[] = [
      { folder: 'client/src', score: 9, recentFiles: ['App.tsx'] },
      { folder: 'client', score: 5, recentFiles: [] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);

    expect(floors[0].floor).toBe(0);
    expect(floors[0].rooms.map(r => r.name).sort()).toEqual(['client', 'server']);
    expect(floors[1].rooms.map(r => r.name).sort()).toEqual(['src', 'src']);
    expect(floors[2].rooms.map(r => r.name)).toEqual(['components']);
  });

  it('orders rooms within a floor by git score (highest first)', () => {
    const nodes: GraphNode[] = [
      folderNode('a', 0), folderNode('b', 0), folderNode('c', 0),
    ];
    const hot: FolderScore[] = [
      { folder: 'b', score: 50, recentFiles: [] },
      { folder: 'a', score: 10, recentFiles: [] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    expect(floors[0].rooms.map(r => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('registers a file position for every recent file and for the folder', () => {
    const nodes: GraphNode[] = [folderNode('client/src', 1)];
    const hot: FolderScore[] = [
      { folder: 'client/src', score: 3, recentFiles: ['client/src/App.tsx'] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    const floor1 = floors.find(f => f.floor === 1)!;
    expect(floor1.filePositions.has('client/src/App.tsx')).toBe(true);
    expect(floor1.filePositions.has('client/src')).toBe(true);
  });

  it('emits no phantom desk for folders without recent files', () => {
    const nodes: GraphNode[] = [
      folderNode('absent', 0),
      folderNode('emptyrecent', 0),
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
    expect(floor0.filePositions.get('absent')).toBeDefined();
    expect(floor0.filePositions.get('emptyrecent')).toBeDefined();
  });

  it('breaks a git-score tie alphabetically by id', () => {
    const nodes: GraphNode[] = [folderNode('x', 0), folderNode('m', 0)];
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
});
