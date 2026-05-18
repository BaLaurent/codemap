// Pure layout engine: groups project folders into hotel floors by path depth.
// Floor N = every folder whose server-emitted depth equals N (depth 0 = top-level folder).
// Node ids from the server are ABSOLUTE filesystem paths; hotFolders.folder and
// activity filePaths are PROJECT-RELATIVE. This module converts abs ids to rel paths
// for all score/recent/filePositions lookups.
import { GraphNode, FolderScore } from '../types';
import { RoomLayout, FileLayout, FloorStyle } from '../drawing/types';
import { getFloorStyle, seededRandom, TILE_SIZE } from '../drawing';

// Geometry: rooms laid left-to-right, wrapping into rows.
const ROOM_WIDTH = 13;   // tiles
const ROOM_HEIGHT = 9;   // tiles
const ROOM_GAP = 1;      // tiles between rooms
const ROOMS_PER_ROW = 6; // wrap after this many rooms
const ROW_GAP = 1;       // tiles between wrapped rows
const MAX_FILES_PER_ROOM = 4;
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

  // Build score/recent maps keyed by project-relative folder path
  // (matching hotFolders.folder which is already project-relative).
  const scoreOf = new Map<string, number>();
  const recentOf = new Map<string, string[]>();
  for (const h of hotFolders) {
    scoreOf.set(h.folder, h.score);
    recentOf.set(h.folder, h.recentFiles);
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

    const rooms: RoomLayout[] = [];
    const filePositions = new Map<string, { x: number; y: number }>();

    folderNodes.forEach((node, idx) => {
      const relPath = toRel(node.id);

      const col = idx % ROOMS_PER_ROW;
      const row = Math.floor(idx / ROOMS_PER_ROW);
      const roomX = 1 + col * (ROOM_WIDTH + ROOM_GAP);
      const roomY = 1 + row * (ROOM_HEIGHT + ROW_GAP);
      const score = scoreOf.get(relPath) ?? 0;
      // recentFiles are bare BASENAMES (path.basename) as emitted by git-activity.ts.
      const recent = recentOf.get(relPath) ?? [];
      const floorStyle: FloorStyle = getFloorStyle(node.name, floor);

      const files: FileLayout[] = [];
      const filesToShow = Math.min(MAX_FILES_PER_ROOM, recent.length);
      const cols = Math.max(1, Math.min(2, filesToShow));
      for (let i = 0; i < filesToShow; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const deskX = roomX + 2 + c * 5;
        const deskY = roomY + 3 + r * 4;
        // Basename from git-activity; join with relPath to get the full relative file path.
        const basename = recent[i];
        const fileKey = relPath === '' ? basename : `${relPath}/${basename}`;
        filePositions.set(fileKey, {
          x: deskX * TILE_SIZE + TILE_SIZE * 1.5,
          y: deskY * TILE_SIZE + TILE_SIZE,
        });
        files.push({
          x: deskX, y: deskY,
          name: basename,
          id: fileKey,
          isActive: false, isWriting: false,
          deskStyle: Math.floor(seededRandom(deskX * 53 + deskY * 97 + i * 13) * 3),
          heatLevel: Math.min(1, score / HEAT_DIVISOR),
        });
      }

      // Register relative folder path as routing key for agents moving to a folder.
      filePositions.set(relPath, {
        x: (roomX + Math.floor(ROOM_WIDTH / 2)) * TILE_SIZE + TILE_SIZE * 1.5,
        y: (roomY + Math.floor(ROOM_HEIGHT / 2)) * TILE_SIZE + TILE_SIZE,
      });

      rooms.push({
        x: roomX, y: roomY, width: ROOM_WIDTH, height: ROOM_HEIGHT,
        name: node.name, files, children: [], depth: floor, floorStyle,
      });
    });

    floors.push({ floor, rooms, filePositions });
  }

  return floors;
}
