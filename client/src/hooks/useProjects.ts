import { useEffect, useRef, MutableRefObject } from 'react';
import { ProjectInfo } from '../types';

const API_URL = 'http://localhost:5174/api';

export function sortProjects(list: ProjectInfo[]): ProjectInfo[] {
  return [...list].sort((a, b) =>
    b.lastActivity - a.lastActivity || a.projectName.localeCompare(b.projectName));
}

// Polls /api/projects. Stores into a ref + bumps a version ref so the canvas
// loop can read without forcing React re-renders (matches useFileActivity style).
export function useProjects(): {
  projectsRef: MutableRefObject<ProjectInfo[]>;
  versionRef: MutableRefObject<number>;
} {
  const projectsRef = useRef<ProjectInfo[]>([]);
  const versionRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const fetchProjects = () => {
      fetch(`${API_URL}/projects`)
        .then(r => r.json())
        .then((data: ProjectInfo[]) => {
          if (!alive) return;
          const sorted = sortProjects(data);
          if (JSON.stringify(sorted) !== JSON.stringify(projectsRef.current)) {
            projectsRef.current = sorted;
            versionRef.current++;
          }
        })
        .catch(() => {});
    };
    fetchProjects();
    const id = setInterval(fetchProjects, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { projectsRef, versionRef };
}
