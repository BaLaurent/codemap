import type { AgentQuestion } from '../types';

// Decides the second line of an agent's speech bubble.
//
// File-bearing commands set currentFile on the server (file-activity-hook is
// wired to Read for reads and Edit|Write|MultiEdit for writes). For those we
// show the agent's actual current file — the SAME source that drives movement
// and floor selection — so what the bubble says always matches where the agent
// stands. Every other command (Bash, Grep, Glob, Task…) shows its toolInput
// (the command or search pattern), since no file is involved.
const FILE_COMMANDS = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);

export function bubbleSecondaryText(
  currentCommand: string | undefined,
  currentFile: string | undefined,
  toolInput: string | undefined
): string | null {
  if (currentCommand && currentFile && FILE_COMMANDS.has(currentCommand)) {
    return currentFile.split('/').pop() || currentFile;
  }
  return toolInput ?? null;
}

const STUCK_FALLBACK = "Hey! I'm stuck!";
const Q_MAX_LINES = 4;    // cap question height before shrinking the font
const OPT_MAX_CHARS = 30; // options summary, single line

// Candidate font sizes for the question, largest first. maxChars is tuned so the
// bubble keeps a roughly constant ~150px width across sizes (monospace char
// width ≈ 0.6·size). A short question stays large; a long one shrinks to fit
// Q_MAX_LINES instead of ballooning the bubble.
const QUESTION_FONTS: { size: number; maxChars: number }[] = [
  { size: 10, maxChars: 25 },
  { size: 9, maxChars: 28 },
  { size: 8, maxChars: 31 },
  { size: 7, maxChars: 35 },
];

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** One rendered line of a speech bubble. `size` overrides the default font size. */
export interface BubbleLine {
  text: string;
  bold: boolean;
  size?: number;
}

// Greedy word-wrap with no line cap — the full text is always shown, across as
// many lines as needed. A single word longer than maxChars is hard-truncated
// (it physically cannot fit on one line).
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const raw of words) {
    const word = raw.length > maxChars ? truncate(raw, maxChars) : raw;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Decides what a waiting agent's bubble shows, as a list of lines. With a real
// AskUserQuestion we pick the largest font at which the question fits within
// Q_MAX_LINES, then render the WHOLE question (never truncated — it just uses a
// smaller font / more lines), and append the option labels. Without a question
// we fall back to the generic stuck message — e.g. a permission prompt by timeout.
export function bubbleStuckLines(question: AgentQuestion | undefined): BubbleLine[] {
  // The bubble summarises the first question; the modal shows them all.
  const q = question?.questions?.[0];
  if (!q || !q.question) {
    return [{ text: STUCK_FALLBACK, bold: true }];
  }

  // Largest font whose wrap fits the line budget; smallest if none do (the full
  // text is still shown — the bubble just gets taller).
  let chosen = QUESTION_FONTS[QUESTION_FONTS.length - 1];
  for (const font of QUESTION_FONTS) {
    if (wrapText(q.question, font.maxChars).length <= Q_MAX_LINES) {
      chosen = font;
      break;
    }
  }

  const lines: BubbleLine[] = wrapText(q.question, chosen.maxChars)
    .map(text => ({ text, bold: true, size: chosen.size }));
  const labels = q.options?.map(o => o.label).filter(Boolean) ?? [];
  if (labels.length > 0) {
    lines.push({ text: truncate(labels.join(' / '), OPT_MAX_CHARS), bold: false });
  }
  return lines;
}
