# Multi-Project Town — Phase 2 (Client Town) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the multi-project feed as a "town": a zoomed-out overview of building facades (one per project), click a building to drill into the existing hotel interior scoped to that project.

**Architecture:** Additive over P1. `useFileActivity(projectId?)` scopes the WS feed + REST fetches to one building. A new `useProjects()` hook lists buildings from `/api/projects`. A pure `town-layout.ts` arranges facades deterministically. `TownView` renders facades and, on selection, mounts the existing `HabboRoom` with a `projectId` prop. No internal rewrite of HabboRoom's render loop — only its data source is scoped.

**Tech Stack:** React, Canvas 2D, Vitest. Contracts from P1: WS messages carry `projectId`; `/api/graph` and `/api/hot-folders` accept `?projectId=`.

**Contract (from advisor):** the client MUST always send `projectId` to `/api/graph` and `/api/hot-folders`. Omitting it makes the server default to "first project", interleaving buildings.

**Testing strategy (from advisor):** TDD only the PURE pieces — WS demux filter, `town-layout`, `useProjects` merge logic. Canvas facade drawing is verified by manual smoke, NOT unit tests.

---

### Task 1: Scope the WS feed + fetches by projectId

**Files:**
- Modify: `client/src/hooks/useFileActivity.ts`
- Test: `client/src/hooks/useFileActivity.test.ts`

- [ ] **Step 1: Write a failing test for the message filter**

The demux decision is pure: "should this WS message be applied to the building I'm watching?" Extract it as `shouldApplyMessage(message, projectId)` and test it. Create `client/src/hooks/useFileActivity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldApplyMessage } from './useFileActivity';

describe('shouldApplyMessage', () => {
  it('applies any message when no projectId filter is set', () => {
    expect(shouldApplyMessage({ type: 'graph', data: {}, projectId: 'A' }, undefined)).toBe(true);
  });
  it('applies messages whose projectId matches the watched building', () => {
    expect(shouldApplyMessage({ type: 'activity', data: {}, projectId: 'A' }, 'A')).toBe(true);
  });
  it('drops messages for other buildings', () => {
    expect(shouldApplyMessage({ type: 'activity', data: {}, projectId: 'B' }, 'A')).toBe(false);
  });
  it('always applies thinking (global agent list) even when filtering', () => {
    expect(shouldApplyMessage({ type: 'thinking', data: [] }, 'A')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it (fails — function not exported)**

Run: `cd client && npx vitest run src/hooks/useFileActivity.test.ts`
Expected: FAIL — `shouldApplyMessage` is not exported.

- [ ] **Step 3: Implement `shouldApplyMessage` and thread `projectId`**

In `client/src/hooks/useFileActivity.ts`:

Add the exported pure helper at top level (after imports):

```typescript
// Decide whether a WS message applies to the building we're watching.
// `thinking` is the global agent list (filtered client-side by project elsewhere),
// so it always applies. Other messages apply when unfiltered or projectId matches.
export function shouldApplyMessage(
  message: { type: string; projectId?: string },
  watchedProjectId: string | undefined
): boolean {
  if (message.type === 'thinking') return true;
  if (!watchedProjectId) return true;
  return message.projectId === watchedProjectId;
}
```

Change the hook signature to `export function useFileActivity(projectId?: string)`. In `connect()`, append the query when set:

```typescript
const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
fetch(`${API_URL}/graph${q}`)
```

In `ws.onmessage`, gate handling at the top of the parsed branch:

```typescript
const message = JSON.parse(event.data);
if (!shouldApplyMessage(message, projectId)) return;
```

Add `projectId` to the `connect` `useCallback` dependency array, and to the `useEffect` deps (so switching buildings reconnects with the right scope).

- [ ] **Step 4: Run test (passes)**

Run: `cd client && npx vitest run src/hooks/useFileActivity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd client && npx tsc --noEmit`
```bash
git add client/src/hooks/useFileActivity.ts client/src/hooks/useFileActivity.test.ts
git commit -m "feat(client): scope file-activity feed by projectId"
```

---

### Task 2: useProjects — list the buildings

**Files:**
- Create: `client/src/hooks/useProjects.ts`
- Test: `client/src/hooks/useProjects.test.ts`

- [ ] **Step 1: Write a failing test for the merge/sort rule**

Buildings are sorted deterministically: by `lastActivity` desc, then `projectName` asc. Extract `sortProjects(list)` as a pure function. Create `client/src/hooks/useProjects.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sortProjects } from './useProjects';
import { ProjectInfo } from '../types';

const p = (id: string, name: string, last: number): ProjectInfo =>
  ({ projectId: id, projectName: name, projectRoot: id, lastActivity: last, agentCount: 0 });

describe('sortProjects', () => {
  it('orders by lastActivity desc then name asc', () => {
    const out = sortProjects([p('1', 'beta', 10), p('2', 'alpha', 30), p('3', 'gamma', 30)]);
    expect(out.map(x => x.projectName)).toEqual(['alpha', 'gamma', 'beta']);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `cd client && npx vitest run src/hooks/useProjects.test.ts`
Expected: FAIL — module/function missing.

- [ ] **Step 3: Implement the hook + pure sorter**

Create `client/src/hooks/useProjects.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { ProjectInfo } from '../types';

const API_URL = 'http://localhost:5174/api';

export function sortProjects(list: ProjectInfo[]): ProjectInfo[] {
  return [...list].sort((a, b) =>
    b.lastActivity - a.lastActivity || a.projectName.localeCompare(b.projectName));
}

// Polls /api/projects. Stores into a ref + bumps a version ref so the canvas
// loop can read without forcing React re-renders (matches useFileActivity style).
export function useProjects(): {
  projectsRef: React.MutableRefObject<ProjectInfo[]>;
  versionRef: React.MutableRefObject<number>;
} {
  const projectsRef = useRef<ProjectInfo[]>([]);
  const versionRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const fetchProjects = () => {
      fetch(`${API_URL}/projects`)
        .then(r => r.json())
        .then((data: ProjectInfo[]) => {
          if (!alive) return;
          const sorted = sortProjects(data);
          if (JSON.stringify(sorted) !== JSON.stringify(projectsRef.current)) {
            projectsRef.current = sorted;
            versionRef.current++;
          }
        })
        .catch(() => {});
    };
    fetchProjects();
    const id = setInterval(fetchProjects, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { projectsRef, versionRef };
}
```

- [ ] **Step 4: Run test (passes) + typecheck + commit**

Run: `cd client && npx vitest run src/hooks/useProjects.test.ts && npx tsc --noEmit`
```bash
git add client/src/hooks/useProjects.ts client/src/hooks/useProjects.test.ts
git commit -m "feat(client): useProjects hook + deterministic sort"
```

---

### Task 3: Pure town layout

**Files:**
- Create: `client/src/layout/town-layout.ts`
- Test: `client/src/layout/town-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/layout/town-layout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { layoutTown, BUILDINGS_PER_ROW } from './town-layout';
import { ProjectInfo } from '../types';

const p = (id: string, name: string): ProjectInfo =>
  ({ projectId: id, projectName: name, projectRoot: id, lastActivity: 0, agentCount: 0 });

describe('layoutTown', () => {
  it('places buildings left-to-right, wrapping into rows', () => {
    const many = Array.from({ length: BUILDINGS_PER_ROW + 1 }, (_, i) => p(`${i}`, `p${i}`));
    const placed = layoutTown(many);
    expect(placed[0].row).toBe(0);
    expect(placed[0].col).toBe(0);
    expect(placed[BUILDINGS_PER_ROW].row).toBe(1);
    expect(placed[BUILDINGS_PER_ROW].col).toBe(0);
    // x increases with col; same x for same col across rows
    expect(placed[1].x).toBeGreaterThan(placed[0].x);
    expect(placed[BUILDINGS_PER_ROW].x).toBe(placed[0].x);
  });

  it('preserves input order (caller sorts)', () => {
    const placed = layoutTown([p('z', 'z'), p('a', 'a')]);
    expect(placed.map(b => b.projectId)).toEqual(['z', 'a']);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `cd client && npx vitest run src/layout/town-layout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `client/src/layout/town-layout.ts`:

```typescript
import { ProjectInfo } from '../types';

export const BUILDINGS_PER_ROW = 4;
const BUILDING_W = 220;   // px, facade footprint
const BUILDING_H = 260;
const GAP_X = 80;
const GAP_Y = 120;
const MARGIN = 80;

export interface PlacedBuilding extends ProjectInfo {
  row: number;
  col: number;
  x: number;   // top-left px in town world space
  y: number;
}

// Arranges buildings into a wrapping grid. Caller provides them pre-sorted;
// layout preserves that order.
export function layoutTown(projects: ProjectInfo[]): PlacedBuilding[] {
  return projects.map((proj, i) => {
    const col = i % BUILDINGS_PER_ROW;
    const row = Math.floor(i / BUILDINGS_PER_ROW);
    return {
      ...proj,
      row, col,
      x: MARGIN + col * (BUILDING_W + GAP_X),
      y: MARGIN + row * (BUILDING_H + GAP_Y),
    };
  });
}

export const BUILDING_SIZE = { w: BUILDING_W, h: BUILDING_H };
```

- [ ] **Step 4: Run test (passes) + commit**

Run: `cd client && npx vitest run src/layout/town-layout.test.ts`
```bash
git add client/src/layout/town-layout.ts client/src/layout/town-layout.test.ts
git commit -m "feat(client): pure town layout (wrapping grid of buildings)"
```

---

### Task 4: Building facade drawing

**Files:**
- Create: `client/src/drawing/building.ts`
- Modify: `client/src/drawing/index.ts` (export `drawBuilding`)

- [ ] **Step 1: Implement the facade renderer**

Create `client/src/drawing/building.ts`. Height of the lit-window grid scales with `floorCount`; lit windows scale with `agentCount`; a sign shows the name. Pixel-art style consistent with existing drawing modules (flat fills, dark outlines).

```typescript
export interface BuildingFacadeOpts {
  x: number; y: number; w: number; h: number;
  name: string;
  floorCount: number;   // visual height cue (clamped)
  agentCount: number;   // lit windows
  active: boolean;      // recently active → brighter
  hovered: boolean;
}

export function drawBuilding(ctx: CanvasRenderingContext2D, o: BuildingFacadeOpts): void {
  const floors = Math.max(2, Math.min(8, o.floorCount || 2));
  const bodyTop = o.y + o.h - (floors * 28 + 40);
  const bodyH = o.y + o.h - bodyTop;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(o.x + 8, o.y + o.h - 10, o.w, 12);

  // Body
  ctx.fillStyle = o.active ? '#6b7fb5' : '#52607f';
  ctx.fillRect(o.x, bodyTop, o.w, bodyH);
  ctx.strokeStyle = o.hovered ? '#ffd34d' : '#2b3450';
  ctx.lineWidth = o.hovered ? 3 : 2;
  ctx.strokeRect(o.x, bodyTop, o.w, bodyH);

  // Roof
  ctx.fillStyle = '#3a4straight'.slice(0, 7) || '#3a445f';
  ctx.fillRect(o.x - 6, bodyTop - 14, o.w + 12, 14);

  // Windows grid (cols x floors), lit up to agentCount
  const cols = 4;
  const total = cols * floors;
  const lit = Math.max(0, Math.min(total, o.agentCount));
  const wW = 26, wH = 16, padX = (o.w - cols * wW) / (cols + 1);
  let n = 0;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const wx = o.x + padX + c * (wW + padX);
      const wy = bodyTop + 14 + f * 28;
      ctx.fillStyle = n < lit ? '#ffe27a' : '#27304a';
      ctx.fillRect(wx, wy, wW, wH);
      ctx.strokeStyle = '#1c2236';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx, wy, wW, wH);
      n++;
    }
  }

  // Door
  const doorW = 34, doorH = 40;
  ctx.fillStyle = '#2b2030';
  ctx.fillRect(o.x + o.w / 2 - doorW / 2, o.y + o.h - doorH, doorW, doorH);

  // Sign
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(o.x, bodyTop - 38, o.w, 22);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(o.name.slice(0, 18), o.x + o.w / 2, bodyTop - 22);
  ctx.textAlign = 'left';
}
```

Fix the obvious typo before saving: set roof color to a single literal `'#3a445f'` (remove the bogus `'#3a4straight'.slice...` expression).

- [ ] **Step 2: Export it**

In `client/src/drawing/index.ts`, add: `export { drawBuilding } from './building';` and `export type { BuildingFacadeOpts } from './building';`

- [ ] **Step 3: Typecheck + commit**

Run: `cd client && npx tsc --noEmit`
```bash
git add client/src/drawing/building.ts client/src/drawing/index.ts
git commit -m "feat(client): building facade renderer"
```

---

### Task 5: HabboRoom accepts a projectId prop

**Files:**
- Modify: `client/src/components/HabboRoom.tsx`

- [ ] **Step 1: Thread projectId into data sources**

Change the signature to `export function HabboRoom({ projectId }: { projectId?: string }) {`.

Pass it to the feed: `useFileActivity(projectId)`.

Scope the hot-folders fetch — change the fetch URL:

```typescript
const q = projectId ? `&projectId=${encodeURIComponent(projectId)}` : '';
fetch(`${API_URL}/hot-folders?limit=${HOT_FOLDERS_LIMIT}${q}`)
```

- [ ] **Step 2: Filter agents to this building**

In the agent-sync block that reads `thinkingAgentsRef.current`, filter to the building when scoped. Find where the code iterates `thinkingAgentsRef.current` to create/update agents and wrap the source list:

```typescript
const agentsForBuilding = projectId
  ? thinkingAgentsRef.current.filter(a => a.projectId === projectId)
  : thinkingAgentsRef.current;
```

Use `agentsForBuilding` in that sync loop instead of `thinkingAgentsRef.current`. (Agents from other buildings are simply not materialized here.)

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors. `HabboRoom` with no prop still behaves as today (unscoped).

- [ ] **Step 4: Run client suite (no regressions) + commit**

Run: `cd client && npm test`
Expected: all pass.
```bash
git add client/src/components/HabboRoom.tsx
git commit -m "feat(client): scope HabboRoom to a projectId (building interior)"
```

---

### Task 6: TownView — overview + drill-in

**Files:**
- Create: `client/src/components/TownView.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Implement TownView**

Create `client/src/components/TownView.tsx`. It draws the town on a canvas from `useProjects()` + `layoutTown` + `drawBuilding`; clicking a building sets `selected`; when selected, it renders `<HabboRoom projectId={selected} />` plus a "← Town" button. A building's `floorCount` is unknown to the town feed, so derive a simple cue from `agentCount` (min 2) — exact floor count is shown once inside.

```typescript
import { useEffect, useRef, useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { layoutTown, BUILDING_SIZE } from '../layout/town-layout';
import { drawBuilding } from '../drawing';
import { HabboRoom } from './HabboRoom';

export function TownView() {
  const { projectsRef } = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const placedRef = useRef<ReturnType<typeof layoutTown>>([]);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    if (selected) return; // interior takes over
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let raf = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      placedRef.current = layoutTown(projectsRef.current);
      ctx.fillStyle = '#1b2233';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // street
      ctx.fillStyle = '#10151f';
      ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
      for (const b of placedRef.current) {
        drawBuilding(ctx, {
          x: b.x, y: b.y, w: BUILDING_SIZE.w, h: BUILDING_SIZE.h,
          name: b.projectName,
          floorCount: Math.max(2, b.agentCount + 2),
          agentCount: b.agentCount,
          active: Date.now() - b.lastActivity < 60000,
          hovered: hoverRef.current === b.projectId,
        });
      }
      if (placedRef.current.length === 0) {
        ctx.fillStyle = '#8a93a6';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No projects yet — run Claude/Cursor in a repo to raise a building.', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
      }
      raf = requestAnimationFrame(render);
    };
    render();

    const hit = (mx: number, my: number) =>
      placedRef.current.find(b =>
        mx >= b.x && mx <= b.x + BUILDING_SIZE.w && my >= b.y && my <= b.y + BUILDING_SIZE.h);
    const onMove = (e: MouseEvent) => {
      const b = hit(e.clientX, e.clientY);
      hoverRef.current = b ? b.projectId : null;
      canvas.style.cursor = b ? 'pointer' : 'default';
    };
    const onClick = (e: MouseEvent) => {
      const b = hit(e.clientX, e.clientY);
      if (b) setSelected(b.projectId);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [selected, projectsRef]);

  if (selected) {
    return (
      <>
        <HabboRoom projectId={selected} />
        <button
          onClick={() => setSelected(null)}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 30,
            padding: '10px 18px', cursor: 'pointer',
            background: 'rgba(17,24,39,0.95)', color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
            fontWeight: 600,
          }}
        >← Town</button>
      </>
    );
  }

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}
```

- [ ] **Step 2: Route `/hotel` to TownView**

In `client/src/App.tsx`, import `TownView` and replace the `HotelView`'s `<HabboRoom />` with `<TownView />` (keep the nav links). The `/hotel` route now lands in the town; drilling into a building shows the interior.

- [ ] **Step 3: Typecheck + commit**

Run: `cd client && npx tsc --noEmit`
```bash
git add client/src/components/TownView.tsx client/src/App.tsx
git commit -m "feat(client): TownView overview with drill-into-building"
```

---

### Task 7: Manual smoke + full suites

- [ ] **Step 1: Run both test suites**

Run: `cd server && npm test && cd ../client && npm test`
Expected: all green.

- [ ] **Step 2: Visual smoke**

With server + client running, open `http://localhost:5173/hotel`. Confirm: the town shows one building per active project; building windows light up with agents; clicking a building enters the interior (floors/rooms for THAT project only); "← Town" returns. Trigger activity in a second repo and confirm a second building appears.

---

## Self-Review

- **Spec §4 (client):** demux → Task 1; building model/list → Task 2; town layout → Task 3; facade → Task 4; interior reuse scoped by building → Task 5; two-level nav (overview + drill-in) → Task 6.
- **Contract:** projectId sent to `/api/graph` (Task 1) and `/api/hot-folders` (Task 5). ✓
- **Testing strategy:** pure pieces TDD'd (Tasks 1–3); canvas (Tasks 4, 6) smoke-tested (Task 7). ✓
- **Placeholders:** none. (Task 4 flags and fixes the deliberate roof-color typo before saving.)
- **Type consistency:** `ProjectInfo` (from P1 client types) used by `useProjects`, `town-layout`, `TownView`. `projectId` optional prop on `HabboRoom` keeps the unscoped path working.

## Deferred (not blocking the town)

- `bin/setup.js` messaging update (no longer co-launches server) — cosmetic; auto-start covers runtime. Do as a follow-up.
- Per-building camera persistence, idle-building removal, agent travel between buildings — out of scope (YAGNI).
