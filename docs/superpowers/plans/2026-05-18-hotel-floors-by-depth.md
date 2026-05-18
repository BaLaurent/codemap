# Hotel Floors By Depth + Interactive Tree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire que les étages de l'hôtel correspondent à la profondeur des dossiers (un seul étage affiché à la fois, suivi de l'agent focus), et rendre la vue Tree interactive (zoom, pan, repli/dépli).

**Architecture :** Option B — deux modules purs extraits (`floor-by-depth.ts`, `useFloorNavigation.ts`) + un composant DOM léger (`FloorNavBar.tsx`) consommés par `HabboRoom`. La vue Tree extrait son algo de layout dans un module pur testable puis ajoute zoom/pan/fold. `HabboRoom` garde son pattern "no state, refs only" pour la boucle d'animation ; le hook de navigation expose à la fois un `useState` (pour la nav bar DOM) et un `useRef` miroir (pour la boucle canvas).

**Tech Stack :** React 18 (refs + canvas), TypeScript, Vitest.

**Découpage :** Deux workstreams **indépendants** (fichiers disjoints, parallélisables) :
- **Partie A** — Étages par profondeur (`Task A1 → A5`). Touche `client/src/layout/floor-by-depth.ts`, `client/src/hooks/useFloorNavigation.ts`, `client/src/components/FloorNavBar.tsx`, `client/src/components/HabboRoom.tsx`, et supprime le code mort.
- **Partie B** — Tree interactive (`Task B1 → B3`). Touche `client/src/layout/tree-layout.ts` et `client/src/components/FileGraph.tsx`.

Un agent peut exécuter A ou B sans lire l'autre. Ne pas entrelacer l'ordre des tâches.

---

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `client/src/layout/floor-by-depth.ts` | créer | Fonction pure : arbre + scores git → `FloorModel[]` indexés par profondeur |
| `client/src/layout/floor-by-depth.test.ts` | créer | Tests du module ci-dessus |
| `client/src/hooks/useFloorNavigation.ts` | créer | Hook : machine à états (focus agent, suivi auto, sélection manuelle) + reducer pur exporté |
| `client/src/hooks/useFloorNavigation.test.ts` | créer | Tests du reducer pur |
| `client/src/components/FloorNavBar.tsx` | créer | UI DOM : boutons agent, sélecteur d'étage, badges |
| `client/src/components/HabboRoom.tsx` | modifier | Remplace la layout pyramide ; ne rend qu'un étage ; monte la nav bar |
| `client/src/layout/multi-floor.ts` | supprimer | Code mort (jamais monté dans `App.tsx`) |
| `client/src/components/MultiFloorHotel.tsx` | supprimer | Code mort (jamais monté dans `App.tsx`) |
| `client/src/layout/tree-layout.ts` | créer | Algo de layout d'arbre pur + pruning des dossiers repliés |
| `client/src/layout/tree-layout.test.ts` | créer | Tests du layout d'arbre |
| `client/src/components/FileGraph.tsx` | modifier | Zoom/pan + clic repli/dépli, consomme `tree-layout.ts` |

### Types partagés (définis Task A1, réutilisés ensuite)

```typescript
// floor-by-depth.ts
export interface FloorModel {
  floor: number;                                  // profondeur (0 = dossiers racine)
  rooms: RoomLayout[];                             // chambres-dossiers de cet étage
  filePositions: Map<string, { x: number; y: number }>; // fileId -> position pixel
}
```

```typescript
// useFloorNavigation.ts
export interface NavState {
  currentFloorIndex: number;
  focusAgentId: string | null;
  follow: boolean;
}
export type NavAction =
  | { kind: 'agentActivity'; agentId: string; floor: number }
  | { kind: 'selectAgent'; agentId: string }
  | { kind: 'selectFloor'; floor: number }
  | { kind: 'removeAgent'; agentId: string };
```

---

# PARTIE A — Étages par profondeur

## Task A1 : Module pur `floor-by-depth.ts`

**Files:**
- Create: `client/src/layout/floor-by-depth.ts`
- Test: `client/src/layout/floor-by-depth.test.ts`

Contexte : `GraphNode` (voir `client/src/types.ts`) possède déjà `id` (chemin relatif, ex. `client/src/components`), `name`, `isFolder`, `depth`. Le nœud racine a `depth === -1`. `FolderScore` (`client/src/types.ts`) = `{ folder, score, recentFiles }`. `RoomLayout`, `FileLayout`, `FloorStyle` viennent de `../drawing` ; `getFloorStyle(name, depth)` et `seededRandom(n)` aussi ; `TILE_SIZE` aussi.

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/layout/floor-by-depth.test.ts
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
    expect(floors[1].rooms.map(r => r.name).sort()).toEqual(['client', 'server']); // basenames
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

  it('returns [] for an empty tree', () => {
    expect(buildFloorsByDepth([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/layout/floor-by-depth.test.ts`
Expected: FAIL — `Failed to resolve import "./floor-by-depth"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// client/src/layout/floor-by-depth.ts
// Pure layout engine: groups project folders into hotel floors by path depth.
// Floor N = every folder whose path has N+1 segments (root-level = floor 0).
import { GraphNode, FolderScore } from '../types';
import { RoomLayout, FileLayout, FloorStyle } from '../drawing/types';
import { getFloorStyle, seededRandom } from '../drawing';
import { TILE_SIZE } from '../drawing';

// Geometry: rooms laid left-to-right, wrapping into rows.
const ROOM_WIDTH = 13;   // tiles
const ROOM_HEIGHT = 9;   // tiles
const ROOM_GAP = 1;      // tiles between rooms
const ROOMS_PER_ROW = 6; // wrap after this many rooms
const ROW_GAP = 1;       // tiles between wrapped rows

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

  // Group folders by depth.
  const byFloor = new Map<number, GraphNode[]>();
  for (const f of folders) {
    const floor = floorOfFolder(f.id);
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    byFloor.get(floor)!.push(f);
  }

  const floors: FloorModel[] = [];
  for (const floor of Array.from(byFloor.keys()).sort((a, b) => a - b)) {
    const folderNodes = byFloor.get(floor)!.slice();
    // Order by git score (hottest first), then alphabetically for stability.
    folderNodes.sort((a, b) => {
      const d = (scoreOf.get(b.id) || 0) - (scoreOf.get(a.id) || 0);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    const rooms: RoomLayout[] = [];
    const filePositions = new Map<string, { x: number; y: number }>();

    folderNodes.forEach((node, idx) => {
      const col = idx % ROOMS_PER_ROW;
      const row = Math.floor(idx / ROOMS_PER_ROW);
      const roomX = 1 + col * (ROOM_WIDTH + ROOM_GAP);
      const roomY = 1 + row * (ROOM_HEIGHT + ROW_GAP);
      const score = scoreOf.get(node.id) || 0;
      const recent = recentOf.get(node.id) || [];
      const floorStyle: FloorStyle = getFloorStyle(node.name, floor);

      const files: FileLayout[] = [];
      const maxFiles = 4;
      const filesToShow = Math.min(maxFiles, recent.length || 1);
      const cols = Math.min(2, filesToShow);
      for (let i = 0; i < filesToShow; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const deskX = roomX + 2 + c * 5;
        const deskY = roomY + 3 + r * 4;
        const fileId = recent[i] || node.id;
        filePositions.set(fileId, {
          x: deskX * TILE_SIZE + TILE_SIZE * 1.5,
          y: deskY * TILE_SIZE + TILE_SIZE,
        });
        files.push({
          x: deskX, y: deskY,
          name: (recent[i] || node.name).split('/').pop() || node.name,
          id: fileId,
          isActive: false, isWriting: false,
          deskStyle: Math.floor(seededRandom(deskX * 53 + deskY * 97 + i * 13) * 3),
          heatLevel: Math.min(1, score / 20),
        });
      }

      // Folder itself routable for agent movement.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/layout/floor-by-depth.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add client/src/layout/floor-by-depth.ts client/src/layout/floor-by-depth.test.ts
git commit -m "feat(hotel): pure floor-by-depth layout module"
```

---

## Task A2 : Hook `useFloorNavigation` + reducer pur

**Files:**
- Create: `client/src/hooks/useFloorNavigation.ts`
- Test: `client/src/hooks/useFloorNavigation.test.ts`

Le cœur testable est le reducer pur `reduceNav`. Le hook est une fine enveloppe React qui maintient `useState` (pour la nav bar DOM) + un `useRef` miroir (lu par la boucle canvas, sans closure périmée).

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/hooks/useFloorNavigation.test.ts
import { describe, it, expect } from 'vitest';
import { reduceNav, NavState } from './useFloorNavigation';

const base: NavState = { currentFloorIndex: 0, focusAgentId: null, follow: true };

describe('reduceNav', () => {
  it('first agent activity becomes focus and follows its floor', () => {
    const next = reduceNav(base, { kind: 'agentActivity', agentId: 'a', floor: 2 }, new Map([['a', 2]]));
    expect(next.focusAgentId).toBe('a');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(2);
  });

  it('follows the focus agent when it moves floor', () => {
    const s: NavState = { currentFloorIndex: 2, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'agentActivity', agentId: 'a', floor: 4 }, new Map([['a', 4]]));
    expect(next.currentFloorIndex).toBe(4);
  });

  it('ignores a non-focus agent activity while following', () => {
    const s: NavState = { currentFloorIndex: 2, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'agentActivity', agentId: 'b', floor: 7 }, new Map([['a', 2], ['b', 7]]));
    expect(next.currentFloorIndex).toBe(2);
  });

  it('manual floor selection pauses follow', () => {
    const s: NavState = { currentFloorIndex: 2, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'selectFloor', floor: 5 }, new Map([['a', 2]]));
    expect(next.currentFloorIndex).toBe(5);
    expect(next.follow).toBe(false);
  });

  it('does not auto-move while follow is paused', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: false };
    const next = reduceNav(s, { kind: 'agentActivity', agentId: 'a', floor: 1 }, new Map([['a', 1]]));
    expect(next.currentFloorIndex).toBe(5);
    expect(next.follow).toBe(false);
  });

  it('selecting an agent re-enables follow and jumps to its floor', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: false };
    const next = reduceNav(s, { kind: 'selectAgent', agentId: 'b' }, new Map([['a', 5], ['b', 3]]));
    expect(next.focusAgentId).toBe('b');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(3);
  });

  it('removing focus agent falls back to first remaining active agent', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'removeAgent', agentId: 'a' }, new Map([['b', 8]]));
    expect(next.focusAgentId).toBe('b');
    expect(next.follow).toBe(true);
    expect(next.currentFloorIndex).toBe(8);
  });

  it('removing the last agent keeps the floor and stops following', () => {
    const s: NavState = { currentFloorIndex: 5, focusAgentId: 'a', follow: true };
    const next = reduceNav(s, { kind: 'removeAgent', agentId: 'a' }, new Map());
    expect(next.focusAgentId).toBeNull();
    expect(next.follow).toBe(false);
    expect(next.currentFloorIndex).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/useFloorNavigation.test.ts`
Expected: FAIL — `Failed to resolve import "./useFloorNavigation"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// client/src/hooks/useFloorNavigation.ts
// Floor navigation state machine. reduceNav is the pure, testable core.
// The hook exposes useState (for the DOM nav bar) + a ref mirror (for the
// canvas animation loop, which must not capture stale state).
import { useState, useRef, useCallback, MutableRefObject } from 'react';

export interface NavState {
  currentFloorIndex: number;
  focusAgentId: string | null;
  follow: boolean;
}

export type NavAction =
  | { kind: 'agentActivity'; agentId: string; floor: number }
  | { kind: 'selectAgent'; agentId: string }
  | { kind: 'selectFloor'; floor: number }
  | { kind: 'removeAgent'; agentId: string };

// agentFloors: agentId -> floor of that agent's current file (post-update).
export function reduceNav(
  state: NavState,
  action: NavAction,
  agentFloors: Map<string, number>
): NavState {
  switch (action.kind) {
    case 'agentActivity': {
      if (state.focusAgentId === null) {
        return { currentFloorIndex: action.floor, focusAgentId: action.agentId, follow: true };
      }
      if (state.follow && action.agentId === state.focusAgentId) {
        return { ...state, currentFloorIndex: action.floor };
      }
      return state;
    }
    case 'selectAgent': {
      const floor = agentFloors.get(action.agentId);
      return {
        focusAgentId: action.agentId,
        follow: true,
        currentFloorIndex: floor ?? state.currentFloorIndex,
      };
    }
    case 'selectFloor':
      return { ...state, currentFloorIndex: action.floor, follow: false };
    case 'removeAgent': {
      if (action.agentId !== state.focusAgentId) return state;
      const remaining = Array.from(agentFloors.keys());
      if (remaining.length === 0) {
        return { ...state, focusAgentId: null, follow: false };
      }
      const next = remaining[0];
      return {
        focusAgentId: next,
        follow: true,
        currentFloorIndex: agentFloors.get(next) ?? state.currentFloorIndex,
      };
    }
  }
}

export interface FloorNavigation {
  state: NavState;
  snapshotRef: MutableRefObject<NavState>;
  agentFloorsRef: MutableRefObject<Map<string, number>>;
  noteAgentActivity: (agentId: string, floor: number) => void;
  selectAgent: (agentId: string) => void;
  cycleAgent: (dir: 1 | -1) => void;
  selectFloor: (floor: number) => void;
  removeAgent: (agentId: string) => void;
}

export function useFloorNavigation(): FloorNavigation {
  const [state, setState] = useState<NavState>({
    currentFloorIndex: 0, focusAgentId: null, follow: true,
  });
  const snapshotRef = useRef<NavState>(state);
  const agentFloorsRef = useRef<Map<string, number>>(new Map());

  const dispatch = useCallback((action: NavAction) => {
    setState(prev => {
      const next = reduceNav(prev, action, agentFloorsRef.current);
      snapshotRef.current = next;
      return next;
    });
  }, []);

  const noteAgentActivity = useCallback((agentId: string, floor: number) => {
    agentFloorsRef.current.set(agentId, floor);
    dispatch({ kind: 'agentActivity', agentId, floor });
  }, [dispatch]);

  const selectAgent = useCallback((agentId: string) => {
    dispatch({ kind: 'selectAgent', agentId });
  }, [dispatch]);

  const cycleAgent = useCallback((dir: 1 | -1) => {
    const ids = Array.from(agentFloorsRef.current.keys());
    if (ids.length === 0) return;
    const cur = snapshotRef.current.focusAgentId;
    const i = cur ? ids.indexOf(cur) : -1;
    const nextId = ids[(i + dir + ids.length) % ids.length];
    dispatch({ kind: 'selectAgent', agentId: nextId });
  }, [dispatch]);

  const selectFloor = useCallback((floor: number) => {
    dispatch({ kind: 'selectFloor', floor });
  }, [dispatch]);

  const removeAgent = useCallback((agentId: string) => {
    agentFloorsRef.current.delete(agentId);
    dispatch({ kind: 'removeAgent', agentId });
  }, [dispatch]);

  return {
    state, snapshotRef, agentFloorsRef,
    noteAgentActivity, selectAgent, cycleAgent, selectFloor, removeAgent,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/useFloorNavigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useFloorNavigation.ts client/src/hooks/useFloorNavigation.test.ts
git commit -m "feat(hotel): floor navigation state machine"
```

---

## Task A3 : Composant `FloorNavBar`

**Files:**
- Create: `client/src/components/FloorNavBar.tsx`

DOM pur (pas de canvas), style aligné sur `ActivityLegend` (`rgba(17,24,39,0.9)`, `borderRadius`, `#e5e7eb`).

- [ ] **Step 1: Write the component**

```tsx
// client/src/components/FloorNavBar.tsx
// DOM navigation bar for the single-floor hotel view.
interface FloorNavBarProps {
  currentFloor: number;
  maxFloor: number;
  follow: boolean;
  focusAgentId: string | null;
  agentsElsewhere: { agentId: string; name: string; floor: number }[];
  onCycleAgent: (dir: 1 | -1) => void;
  onSelectFloor: (floor: number) => void;
  onSelectAgent: (agentId: string) => void;
}

const panel: React.CSSProperties = {
  position: 'absolute', top: 16, left: 16, zIndex: 20,
  display: 'flex', alignItems: 'center', gap: 12,
  backgroundColor: 'rgba(17, 24, 39, 0.9)',
  padding: '10px 16px', borderRadius: '12px',
  color: '#e5e7eb', fontSize: '13px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(8px)',
};

const btn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#e5e7eb', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
  fontSize: 13,
};

export function FloorNavBar({
  currentFloor, maxFloor, follow, focusAgentId, agentsElsewhere,
  onCycleAgent, onSelectFloor, onSelectAgent,
}: FloorNavBarProps) {
  return (
    <div style={panel}>
      <button style={btn} onClick={() => onCycleAgent(-1)} title="Previous agent">◀</button>
      <span style={{ fontWeight: 600 }}>
        {focusAgentId ? `Agent ${focusAgentId.slice(0, 6)}` : 'No agent'}
      </span>
      <button style={btn} onClick={() => onCycleAgent(1)} title="Next agent">▶</button>

      <span style={{ opacity: 0.4 }}>|</span>

      <button
        style={btn}
        onClick={() => onSelectFloor(Math.max(0, currentFloor - 1))}
        disabled={currentFloor <= 0}
        title="Floor down"
      >▼</button>
      <span style={{ fontWeight: 600, color: follow ? '#34d399' : '#fbbf24' }}>
        Floor {currentFloor}{follow ? '' : ' (manual)'}
      </span>
      <button
        style={btn}
        onClick={() => onSelectFloor(Math.min(maxFloor, currentFloor + 1))}
        disabled={currentFloor >= maxFloor}
        title="Floor up"
      >▲</button>

      {agentsElsewhere.map(a => (
        <button
          key={a.agentId}
          style={{ ...btn, background: 'rgba(59,130,246,0.25)' }}
          onClick={() => onSelectAgent(a.agentId)}
          title="Jump to this agent"
        >
          {a.name} · floor {a.floor} ▸
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks / builds**

Run: `cd client && npx tsc --noEmit`
Expected: no errors referencing `FloorNavBar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FloorNavBar.tsx
git commit -m "feat(hotel): floor navigation bar component"
```

---

## Task A4a : `HabboRoom` — remplacer le builder de layout (refacto pur, pas de gating)

**Files:**
- Modify: `client/src/components/HabboRoom.tsx`

Objectif : remplacer `buildLayout` (la fonction `const buildLayout = (nodes: GraphNode[]): RoomLayout | null => { ... }`, ~lignes 103-230+) par un appel à `buildFloorsByDepth`, en gardant le rendu de **tous** les étages comme avant (aucun changement visible). On stocke les `FloorModel[]` dans un ref.

- [ ] **Step 1: Add the import and a floors ref**

Ajouter à la fin du bloc d'imports `from '../drawing'` (après ligne 44) :

```typescript
import { buildFloorsByDepth, FloorModel } from '../layout/floor-by-depth';
```

Ajouter près des autres refs (après `hotFoldersRef`, ligne 73) :

```typescript
  const floorsRef = useRef<FloorModel[]>([]);
```

- [ ] **Step 2: Replace `buildLayout` body to build from depth floors**

Remplacer toute la fonction `buildLayout` (de `const buildLayout = (nodes: GraphNode[]): RoomLayout | null => {` jusqu'à son `};` final) par :

```typescript
  // Build floors by folder depth. Returns a single RoomLayout wrapping the
  // rooms of ALL floors (gating to one floor happens in Task A4c).
  const buildLayout = (nodes: GraphNode[]): RoomLayout | null => {
    const floors = buildFloorsByDepth(nodes, hotFoldersRef.current);
    floorsRef.current = floors;
    if (floors.length === 0) return null;

    const root = nodes.find(n => n.depth === -1);
    const rootName = root?.name || 'Project';

    filePositionsRef.current.clear();
    const children: RoomLayout[] = [];
    let stackY = 1;
    let maxWidth = 1;

    for (const fm of floors) {
      for (const [id, pos] of fm.filePositions) {
        filePositionsRef.current.set(id, { x: pos.x, y: pos.y + stackY * TILE_SIZE });
      }
      let floorBottom = 0;
      for (const room of fm.rooms) {
        children.push({ ...room, y: room.y + stackY });
        floorBottom = Math.max(floorBottom, room.y + room.height);
        maxWidth = Math.max(maxWidth, room.x + room.width);
      }
      stackY += floorBottom + 2;
    }

    return {
      x: 1, y: 1, width: maxWidth + 1, height: stackY,
      name: rootName, files: [], children, depth: 0, floorStyle: 'wood',
    };
  };
```

- [ ] **Step 3: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS (movement / screen-flash / integration tests still green — file matching is by id, geometry change is internal).

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev` (depuis la racine), ouvrir `http://localhost:5173/hotel`.
Expected: l'hôtel s'affiche avec des chambres empilées par étage (toutes visibles), pas de crash console.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/HabboRoom.tsx
git commit -m "refactor(hotel): build layout from floor-by-depth (all floors)"
```

---

## Task A4b : `HabboRoom` — monter `useFloorNavigation` + `FloorNavBar`, câbler l'activité

**Files:**
- Modify: `client/src/components/HabboRoom.tsx`

Pas encore de gating du rendu. On monte la nav bar et on alimente `noteAgentActivity` depuis le handler d'activité existant.

- [ ] **Step 1: Imports + hook**

Ajouter aux imports :

```typescript
import { useFloorNavigation } from '../hooks/useFloorNavigation';
import { FloorNavBar } from './FloorNavBar';
import { findFloorForFile } from '../layout/floor-by-depth';
```

Dans le composant, juste après le bloc `useFileActivity()` (après ligne 56) :

```typescript
  const nav = useFloorNavigation();
```

- [ ] **Step 2: Feed agent activity into the nav state machine**

Localiser dans la boucle d'animation l'endroit où `lastActivityByAgentRef` est mis à jour (chercher `lastActivityByAgentRef.current.set`). Juste après cette ligne, ajouter :

```typescript
        nav.noteAgentActivity(agentId, findFloorForFile(filePath));
```

(Adapter `agentId` / `filePath` aux variables locales du scope ; ce sont celles déjà utilisées pour `lastActivityByAgentRef.current.set(agentId, { filePath, timestamp })`.)

- [ ] **Step 3: Remove an agent from nav when it is pruned**

Chercher l'endroit où un agent est supprimé après la grâce de 30 s (`agentCharactersRef.current.delete`). Juste après, ajouter :

```typescript
          nav.removeAgent(removedAgentId);
```

(`removedAgentId` = la clé utilisée dans le `.delete(...)`.)

- [ ] **Step 4: Render the nav bar**

Dans le `return ( ... )` du composant, à l'intérieur du conteneur racine et avant la balise `<canvas`, insérer :

```tsx
      <FloorNavBar
        currentFloor={nav.state.currentFloorIndex}
        maxFloor={Math.max(0, floorsRef.current.length - 1)}
        follow={nav.state.follow}
        focusAgentId={nav.state.focusAgentId}
        agentsElsewhere={Array.from(nav.agentFloorsRef.current.entries())
          .filter(([, f]) => f !== nav.state.currentFloorIndex)
          .map(([agentId, floor]) => ({ agentId, name: `Agent ${agentId.slice(0, 6)}`, floor }))}
        onCycleAgent={nav.cycleAgent}
        onSelectFloor={nav.selectFloor}
        onSelectAgent={nav.selectAgent}
      />
```

- [ ] **Step 5: Build + smoke check**

Run: `cd client && npx tsc --noEmit && npm test`
Expected: no type errors; tests PASS.
Manuel : `http://localhost:5173/hotel` — la nav bar apparaît en haut à gauche ; cliquer ▲/▼ change le numéro affiché et passe en "(manual)". Le canvas montre encore tous les étages (gating en A4c).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/HabboRoom.tsx
git commit -m "feat(hotel): mount floor navigation bar and feed agent activity"
```

---

## Task A4c : `HabboRoom` — ne rendre QUE l'étage courant

**Files:**
- Modify: `client/src/components/HabboRoom.tsx`

Changement de comportement visible : on ne construit la layout que pour `floorsRef.current[currentFloorIndex]`, et on ne dessine les agents que s'ils sont sur cet étage.

- [ ] **Step 1: Restrict the layout to the current floor**

Dans `buildLayout` (modifié en A4a), remplacer la boucle `for (const fm of floors) { ... }` par le rendu d'un seul étage :

```typescript
    const idx = Math.min(nav.snapshotRef.current.currentFloorIndex, floors.length - 1);
    const fm = floors[Math.max(0, idx)];
    filePositionsRef.current.clear();
    const children: RoomLayout[] = [];
    let maxWidth = 1, maxHeight = 1;
    for (const [id, pos] of fm.filePositions) {
      filePositionsRef.current.set(id, pos);
    }
    for (const room of fm.rooms) {
      children.push(room);
      maxWidth = Math.max(maxWidth, room.x + room.width);
      maxHeight = Math.max(maxHeight, room.y + room.height);
    }
    return {
      x: 1, y: 1, width: maxWidth + 1, height: maxHeight + 1,
      name: rootName, files: [], children, depth: 0, floorStyle: 'wood',
    };
```

(Supprimer les variables `stackY` devenues inutiles.)

- [ ] **Step 2: Rebuild layout when the floor changes**

Localiser le bloc de la boucle qui décide de recalculer la layout (chercher `layoutInitializedRef` / `lastNodeCountRef` / `buildLayout(`). Ajouter une condition de rebuild quand l'étage change : déclarer près des autres refs

```typescript
  const lastRenderedFloorRef = useRef(-1);
```

et dans la boucle, avant l'appel à `buildLayout`, forcer le recalcul si `nav.snapshotRef.current.currentFloorIndex !== lastRenderedFloorRef.current` (mettre à jour `lastRenderedFloorRef.current` après le rebuild). Réutiliser le chemin de rebuild existant (le même que lors d'un changement de `nodeCount`).

- [ ] **Step 3: Only draw agents on the current floor**

Localiser la boucle de dessin des agents (chercher `drawAgentCharacter(`). Juste avant l'appel `drawAgentCharacter`, ajouter un garde :

```typescript
        const agentFloor = nav.agentFloorsRef.current.get(agent.agentId);
        if (agentFloor !== undefined && agentFloor !== nav.snapshotRef.current.currentFloorIndex) {
          continue; // agent works on another floor — hidden until we go there
        }
```

(Adapter `agent.agentId` au nom de variable de l'agent dans la boucle.)

- [ ] **Step 4: Run tests + smoke check**

Run: `cd client && npm test`
Expected: PASS.
Manuel : `http://localhost:5173/hotel` — un seul étage visible. Déclencher de l'activité (`npm run dev` + un agent qui lit/écrit, ou `curl` sur `/api/activity` puis `/api/thinking`) : l'étage suit l'agent. ▲/▼ fige l'étage (manual) ; ◀/▶ resélectionne un agent et reprend le suivi.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/HabboRoom.tsx
git commit -m "feat(hotel): render only the current floor and its agents"
```

---

## Task A5 : Supprimer le code mort

**Files:**
- Delete: `client/src/layout/multi-floor.ts`
- Delete: `client/src/components/MultiFloorHotel.tsx`

- [ ] **Step 1: Verify nothing imports them**

Run: `rg -n "multi-floor|MultiFloorHotel" client/src --glob '!*.test.*'`
Expected: aucune occurrence en dehors des deux fichiers eux-mêmes. (S'il existe un `multi-floor.test.ts`, le supprimer aussi.)

- [ ] **Step 2: Delete and verify build**

```bash
git rm client/src/layout/multi-floor.ts client/src/components/MultiFloorHotel.tsx
cd client && npx tsc --noEmit && npm test
```
Expected: no type errors; tests PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dead multi-floor.ts and MultiFloorHotel.tsx"
```

---

# PARTIE B — Tree interactive

## Task B1 : Extraire `tree-layout.ts` avec pruning des dossiers repliés

**Files:**
- Create: `client/src/layout/tree-layout.ts`
- Create: `client/src/layout/tree-layout.test.ts`
- Modify: `client/src/components/FileGraph.tsx`

On déplace `calculateTreeLayout` (FileGraph.tsx ~lignes 388-468) et l'interface locale `LayoutNode` dans un module pur, en ajoutant un paramètre `collapsed: Set<string>` qui élague les sous-arbres et annote le compte caché.

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/layout/tree-layout.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/layout/tree-layout.test.ts`
Expected: FAIL — `Failed to resolve import "./tree-layout"`.

- [ ] **Step 3: Write the module (moved + collapse param)**

```typescript
// client/src/layout/tree-layout.ts
// Pure recursive tree layout. `collapsed` holds folder ids whose subtrees are
// hidden; a collapsed folder gets `collapsedCount` = number of hidden descendants.
import { GraphNode } from '../types';

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  collapsedCount?: number;
}

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
  const nodeSpacingX = 180;
  const nodeSpacingY = 50;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/layout/tree-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace FileGraph's local copy with the module**

Dans `client/src/components/FileGraph.tsx` :
- Supprimer l'interface locale `interface LayoutNode extends GraphNode { x: number; y: number; }`.
- Supprimer la fonction locale `function calculateTreeLayout(...)` (≈ lignes 388-468) ET la fonction `interpolateColor` reste inchangée.
- Ajouter en tête : `import { calculateTreeLayout, LayoutNode } from '../layout/tree-layout';`
- À l'appel existant `calculateTreeLayout(currentGraphData.nodes)`, passer un second argument : `calculateTreeLayout(currentGraphData.nodes, collapsedFoldersRef.current)`.
- Déclarer le ref près des autres : `const collapsedFoldersRef = useRef<Set<string>>(new Set());`

- [ ] **Step 6: Build + test**

Run: `cd client && npx tsc --noEmit && npm test`
Expected: no type errors; tests PASS; la Tree s'affiche comme avant (`http://localhost:5173/`).

- [ ] **Step 7: Commit**

```bash
git add client/src/layout/tree-layout.ts client/src/layout/tree-layout.test.ts client/src/components/FileGraph.tsx
git commit -m "refactor(tree): extract pure tree-layout module with collapse pruning"
```

---

## Task B2 : Zoom (molette) + pan (drag) sur FileGraph

**Files:**
- Modify: `client/src/components/FileGraph.tsx`

Le matching d'activité est par `id`, pas par coordonnées → zoom/pan n'affecte rien d'autre. On compose la transform existante (`scale`, `offsetX/Y`) avec un zoom utilisateur et un pan.

- [ ] **Step 1: Add interaction refs**

Près des autres refs :

```typescript
  const userZoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastDragRef = useRef({ x: 0, y: 0 });
```

- [ ] **Step 2: Compose user zoom/pan into the transform**

Dans `draw()`, après le calcul de `scale`, `offsetX`, `offsetY`, remplacer la définition de `transform` par :

```typescript
    const z = userZoomRef.current;
    const px = panRef.current.x;
    const py = panRef.current.y;
    const transform = (x: number, y: number) => ({
      x: (x * scale + offsetX) * z + px,
      y: (y * scale + offsetY) * z + py,
    });
```

- [ ] **Step 3: Attach wheel + drag handlers**

Dans le `useEffect` qui possède le `canvas`, après `const ctx = canvas.getContext('2d');`, ajouter :

```typescript
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      userZoomRef.current = Math.max(0.2, Math.min(5, userZoomRef.current * factor));
    };
    const onDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastDragRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      panRef.current = {
        x: panRef.current.x + (e.clientX - lastDragRef.current.x),
        y: panRef.current.y + (e.clientY - lastDragRef.current.y),
      };
      lastDragRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { isDraggingRef.current = false; };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
```

Et dans la fonction de cleanup retournée par ce `useEffect` (à côté de `cancelAnimationFrame`), ajouter :

```typescript
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
```

- [ ] **Step 4: Build + manual check**

Run: `cd client && npx tsc --noEmit && npm test`
Expected: no type errors; tests PASS.
Manuel `http://localhost:5173/` : molette = zoom centré écran, drag = déplacement. L'activité (flash lecture/écriture) fonctionne toujours.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FileGraph.tsx
git commit -m "feat(tree): wheel zoom and drag pan"
```

---

## Task B3 : Clic sur dossier = repli/dépli + compteur `+N`

**Files:**
- Modify: `client/src/components/FileGraph.tsx`

- [ ] **Step 1: Add a click handler that toggles the nearest folder node**

Dans le même `useEffect`, après les handlers de B2, ajouter (la closure a accès à `layoutNodesRef`, `scale`/`offset` ne sont pas en scope ici → on retrouve le nœud cliqué via la dernière transform stockée). Déclarer près des refs : `const lastTransformRef = useRef<(x:number,y:number)=>{x:number;y:number}>((x,y)=>({x,y}));` et dans `draw()`, juste après la définition de `transform`, ajouter `lastTransformRef.current = transform;`. Puis :

```typescript
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      let hit: string | null = null;
      let best = 20; // px hit radius
      for (const node of layoutNodesRef.current) {
        if (!node.isFolder) continue;
        const p = lastTransformRef.current(node.x, node.y);
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < best) { best = d; hit = node.id; }
      }
      if (hit) {
        const set = collapsedFoldersRef.current;
        if (set.has(hit)) set.delete(hit); else set.add(hit);
        lastNodeCountRef.current = -1; // force layout recompute next frame
      }
    };
    canvas.addEventListener('click', onClick);
```

Ajouter au cleanup : `canvas.removeEventListener('click', onClick);`

Note : `lastNodeCountRef.current = -1` force `nodeCount !== lastNodeCountRef.current` donc `layoutNodesRef.current = calculateTreeLayout(...)` est recalculé avec le nouveau `collapsedFoldersRef`.

- [ ] **Step 2: Render the `+N` badge on collapsed folders**

Dans la boucle `for (const node of layoutNodes)`, juste après le `ctx.fillText(node.name, ...)`, ajouter :

```typescript
        if (node.collapsedCount && node.collapsedCount > 0) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 12px system-ui';
          ctx.fillText(`+${node.collapsedCount}`, pos.x, pos.y - size - 8);
        }
```

- [ ] **Step 3: Build + manual check**

Run: `cd client && npx tsc --noEmit && npm test`
Expected: no type errors; tests PASS.
Manuel `http://localhost:5173/` : clic sur un dossier replie son sous-arbre et affiche `+N` ; re-clic le déplie. Zoom/pan toujours fonctionnels.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/FileGraph.tsx
git commit -m "feat(tree): click to collapse/expand folders with hidden count"
```

---

## Vérification finale (après A + B)

- [ ] `cd server && npm test` → PASS (inchangé, sanity).
- [ ] `cd client && npm test` → PASS.
- [ ] `cd client && npx tsc --noEmit` → 0 erreur.
- [ ] `rg -n "multi-floor|MultiFloorHotel" client/src` → vide.
- [ ] Smoke manuel des deux vues : `/` (zoom/pan/fold) et `/hotel` (un étage, suivi agent, nav bar).
