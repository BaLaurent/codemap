// Pure logic for the chat completion popover: where the caret sits relative to a
// "/" (command/skill) or "@" (file) trigger, and how to filter + insert. Kept
// free of React so it can be unit-tested directly.
import type { SlashCommand } from '../../types';

export type TriggerKind = 'command' | 'file';

export interface Trigger {
  kind: TriggerKind;
  query: string;   // text typed after the trigger char, up to the caret
  start: number;   // index of the trigger char in the value
  end: number;     // caret index (exclusive end of the text to replace)
}

// Decide whether the caret is inside an active completion trigger.
// "/" only triggers at the very start of the line (terminal behaviour); "@"
// triggers at any word boundary. Returns null when no menu should open.
export function detectTrigger(value: string, caret: number): Trigger | null {
  const head = value.slice(0, caret);

  // Command: line starts with "/" and the caret is still within the first token.
  if (head.startsWith('/') && !/\s/.test(head.slice(1))) {
    return { kind: 'command', query: head.slice(1), start: 0, end: caret };
  }

  // File: nearest "@" before the caret that sits at a word boundary, with no
  // whitespace between it and the caret.
  const at = head.lastIndexOf('@');
  if (at !== -1) {
    const before = at === 0 ? '' : head[at - 1];
    const between = head.slice(at + 1);
    if ((at === 0 || /\s/.test(before)) && !/\s/.test(between)) {
      return { kind: 'file', query: between, start: at, end: caret };
    }
  }

  return null;
}

// Apply the chosen completion, returning the new value and caret position.
export function applyCompletion(value: string, trigger: Trigger, insertText: string): { value: string; caret: number } {
  const prefix = trigger.kind === 'command' ? '/' : '@';
  const replacement = `${prefix}${insertText} `;
  const next = value.slice(0, trigger.start) + replacement + value.slice(trigger.end);
  return { value: next, caret: trigger.start + replacement.length };
}

// Case-insensitive ranking: a string that starts with the query beats one that
// merely contains it; ties keep input order. Empty query keeps everything.
function rank(haystack: string, query: string): number {
  if (!query) return 0;
  const idx = haystack.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return -1;
  return idx === 0 ? 0 : 1;
}

// Best (lowest) rank across several candidate strings; -1 if none match.
function bestRank(haystacks: string[], query: string): number {
  const ranks = haystacks.map(h => rank(h, query)).filter(r => r !== -1);
  return ranks.length ? Math.min(...ranks) : -1;
}

export function filterCommands(commands: SlashCommand[], query: string, limit = 50): SlashCommand[] {
  return commands
    .map(c => ({ c, r: bestRank([c.name, ...(c.aliases ?? [])], query) }))
    .filter(x => x.r !== -1)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map(x => x.c);
}

export function filterFiles(files: string[], query: string, limit = 30): string[] {
  return files
    .map(p => ({ p, r: bestRank([p.slice(p.lastIndexOf('/') + 1), p], query) }))
    .filter(x => x.r !== -1)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit)
    .map(x => x.p);
}
