import { describe, it, expect } from 'vitest';
import { floorOfFolder, findFloorForFile, buildFloorsByDepth, floorNumbers, FloorModel } from './floor-by-depth';
import { GraphNode, FolderScore } from '../types';

const ROOT = '/proj';

// Helper: build a folder node with ABSOLUTE id (matching real server contract).
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

// Helper: build a file node with ABSOLUTE id (matching real server contract).
function fileNode(
  rootId: string,
  relPath: string,
  depth: number,
  activity: { reads?: number; writes?: number; searches?: number } = {}
): GraphNode {
  const absId = `${rootId}/${relPath}`;
  const name = relPath.split('/').pop()!;
  return {
    id: absId,
    name,
    isFolder: false,
    depth,
    activityCount: {
      reads: activity.reads ?? 0,
      writes: activity.writes ?? 0,
      searches: activity.searches ?? 0,
    },
  };
}

// Root node (depth -1) matching the real server contract.
function rootNode(rootId: string): GraphNode {
  return folderNode(rootId, '', -1);
}

// -----------------------------------------------------------------------
// floorOfFolder
// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
// floorNumbers — the layout's report of which floors exist (consumed by the
// nav bar). Must be distinct + sorted ascending so ▲▼ stepping is correct.
// -----------------------------------------------------------------------
describe('floorNumbers', () => {
  const fm = (floor: number): FloorModel => ({ floor, rooms: [], filePositions: new Map() });

  it('returns empty for no floors', () => {
    expect(floorNumbers([])).toEqual([]);
  });
  it('returns distinct floor depths sorted ascending', () => {
    expect(floorNumbers([fm(2), fm(0), fm(1)])).toEqual([0, 1, 2]);
  });
  it('dedupes repeated depths', () => {
    expect(floorNumbers([fm(1), fm(1), fm(3)])).toEqual([1, 3]);
  });
});

// -----------------------------------------------------------------------
// findFloorForFile
// -----------------------------------------------------------------------
describe('findFloorForFile', () => {
  it('returns the floor of the containing folder', () => {
    expect(findFloorForFile('client/src/App.tsx')).toBe(1);
    expect(findFloorForFile('README.md')).toBe(0);
  });
});

// -----------------------------------------------------------------------
// buildFloorsByDepth — v2 contract
// -----------------------------------------------------------------------
describe('buildFloorsByDepth', () => {

  // --- empty / missing root guard ----------------------------------------

  it('returns [] for an empty tree', () => {
    expect(buildFloorsByDepth([], [])).toEqual([]);
  });

  it('handles missing root node gracefully (falls back to identity for relPath)', () => {
    // No root node → rootId = '' → toRel returns absId unchanged.
    // Folder node created by folderNode with ROOT prefix, but no rootNode added.
    // Because the id starts with '/proj/' and rootId is '', toRel returns the id as-is.
    // The folder has one direct file so it should produce a room.
    const nodes: GraphNode[] = [
      folderNode(ROOT, 'solo', 0),
      fileNode(ROOT, 'solo/index.ts', 0),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    // Should not crash and should produce 1 floor with 1 room.
    expect(floors).toHaveLength(1);
    expect(floors[0].floor).toBe(0);
    expect(floors[0].rooms).toHaveLength(1);
  });

  // --- desk source: real file nodes, not git recentFiles ----------------

  it('populates room desks from direct file nodes, not git recentFiles', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'client/src', 1),
      fileNode(ROOT, 'client/src/App.tsx', 1, { reads: 5 }),
      fileNode(ROOT, 'client/src/main.ts', 1, { writes: 2 }),
    ];
    const hot: FolderScore[] = [
      // recentFiles deliberately different — must NOT appear as desks
      { folder: 'client/src', score: 9, recentFiles: ['OldFile.tsx', 'Ghost.ts'] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    const floor1 = floors.find(f => f.floor === 1)!;
    expect(floor1).toBeDefined();
    const room = floor1.rooms[0];
    const deskNames = room.files.map(f => f.name);
    expect(deskNames).toContain('App.tsx');
    expect(deskNames).toContain('main.ts');
    expect(deskNames).not.toContain('OldFile.tsx');
    expect(deskNames).not.toContain('Ghost.ts');
  });

  // --- desk sorting: activity desc, then name asc -----------------------

  it('sorts desks by total activity descending, then name ascending on tie', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'lib', 0),
      fileNode(ROOT, 'lib/c.ts', 0, { reads: 10 }),
      fileNode(ROOT, 'lib/a.ts', 0, { reads: 5 }),
      fileNode(ROOT, 'lib/b.ts', 0, { reads: 5 }),  // tie with a.ts → a before b
      fileNode(ROOT, 'lib/z.ts', 0, { reads: 1 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    const room = floors[0].rooms[0];
    expect(room.files.map(f => f.name)).toEqual(['c.ts', 'a.ts', 'b.ts', 'z.ts']);
  });

  it('caps desks at MAX_FILES_PER_ROOM (12) and keeps the 12 most active', () => {
    // Build 15 file nodes with distinct activity; the top 12 by activity should appear.
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'big', 0),
    ];
    for (let i = 1; i <= 15; i++) {
      nodes.push(fileNode(ROOT, `big/file${String(i).padStart(2, '0')}.ts`, 0, { reads: i }));
    }
    const floors = buildFloorsByDepth(nodes, []);
    const room = floors[0].rooms[0];
    expect(room.files).toHaveLength(12);
    // The 12 most active are files 04..15 (reads 4..15)
    const deskNames = room.files.map(f => f.name);
    expect(deskNames).not.toContain('file01.ts');
    expect(deskNames).not.toContain('file02.ts');
    expect(deskNames).not.toContain('file03.ts');
    expect(deskNames).toContain('file15.ts');
  });

  // --- empty folder filtering -------------------------------------------

  it('does NOT produce a room for a folder with no direct file nodes', () => {
    // client has no direct files (only subfolders); client/src has files.
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'client', 0),         // depth 0, no direct files
      folderNode(ROOT, 'client/src', 1),      // depth 1, has files
      fileNode(ROOT, 'client/src/App.tsx', 1, { reads: 3 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);

    const floor0 = floors.find(f => f.floor === 0);
    const floor1 = floors.find(f => f.floor === 1)!;

    // floor 0 has no folders with direct files → omitted entirely
    expect(floor0).toBeUndefined();

    // floor 1 still has its room
    expect(floor1.rooms.map(r => r.name)).toContain('src');
  });

  it('omits an entire floor when all its folders have no direct files', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'a', 0),   // no direct files
      folderNode(ROOT, 'b', 0),   // no direct files
      folderNode(ROOT, 'a/x', 1), // has files
      fileNode(ROOT, 'a/x/index.ts', 1, { writes: 1 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    // Floor 0 (a, b) → both empty → omitted
    expect(floors.find(f => f.floor === 0)).toBeUndefined();
    // Floor 1 present
    expect(floors.find(f => f.floor === 1)).toBeDefined();
  });

  it('does NOT register a folder routing key for filtered-out (empty) folders', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'empty', 0),
      folderNode(ROOT, 'nonempty', 0),
      fileNode(ROOT, 'nonempty/util.ts', 0, { reads: 1 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    const floor0 = floors.find(f => f.floor === 0)!;
    expect(floor0.filePositions.has('empty')).toBe(false);
    expect(floor0.filePositions.has('nonempty')).toBe(true);
  });

  // --- integration regression discriminator -----------------------------
  // Documents that depth-0 is omitted when its folders have no direct files,
  // and that consumers MUST key floors by FloorModel.floor (depth), not by
  // array position. (Regression: HabboRoom previously indexed floors[idx]
  // where idx was a depth value → followed the wrong floor once depth-0 was
  // omitted.)
  it('omits depth-0 floor when its folders have no direct files but keeps depth-1', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'client', 0),       // depth 0, no direct files → omitted
      folderNode(ROOT, 'client/src', 1),   // depth 1, has files
      fileNode(ROOT, 'client/src/App.tsx', 1, { reads: 1 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    // No FloorModel with .floor === 0 (depth-0 entirely omitted).
    expect(floors.find(f => f.floor === 0)).toBeUndefined();
    // The depth-1 floor exists and is found by .floor, NOT by floors[1].
    const f1 = floors.find(f => f.floor === 1);
    expect(f1).toBeDefined();
    expect(f1!.rooms.map(r => r.name)).toEqual(['src']);
    // Array position 0 holds the depth-1 floor — proves consumers must
    // never assume floors[depth] === the depth's floor.
    expect(floors[0].floor).toBe(1);
  });

  // --- filePositions keys -----------------------------------------------

  it('registers the full project-relative file key and the relative folder routing key', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'client/src', 1),
      fileNode(ROOT, 'client/src/App.tsx', 1, { reads: 1 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    const floor1 = floors.find(f => f.floor === 1)!;

    // Full project-relative file key
    expect(floor1.filePositions.has('client/src/App.tsx')).toBe(true);
    // Folder routing key
    expect(floor1.filePositions.has('client/src')).toBe(true);
    // Must NOT be basename only
    expect(floor1.filePositions.has('App.tsx')).toBe(false);
    // Must NOT be absolute
    expect(floor1.filePositions.has('/proj/client/src/App.tsx')).toBe(false);
    expect(floor1.filePositions.has('/proj/client/src')).toBe(false);
  });

  it('registers a file at project root with just the basename as key', () => {
    // A file node directly under the root folder → parent rel = ''
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      // Need at least one top-level folder for folders to exist, but the file itself
      // lives under '' (the project root).  We add a dummy folder just to have a
      // folder at depth 0 that also has the root file as a direct child.
      // Actually, files at project root have depth 0 and their parent relPath is ''.
      // We need a folder at depth 0 that represents the project root — but the
      // server doesn't emit such a folder.  Instead, test that the file
      // under a depth-0 folder uses a plain basename when relPath is ''.
      // Simplify: use a folder at relPath '' (depth 0 would be wrong per spec).
      // Per spec the root folder has depth -1; top-level folders have depth 0.
      // A file with parent '' means it lives directly in the project root.
      // There is no explicit folder node for '' at depth 0.
      // We'll use a workaround: add a top-level folder whose relPath IS ''
      // but that's the root — depth -1. Files at root can't be tested via
      // a folder node since root is excluded from rooms.
      //
      // What we CAN test: a folder at depth 0 with relPath 'top' has file key 'top/util.ts'.
      folderNode(ROOT, 'top', 0),
      fileNode(ROOT, 'top/util.ts', 0, { reads: 2 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);
    const floor0 = floors.find(f => f.floor === 0)!;
    expect(floor0.filePositions.has('top/util.ts')).toBe(true);
    const desk = floor0.rooms[0].files.find(f => f.name === 'util.ts')!;
    expect(desk).toBeDefined();
    expect(desk.id).toBe('top/util.ts');
  });

  // --- heatLevel from file's own activity --------------------------------

  it('sets heatLevel from the file node activity, not folder git score', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'mod', 0),
      // reads + writes + searches = 20 → heatLevel = min(1, 20/20) = 1
      fileNode(ROOT, 'mod/hot.ts', 0, { reads: 10, writes: 5, searches: 5 }),
      // zero activity → heatLevel = 0
      fileNode(ROOT, 'mod/cold.ts', 0),
    ];
    const hot: FolderScore[] = [
      { folder: 'mod', score: 999, recentFiles: [] }, // high score should NOT override
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    const room = floors[0].rooms[0];
    const hotDesk = room.files.find(f => f.name === 'hot.ts')!;
    const coldDesk = room.files.find(f => f.name === 'cold.ts')!;
    expect(hotDesk.heatLevel).toBe(1);
    expect(coldDesk.heatLevel).toBe(0);
  });

  // --- room ordering (git score desc, path asc tiebreak) ---------------

  it('orders rooms within a floor by git score descending, path ascending on tie', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'a', 0),
      folderNode(ROOT, 'b', 0),
      folderNode(ROOT, 'c', 0),
      fileNode(ROOT, 'a/f.ts', 0, { reads: 1 }),
      fileNode(ROOT, 'b/f.ts', 0, { reads: 1 }),
      fileNode(ROOT, 'c/f.ts', 0, { reads: 1 }),
    ];
    const hot: FolderScore[] = [
      { folder: 'b', score: 50, recentFiles: [] },
      { folder: 'a', score: 10, recentFiles: [] },
      // c has no entry → score 0
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    expect(floors[0].rooms.map(r => r.name)).toEqual(['b', 'a', 'c']);
  });

  it('breaks a git-score tie alphabetically by absolute id', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'x', 0),
      folderNode(ROOT, 'm', 0),
      fileNode(ROOT, 'x/f.ts', 0, { reads: 1 }),
      fileNode(ROOT, 'm/f.ts', 0, { reads: 1 }),
    ];
    const hot: FolderScore[] = [
      { folder: 'x', score: 5, recentFiles: [] },
      { folder: 'm', score: 5, recentFiles: [] },
    ];
    const floors = buildFloorsByDepth(nodes, hot);
    // Tie: sorted by absolute id → '/proj/m' < '/proj/x'
    expect(floors[0].rooms.map(r => r.name)).toEqual(['m', 'x']);
  });

  // --- multi-floor grouping ---------------------------------------------

  it('groups folders into floors by node.depth; empty-folder floors are omitted', () => {
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'client', 0),              // depth 0, no direct files → hidden
      folderNode(ROOT, 'server', 0),              // depth 0, no direct files → hidden
      folderNode(ROOT, 'client/src', 1),          // depth 1, has file
      folderNode(ROOT, 'server/src', 1),          // depth 1, has file
      folderNode(ROOT, 'client/src/components', 2), // depth 2, has file
      fileNode(ROOT, 'client/src/App.tsx', 1, { reads: 1 }),
      fileNode(ROOT, 'server/src/index.ts', 1, { reads: 1 }),
      fileNode(ROOT, 'client/src/components/Button.tsx', 2, { reads: 1 }),
    ];
    const floors = buildFloorsByDepth(nodes, []);

    // Floor 0: client and server have no direct files → omitted
    expect(floors.find(f => f.floor === 0)).toBeUndefined();

    // Floor 1: two src folders, each with one file
    const floor1 = floors.find(f => f.floor === 1)!;
    expect(floor1).toBeDefined();
    expect(floor1.rooms.map(r => r.name).sort()).toEqual(['src', 'src']);

    // Floor 2: components folder
    const floor2 = floors.find(f => f.floor === 2)!;
    expect(floor2).toBeDefined();
    expect(floor2.rooms.map(r => r.name)).toEqual(['components']);
  });

  // --- floorOfFolder / findFloorForFile behavior unchanged -------------

  it('floorOfFolder is consistent with the depth used for floor assignments', () => {
    // Folder at depth 1 → floor 1; floorOfFolder('client/src') === 1
    expect(floorOfFolder('client/src')).toBe(1);
    expect(findFloorForFile('client/src/App.tsx')).toBe(1);
    // File at root level
    expect(findFloorForFile('README.md')).toBe(0);
  });

  // --- per-floor room sizing: desks must not overflow their room ----------

  it('every desk in a 12-file room stays within room bounds (no overflow)', () => {
    // Build a folder with MAX_FILES_PER_ROOM (12) file nodes.
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'big', 0),
    ];
    for (let i = 1; i <= 12; i++) {
      nodes.push(fileNode(ROOT, `big/file${String(i).padStart(2, '0')}.ts`, 0, { reads: i }));
    }
    const floors = buildFloorsByDepth(nodes, []);
    const floor0 = floors.find(f => f.floor === 0)!;
    expect(floor0).toBeDefined();
    const room = floor0.rooms[0];

    for (const desk of room.files) {
      // Desk tile coords are relative to the grid, room.x and room.y are also in tiles.
      // A desk occupies up to 3 tiles wide and 3 tiles tall (sprite size).
      expect(desk.x).toBeGreaterThanOrEqual(room.x);
      expect(desk.x + 3).toBeLessThanOrEqual(room.x + room.width);
      expect(desk.y).toBeGreaterThanOrEqual(room.y);
      expect(desk.y + 3).toBeLessThanOrEqual(room.y + room.height);
    }
  });

  it('all rooms on a given floor have identical width and height (uniform per floor)', () => {
    // Two folders on the same floor: one with 1 file, one with 8 files.
    // The smaller room must be sized up to match the larger.
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'sparse', 0),
      folderNode(ROOT, 'dense', 0),
      fileNode(ROOT, 'sparse/a.ts', 0, { reads: 1 }),
    ];
    // Add 8 files to 'dense'
    for (let i = 1; i <= 8; i++) {
      nodes.push(fileNode(ROOT, `dense/f${i}.ts`, 0, { reads: i }));
    }
    const floors = buildFloorsByDepth(nodes, []);
    const floor0 = floors.find(f => f.floor === 0)!;
    expect(floor0.rooms.length).toBeGreaterThanOrEqual(2);

    const widths = floor0.rooms.map(r => r.width);
    const heights = floor0.rooms.map(r => r.height);
    // All widths equal
    expect(new Set(widths).size).toBe(1);
    // All heights equal
    expect(new Set(heights).size).toBe(1);
  });

  it('a floor with 12 files has strictly greater room height than a floor with 1 file', () => {
    // depth-0 folder: 1 file → minimal rows/cols → smaller room height
    // depth-1 folder: 12 files → max rows → larger room height
    const nodes: GraphNode[] = [
      rootNode(ROOT),
      folderNode(ROOT, 'small', 0),
      fileNode(ROOT, 'small/one.ts', 0, { reads: 1 }),
      folderNode(ROOT, 'small/sub', 1),
    ];
    for (let i = 1; i <= 12; i++) {
      nodes.push(fileNode(ROOT, `small/sub/f${i}.ts`, 1, { reads: i }));
    }
    const floors = buildFloorsByDepth(nodes, []);
    const floor0 = floors.find(f => f.floor === 0)!;
    const floor1 = floors.find(f => f.floor === 1)!;
    expect(floor0).toBeDefined();
    expect(floor1).toBeDefined();
    expect(floor1.rooms[0].height).toBeGreaterThan(floor0.rooms[0].height);
  });

  it('no two rooms on a floor overlap (including across wrapped rows)', () => {
    // Build 7 folders to force a row wrap (ROOMS_PER_ROW = 6).
    const nodes: GraphNode[] = [rootNode(ROOT)];
    for (let i = 1; i <= 7; i++) {
      nodes.push(folderNode(ROOT, `mod${i}`, 0));
      nodes.push(fileNode(ROOT, `mod${i}/index.ts`, 0, { reads: i }));
    }
    const floors = buildFloorsByDepth(nodes, []);
    const floor0 = floors.find(f => f.floor === 0)!;
    expect(floor0.rooms.length).toBe(7);

    const rooms = floor0.rooms;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        // Rectangles [x, x+width) × [y, y+height) must be disjoint.
        const xOverlap = a.x < b.x + b.width && a.x + a.width > b.x;
        const yOverlap = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(xOverlap && yOverlap).toBe(false);
      }
    }
  });
});
