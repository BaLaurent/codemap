// Chat input with a terminal-style completion popover: "/" lists commands +
// skills, "@" lists project files. Keyboard: ↑/↓ to move, Tab/Enter to insert,
// Esc to dismiss, Enter (no popover) to submit. Pixel-art palette matches the
// chat panel and interaction modal.
import { useState, useRef, useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import type { SlashCommand } from '../../types';
import { detectTrigger, applyCompletion, filterCommands, filterFiles, type Trigger } from './trigger';

const C = { ink: '#3A2E12', border: '#4A3B1A', gold: '#FFE040', cream: '#FFF8E6' };

const wrap: CSSProperties = { position: 'relative', flex: 1, display: 'flex' };

const textInput: CSSProperties = {
  flex: 1, boxSizing: 'border-box', padding: '6px 8px', fontFamily: 'monospace', fontSize: 13,
  color: C.ink, background: '#fff', border: `2px solid ${C.border}`,
};

const popover: CSSProperties = {
  position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
  maxHeight: 200, overflowY: 'auto', zIndex: 30,
  background: C.cream, border: `3px solid ${C.border}`, boxShadow: '4px 4px 0 rgba(0,0,0,0.35)',
};

const row = (active: boolean): CSSProperties => ({
  display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 8px',
  fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
  background: active ? C.gold : 'transparent', color: C.ink,
});

// Name is fixed-width (always fully readable); the description shrinks + ellipsizes.
const labelStyle: CSSProperties = { flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap' };
const hint: CSSProperties = {
  flex: '1 1 auto', minWidth: 0, textAlign: 'right',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  opacity: 0.6, fontStyle: 'italic',
};

interface Suggestion { insert: string; label: string; hint: string; }

export function CompletionInput({ value, onChange, onSubmit, commands, files, disabled, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  commands: SlashCommand[];
  files: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);   // highlighted suggestion index
  const [open, setOpen] = useState(true);    // closed by Esc until the trigger changes

  const trigger = useMemo<Trigger | null>(() => detectTrigger(value, caret), [value, caret]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    if (trigger.kind === 'command') {
      return filterCommands(commands, trigger.query).map(c => ({
        insert: c.name, label: `/${c.name}`, hint: c.argumentHint || c.description,
      }));
    }
    return filterFiles(files, trigger.query).map(p => ({ insert: p, label: p, hint: '' }));
  }, [trigger, commands, files]);

  const showPopover = open && !disabled && trigger !== null && suggestions.length > 0;

  // Track caret after any value/selection change so the trigger recomputes.
  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length);

  const choose = (s: Suggestion) => {
    if (!trigger) return;
    const next = applyCompletion(value, trigger, s.insert);
    onChange(next.value);
    setOpen(true);
    // Restore focus + caret after React applies the new value.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showPopover) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); choose(suggestions[Math.min(active, suggestions.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div style={wrap}>
      {showPopover && (
        <div style={popover}>
          {suggestions.map((s, i) => (
            <div
              key={s.label + i}
              style={row(i === active)}
              onMouseDown={e => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActive(i)}
            >
              <span style={labelStyle}>{s.label}</span>
              {s.hint && <span style={hint}>{s.hint}</span>}
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        style={{ ...textInput, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'text' }}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); requestAnimationFrame(syncCaret); }}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
