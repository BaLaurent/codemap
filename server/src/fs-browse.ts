import fs from 'fs';
import path from 'path';
import os from 'os';

export interface DirEntry { name: string; path: string; }
export interface DirListing { path: string; parent: string | null; entries: DirEntry[]; }

// Lists the immediate sub-directories of `dir` for the folder browser. Hidden
// (dotfile) directories are omitted; unreadable / dangling symlink entries are
// skipped. An empty/blank dir defaults to the user's home directory.
export function listSubdirectories(dir: string): DirListing {
  const abs = dir && path.isAbsolute(dir) ? dir : os.homedir();
  const dirents = fs.readdirSync(abs, { withFileTypes: true });
  const entries: DirEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    let isDir = d.isDirectory();
    if (d.isSymbolicLink()) {
      try { isDir = fs.statSync(path.join(abs, d.name)).isDirectory(); } catch { continue; }
    }
    if (isDir) entries.push({ name: d.name, path: path.join(abs, d.name) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, entries };
}
