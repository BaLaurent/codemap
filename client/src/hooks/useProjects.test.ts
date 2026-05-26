import { describe, it, expect } from 'vitest';
import { sortProjects } from './useProjects';
import { ProjectInfo } from '../types';

const p = (id: string, name: string, last: number): ProjectInfo =>
  ({ projectId: id, projectName: name, projectRoot: id, lastActivity: last, agentCount: 0 });

describe('sortProjects', () => {
  it('orders by lastActivity desc then name asc', () => {
    const out = sortProjects([p('1', 'beta', 10), p('2', 'alpha', 30), p('3', 'gamma', 30)]);
    expect(out.map(x => x.projectName)).toEqual(['alpha', 'gamma', 'beta']);
  });
});
