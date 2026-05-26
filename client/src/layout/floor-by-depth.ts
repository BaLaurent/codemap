// Pure layout engine: groups project folders into hotel floors by path depth.
// Floor N = every folder whose server-emitted depth equals N (depth 0 = top-level folder).
// Node ids from the server are ABSOLUTE filesystem paths; hotFolders.folder and
// activity filePaths are PROJECT-RELATIVE. This module converts abs ids to rel paths
// for all score/recent/filePositions lookups.
import { GraphNode, FolderScore } from '../types';
import { RoomLayout, FileLayout, FloorStyle } from '../drawing/types';
import { getFloorStyle, seededRandom, TILE_SIZE } from '../drawing';

// Geometry: rooms laid left-to-right, wrapping into rows.
// ROOM_WIDTH and ROOM_HEIGHT are now derived per-floor from content (see buildFloorsByDepth).
const ROOM_GAP = 1;      // tiles between rooms
const ROOMS_PER_ROW = 6; // wrap after this many rooms
const ROW_GAP = 1;       // tiles between wrapped rows
const MAX_FILES_PER_ROOM = 12;
const HEAT_DIVISOR = 20;

export interface FloorModel {
  floor: number;
  rooms: RoomLayout[];
  filePositions: Map<string, { x: number; y: number }>;
}

// floorOfFolder and findFloorForFile operate on PROJECT-RELATIVE strings.
// HabboRoom calls findFloorForFile with a relative activity path.
// These functions must NOT be changed.

export function floorOfFolder(folderPath: string): number {
  if (folderPath === '' || folderPath === '.') return 0;
  return folderPath.split('/').length - 1;
}

export function findFloorForFile(filePath: string): number {
  const slash = filePath.lastIndexOf('/');
  const folder = slash === -1 ? '' : filePath.substring(0, slash);
  return floorOfFolder(folder);
}

export function buildFloorsByDepth(
  nodes: GraphNode[],
  hotFolders: FolderScore[]
): FloorModel[] {
  const folders = nodes.filter(n => n.isFolder && n.depth >= 0);
  if (folders.length === 0) return [];

  // Find the root node (depth === -1) to derive the absolute prefix for relativization.
  const root = nodes.find(n => n.depth === -1);
  const rootId = root ? root.id : '';

  // Convert an absolute node id to a project-relative path.
  // e.g. '/proj/client/src' → 'client/src', '/proj' → ''
  const toRel = (absId: string): string => {
    if (!rootId) return absId;
    if (absId === rootId) return '';
    return absId.startsWith(rootId + '/') ? absId.slice(rootId.length + 1) : absId;
  };

  // Build score map keyed by project-relative folder path
  // (matching hotFolders.folder which is already project-relative).
  const scoreOf = new Map<string, number>();
  for (const h of hotFolders) {
    scoreOf.set(h.folder, h.score);
  }

  // Build filesByParentRel: map from project-relative parent folder path → file nodes.
  // File nodes have !isFolder and depth >= 0 (exclude root).
  const filesByParentRel = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (n.isFolder || n.depth < 0) continue;
    const relFile = toRel(n.id);
    const lastSlash = relFile.lastIndexOf('/');
    const parentRel = lastSlash === -1 ? '' : relFile.slice(0, lastSlash);
    if (!filesByParentRel.has(parentRel)) filesByParentRel.set(parentRel, []);
    filesByParentRel.get(parentRel)!.push(n);
  }

  // Group folder nodes by their server-emitted depth (which IS the correct
  // relativized floor index: depth 0 = top-level folder = floor 0).
  const byFloor = new Map<number, GraphNode[]>();
  for (const f of folders) {
    const floor = f.depth;
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor)!.push(f);
  }

  const floors: FloorModel[] = [];
  for (const floor of Array.from(byFloor.keys()).sort((a, b) => a - b)) {
    const folderNodes = byFloor.get(floor)!.slice();

    // Sort by git score (desc), then by absolute id as stable tiebreaker.
    folderNodes.sort((a, b) => {
      const relA = toRel(a.id);
      const relB = toRel(b.id);
      const d = (scoreOf.get(relB) ?? 0) - (scoreOf.get(relA) ?? 0);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    // Filter to only folders that have at least one direct file node.
    const nonEmptyFolders = folderNodes.filter(node => {
      const relPath = toRel(node.id);
      const directFiles = filesByParentRel.get(relPath);
      return directFiles !== undefined && directFiles.length > 0;
    });

    // If no folder on this floor has direct files, omit the entire floor.
    if (nonEmptyFolders.length === 0) continue;

    // Compute the floor's uniform room dimensions from the worst-case folder on this floor.
    // This ensures no desk overflows its room regardless of file count.
    let floorMaxCols = 1;
    let floorMaxRows = 1;
    for (const node of nonEmptyFolders) {
      const relPath = toRel(node.id);
      const directFiles = filesByParentRel.get(relPath) ?? [];
      const filesToShow = Math.min(MAX_FILES_PER_ROOM, directFiles.length);
      const cols = Math.max(1, Math.min(2, filesToShow));
      const rows = Math.ceil(filesToShow / cols);
      if (cols > floorMaxCols) floorMaxCols = cols;
      if (rows > floorMaxRows) floorMaxRows = rows;
    }
    // Desk pitch: x-axis 5 tiles, y-axis 4 tiles; +margin/label padding.
    // Width:  last desk x = roomX + 2 + (cols-1)*5; desk ~3 wide → need ≥ cols*5+5; keep ≥13
    // Height: last desk y = roomY + 3 + (rows-1)*4; desk ~3 tall → need ≥ rows*4+5; keep ≥9
    const roomWidth  = Math.max(13, floorMaxCols * 5 + 5);
    const roomHeight = Math.max(9,  floorMaxRows * 4 + 5);

    const rooms: RoomLayout[] = [];
    const filePositions = new Map<string, { x: number; y: number }>();

    nonEmptyFolders.forEach((node, idx) => {
      const relPath = toRel(node.id);

      const col = idx % ROOMS_PER_ROW;
      const row = Math.floor(idx / ROOMS_PER_ROW);
      const roomX = 1 + col * (roomWidth + ROOM_GAP);
      const roomY = 1 + row * (roomHeight + ROW_GAP);
      const floorStyle: FloorStyle = getFloorStyle(node.name, floor);

      // Get direct file nodes for this folder, sort and cap.
      const directFiles = (filesByParentRel.get(relPath) ?? []).slice().sort((a, b) => {
        const actA = a.activityCount.reads + a.activityCount.writes + a.activityCount.searches;
        const actB = b.activityCount.reads + b.activityCount.writes + b.activityCount.searches;
        const d = actB - actA;
        return d !== 0 ? d : a.name.localeCompare(b.name);
      });

      const filesToShow = Math.min(MAX_FILES_PER_ROOM, directFiles.length);
      const cols = Math.max(1, Math.min(2, filesToShow));

      const files: FileLayout[] = [];
      for (let i = 0; i < filesToShow; i++) {
        const fileNode = directFiles[i];
        const c = i % cols;
        const r = Math.floor(i / cols);
        const deskX = roomX + 2 + c * 5;
        const deskY = roomY + 3 + r * 4;
        const fileKey = relPath === '' ? fileNode.name : `${relPath}/${fileNode.name}`;
        const activity = fileNode.activityCount.reads + fileNode.activityCount.writes + fileNode.activityCount.searches;
        filePositions.set(fileKey, {
          x: deskX * TILE_SIZE + TILE_SIZE * 1.5,
          y: deskY * TILE_SIZE + TILE_SIZE,
        });
        files.push({
          x: deskX, y: deskY,
          name: fileNode.name,
          id: fileKey,
          isActive: false, isWriting: false,
          deskStyle: Math.floor(seededRandom(deskX * 53 + deskY * 97 + i * 13) * 3),
          heatLevel: Math.min(1, activity / HEAT_DIVISOR),
        });
      }

      // Register relative folder path as routing key for agents moving to a folder.
      filePositions.set(relPath, {
        x: (roomX + Math.floor(roomWidth / 2)) * TILE_SIZE + TILE_SIZE * 1.5,
        y: (roomY + Math.floor(roomHeight / 2)) * TILE_SIZE + TILE_SIZE,
      });

      rooms.push({
        x: roomX, y: roomY, width: roomWidth, height: roomHeight,
        name: node.name, files, children: [], depth: floor, floorStyle,
      });
    });

    floors.push({ floor, rooms, filePositions });
  }

  return floors;
}

// Distinct floor depths present in a built layout, sorted ascending.
// The floor module owns "which floors exist"; the navigation bar consumes
// this to decide which up/down steps are available.
export function floorNumbers(floors: FloorModel[]): number[] {
  return [...new Set(floors.map(f => f.floor))].sort((a, b) => a - b);
}
