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

export const INITIAL_NAV_STATE: NavState = { currentFloorIndex: 0, focusAgentId: null, follow: false };

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
  selectFloor: (floor: number) => void;
  removeAgent: (agentId: string) => void;
}

export function useFloorNavigation(): FloorNavigation {
  const [state, setState] = useState<NavState>(INITIAL_NAV_STATE);
  const snapshotRef = useRef<NavState>(state);
  const agentFloorsRef = useRef<Map<string, number>>(new Map());

  const dispatch = useCallback((action: NavAction) => {
    setState(prev => {
      const next = reduceNav(prev, action, agentFloorsRef.current);
      // Idempotent: writing the same computed value is safe under React
      // StrictMode double-invocation of this updater.
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

  const selectFloor = useCallback((floor: number) => {
    dispatch({ kind: 'selectFloor', floor });
  }, [dispatch]);

  const removeAgent = useCallback((agentId: string) => {
    agentFloorsRef.current.delete(agentId);
    dispatch({ kind: 'removeAgent', agentId });
  }, [dispatch]);

  return {
    state, snapshotRef, agentFloorsRef,
    noteAgentActivity, selectAgent, selectFloor, removeAgent,
  };
}
