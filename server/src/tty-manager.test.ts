import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-pty avant tout import du module à tester
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

import * as pty from 'node-pty';

function makeMockPty() {
  const listeners: { data: Array<(d: string) => void>; exit: Array<(e: { exitCode: number }) => void> } = { data: [], exit: [] };
  return {
    onData: vi.fn((cb: (d: string) => void) => { listeners.data.push(cb); return { dispose: vi.fn() }; }),
    onExit: vi.fn((cb: (e: { exitCode: number }) => void) => { listeners.exit.push(cb); return { dispose: vi.fn() }; }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    _listeners: listeners,
  };
}

describe('TtyManager', () => {
  let mockPty: ReturnType<typeof makeMockPty>;

  beforeEach(async () => {
    mockPty = makeMockPty();
    vi.mocked(pty.spawn).mockReturnValue(mockPty as unknown as pty.IPty);
    vi.resetModules();
  });

  it('spawn() crée une session et la retourne', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    const info = ttyManager.spawn('/tmp/test');
    expect(info.ttyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(info.cwd).toBe('/tmp/test');
    expect(info.title).toMatch(/^TTY \d+$/);
    expect(info.shell).toMatch(/bash|zsh|sh/);
  });

  it('list() retourne les sessions actives', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    ttyManager.spawn('/tmp/a');
    ttyManager.spawn('/tmp/b');
    expect(ttyManager.list().length).toBe(2);
  });

  it('get() retrouve la session par id', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    const { ttyId } = ttyManager.spawn('/tmp/test');
    const session = ttyManager.get(ttyId);
    expect(session).toBeDefined();
    expect(session!.ttyId).toBe(ttyId);
  });

  it('get() retourne undefined pour un id inconnu', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    expect(ttyManager.get('no-such-id')).toBeUndefined();
  });

  it('kill() supprime la session et appelle pty.kill()', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    const { ttyId } = ttyManager.spawn('/tmp/test');
    ttyManager.kill(ttyId);
    expect(mockPty.kill).toHaveBeenCalled();
    expect(ttyManager.get(ttyId)).toBeUndefined();
  });

  it('kill() est idempotent pour un id inconnu', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    expect(() => ttyManager.kill('ghost-id')).not.toThrow();
  });

  it('exit naturel du shell supprime la session du manager', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    const { ttyId } = ttyManager.spawn('/tmp/test');
    expect(ttyManager.get(ttyId)).toBeDefined();
    // Simuler la fin naturelle du processus
    mockPty._listeners.exit.forEach(cb => cb({ exitCode: 0 }));
    expect(ttyManager.get(ttyId)).toBeUndefined();
  });
});
