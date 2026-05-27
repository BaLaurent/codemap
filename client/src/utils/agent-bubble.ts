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
