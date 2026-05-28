// Permission modes the user can pick at spawn or switch mid-session. Labels spell
// out which ones open the hotel modal so the behaviour isn't a surprise: only
// 'default' prompts a human; 'auto' uses a model classifier; 'bypassPermissions'
// skips checks; 'plan' runs no tools. Shared by SpawnPanel and AgentChatPanel.
export const PERMISSION_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'default', label: 'Modal' },
  { value: 'acceptEdits', label: 'Auto-édit.' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto (IA)' },
  { value: 'bypassPermissions', label: 'Bypass' },
];

// Short label for a mode value (falls back to the raw value for unknowns).
export function permissionModeLabel(mode?: string): string {
  return PERMISSION_MODE_OPTIONS.find(o => o.value === mode)?.label ?? mode ?? '—';
}
