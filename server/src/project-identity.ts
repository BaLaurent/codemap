import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

// Tooling/config dirs that are not real projects and must never become buildings.
export const NON_PROJECT_ROOTS = [path.join(os.homedir(), '.claude')];

// Cache dir → git toplevel so we resolve a project's root at most once per dir.
const dirToGitRoot = new Map<string, string>();

export function gitRootOf(dir: string): string {
  const cached = dirToGitRoot.get(dir);
  if (cached) return cached;
  let root = dir;
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) root = out;
  } catch {
    // not a git repo (or git missing) → treat the dir itself as the project
  }
  dirToGitRoot.set(dir, root);
  return root;
}

export interface ProjectFields {
  projectId: string;
  projectRoot: string;
  projectName: string;
}

// Derive a building from an absolute file path (git toplevel of its directory).
// Returns undefined when the path is not usable (relative, or a search pattern).
export function deriveProjectFromPath(absPath: string | undefined, isSearch: boolean): ProjectFields | undefined {
  if (!absPath || isSearch || !path.isAbsolute(absPath)) return undefined;
  // Skip tooling/config dirs (e.g. ~/.claude) — they are not projects.
  if (NON_PROJECT_ROOTS.some(r => absPath === r || absPath.startsWith(r + path.sep))) return undefined;
  const root = gitRootOf(path.dirname(absPath));
  return { projectId: root, projectRoot: root, projectName: path.basename(root) };
}

// Derive a building from an absolute *directory* the user picked in the town.
// Sibling of deriveProjectFromPath (which takes a file path); both share
// gitRootOf, so a sub-dir of a repo resolves to the repo root, and a non-git
// folder becomes its own project.
export function deriveProjectFromDir(absDir: string): ProjectFields | undefined {
  if (!path.isAbsolute(absDir)) return undefined;
  if (NON_PROJECT_ROOTS.some(r => absDir === r || absDir.startsWith(r + path.sep))) return undefined;
  const root = gitRootOf(absDir);
  return { projectId: root, projectRoot: root, projectName: path.basename(root) };
}
