// DOM navigation bar for the single-floor hotel view.
import { useEffect, useReducer, type CSSProperties } from 'react';
import { getAgentName, AGENT_NAMES_CHANGED } from '../utils/agent-names';

interface FloorNavBarProps {
  currentFloor: number;
  availableFloors: number[];
  follow: boolean;
  focusAgentId: string | null;
  focusAgentName?: string;
  onSelectFloor: (floor: number) => void;
}

const panel: CSSProperties = {
  position: 'absolute', top: 16, left: 16, zIndex: 20,
  display: 'flex', alignItems: 'center', gap: 12,
  backgroundColor: 'rgba(17, 24, 39, 0.9)',
  padding: '10px 16px', borderRadius: '12px',
  color: '#e5e7eb', fontSize: '13px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(8px)',
};

const btn: CSSProperties = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
  color: '#e5e7eb', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
  fontSize: 13,
};

const floorBtn = (disabled: boolean): CSSProperties => ({
  ...btn, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer',
});

export function FloorNavBar({
  currentFloor, availableFloors, follow, focusAgentId, focusAgentName,
  onSelectFloor,
}: FloorNavBarProps) {
  // Step only among floors that actually exist (availableFloors, sorted ascending).
  const prevFloor = availableFloors.filter(f => f < currentFloor).at(-1);
  const nextFloor = availableFloors.find(f => f > currentFloor);

  // The focused agent's name may be a user-assigned custom name (renamed in the
  // roster). That lives in the agent-names store, not in React state, so resolve
  // it via getAgentName and re-render on AGENT_NAMES_CHANGED — otherwise the bar
  // would keep showing the server default after a rename. focusAgentName is the
  // server-assigned fallback.
  const [, bumpName] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(AGENT_NAMES_CHANGED, bumpName);
    return () => window.removeEventListener(AGENT_NAMES_CHANGED, bumpName);
  }, []);
  const displayedName = focusAgentId
    ? getAgentName(focusAgentId, focusAgentName ?? `Agent ${focusAgentId.slice(0, 6)}`)
    : 'No agent';

  return (
    <div style={panel}>
      <span style={{ fontWeight: 600 }} title="Focused agent (pick another from the roster)">
        {displayedName}
      </span>

      <span style={{ opacity: 0.4 }} aria-hidden="true">|</span>

      <button
        style={floorBtn(prevFloor === undefined)}
        onClick={() => { if (prevFloor !== undefined) onSelectFloor(prevFloor); }}
        disabled={prevFloor === undefined}
        title="Floor down"
      >▼</button>
      <span style={{ fontWeight: 600, color: follow ? '#34d399' : '#fbbf24' }}>
        Floor {currentFloor}{follow ? '' : ' (manual)'}
      </span>
      <button
        style={floorBtn(nextFloor === undefined)}
        onClick={() => { if (nextFloor !== undefined) onSelectFloor(nextFloor); }}
        disabled={nextFloor === undefined}
        title="Floor up"
      >▲</button>
    </div>
  );
}
