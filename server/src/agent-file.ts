// Decides the agent's "current file" from a file-activity event.
//
// read/write events carry a real project-relative path (the file the agent is
// at). search events (Grep/Glob) carry "searchPath:pattern" — not a file — and
// must NOT move the agent, so they leave currentFile untouched.
//
// Both -start and -end set the file: the agent stays at that file until its
// next file op. Callers keep the previous value when this returns undefined,
// which is what makes currentFile sticky across non-file commands (e.g. Bash).
export function fileFromActivityEvent(
  type: string,
  relativePath: string
): string | undefined {
  if (type.startsWith('search')) return undefined;
  return relativePath || undefined;
}
