import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-pty avant tout import du module à tester
vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

// Mock os pour contrôler le shell de connexion résolu depuis /etc/passwd
vi.mock('os', () => ({
  userInfo: vi.fn(() => ({ shell: '/usr/bin/bash' })),
}));

import * as pty from 'node-pty';
import * as os from 'os';

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

  it('spawn() utilise le shell de connexion (/etc/passwd), pas /bin/sh hérité', async () => {
    // Régression : le serveur est lancé par un hook sous /bin/sh ; sans ce fix,
    // tty-manager spawnait /bin/sh (= bash mode POSIX) qui ignore ~/.bashrc.
    vi.mocked(os.userInfo).mockReturnValue({ shell: '/usr/bin/bash' } as ReturnType<typeof os.userInfo>);
    process.env.SHELL = '/bin/sh';
    const { ttyManager } = await import('./tty-manager.js');
    ttyManager.spawn('/tmp/test');
    expect(pty.spawn).toHaveBeenCalledWith('/usr/bin/bash', [], expect.any(Object));
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

  it('outputBuffer accumule les données PTY dès le spawn', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    const session = ttyManager.spawn('/tmp/test');
    expect(session.outputBuffer).toBe('');
    mockPty._listeners.data.forEach(cb => cb('$ prompt\r\n'));
    expect(session.outputBuffer).toBe('$ prompt\r\n');
  });

  it('outputBuffer est tronqué au-delà de la limite', async () => {
    const { ttyManager } = await import('./tty-manager.js');
    const session = ttyManager.spawn('/tmp/test');
    const big = 'x'.repeat(65 * 1024);
    mockPty._listeners.data.forEach(cb => cb(big));
    expect(session.outputBuffer.length).toBeLessThanOrEqual(64 * 1024);
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
