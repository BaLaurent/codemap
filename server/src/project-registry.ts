import { ActivityStore } from './activity-store.js';
import { GraphData, ProjectInfo } from './types.js';

export interface ProjectWorkspace {
  projectId: string;
  projectName: string;
  projectRoot: string;
  store: ActivityStore;
  lastActivity: number;
  agentCount: number;
  pinned: boolean;
}

/**
 * Tracks every project the server has seen (one building per project).
 * Workspaces are created lazily on first event and reused thereafter.
 */
export class ProjectRegistry {
  private workspaces = new Map<string, ProjectWorkspace>();
  private graphChangeCallback: ((projectId: string, data: GraphData) => void) | null = null;

  onGraphChange(cb: (projectId: string, data: GraphData) => void): void {
    this.graphChangeCallback = cb;
  }

  getOrCreate(projectId: string, projectRoot: string, projectName: string): ProjectWorkspace {
    let w = this.workspaces.get(projectId);
    if (w) return w;
    const store = new ActivityStore(projectRoot);
    store.onGraphChange((data) => this.graphChangeCallback?.(projectId, data));
    w = { projectId, projectName, projectRoot, store, lastActivity: Date.now(), agentCount: 0, pinned: false };
    this.workspaces.set(projectId, w);
    return w;
  }

  get(projectId: string): ProjectWorkspace | undefined {
    return this.workspaces.get(projectId);
  }

  toRelativePath(projectId: string, absolutePath: string): string {
    const w = this.workspaces.get(projectId);
    if (!w) return absolutePath;
    if (absolutePath === w.projectRoot) return '.';
    const prefix = w.projectRoot + '/';
    if (absolutePath.startsWith(prefix)) return absolutePath.slice(prefix.length) || '.';
    return absolutePath;
  }

  list(): ProjectInfo[] {
    return Array.from(this.workspaces.values()).map(w => ({
      projectId: w.projectId,
      projectName: w.projectName,
      projectRoot: w.projectRoot,
      lastActivity: w.lastActivity,
      agentCount: w.agentCount,
      isPinned: w.pinned,
    }));
  }

  setPinned(projectId: string, value: boolean): void {
    const w = this.workspaces.get(projectId);
    if (w) w.pinned = value;
  }

  // The persisted shape for pinned projects (re-created via getOrCreate at boot).
  listPinned(): Array<{ projectId: string; projectRoot: string; projectName: string }> {
    return Array.from(this.workspaces.values())
      .filter(w => w.pinned)
      .map(w => ({ projectId: w.projectId, projectRoot: w.projectRoot, projectName: w.projectName }));
  }

  remove(projectId: string): void {
    const w = this.workspaces.get(projectId);
    if (!w) return;
    w.store.stopWatching();
    this.workspaces.delete(projectId);
  }

  dispose(): void {
    for (const w of this.workspaces.values()) w.store.stopWatching();
    this.workspaces.clear();
  }
}
