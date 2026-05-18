// Pure layout engine: groups project folders into hotel floors by path depth.
// Floor N = every folder whose path has N+1 segments (root-level = floor 0).
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

  const scoreOf = new Map<string, number>();
  const recentOf = new Map<string, string[]>();
  for (const h of hotFolders) {
    scoreOf.set(h.folder, h.score);
    recentOf.set(h.folder, h.recentFiles);
  }

  const byFloor = new Map<number, GraphNode[]>();
  for (const f of folders) {
    const floor = floorOfFolder(f.id);
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor)!.push(f);
  }

  const floors: FloorModel[] = [];
  for (const floor of Array.from(byFloor.keys()).sort((a, b) => a - b)) {
    const folderNodes = byFloor.get(floor)!.slice();
    folderNodes.sort((a, b) => {
      const d = (scoreOf.get(b.id) ?? 0) - (scoreOf.get(a.id) ?? 0);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    const rooms: RoomLayout[] = [];
    const filePositions = new Map<string, { x: number; y: number }>();

    folderNodes.forEach((node, idx) => {
      const col = idx % ROOMS_PER_ROW;
      const row = Math.floor(idx / ROOMS_PER_ROW);
      const roomX = 1 + col * (ROOM_WIDTH + ROOM_GAP);
      const roomY = 1 + row * (ROOM_HEIGHT + ROW_GAP);
      const score = scoreOf.get(node.id) ?? 0;
      const recent = recentOf.get(node.id) ?? [];
      const floorStyle: FloorStyle = getFloorStyle(node.name, floor);

      const files: FileLayout[] = [];
      const filesToShow = Math.min(MAX_FILES_PER_ROOM, recent.length);
      const cols = Math.max(1, Math.min(2, filesToShow));
      for (let i = 0; i < filesToShow; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const deskX = roomX + 2 + c * 5;
        const deskY = roomY + 3 + r * 4;
        const fileId = recent[i];
        filePositions.set(fileId, {
          x: deskX * TILE_SIZE + TILE_SIZE * 1.5,
          y: deskY * TILE_SIZE + TILE_SIZE,
        });
        files.push({
          x: deskX, y: deskY,
          name: fileId.split('/').pop() || node.name,
          id: fileId,
          isActive: false, isWriting: false,
          deskStyle: Math.floor(seededRandom(deskX * 53 + deskY * 97 + i * 13) * 3),
          heatLevel: Math.min(1, score / HEAT_DIVISOR),
        });
      }

      filePositions.set(node.id, {
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
