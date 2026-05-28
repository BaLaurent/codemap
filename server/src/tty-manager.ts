import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import { randomUUID } from 'crypto';

export interface TtySessionInfo {
  ttyId: string;
  shell: string;
  cwd: string;
  title: string;
  createdAt: number;
}

export interface TtySession extends TtySessionInfo {
  pty: IPty;
}

let counter = 0;

class TtyManager {
  private sessions = new Map<string, TtySession>();

  spawn(cwd: string): TtySessionInfo {
    const ttyId = randomUUID();
    const shell = process.env.SHELL ?? '/bin/bash';
    counter++;
    const title = `TTY ${counter}`;
    const ptyProcess = spawn(shell, [], {
      name: 'xterm-256color',
      cwd,
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });
    const session: TtySession = { ttyId, pty: ptyProcess, shell, cwd, title, createdAt: Date.now() };
    this.sessions.set(ttyId, session);
    return { ttyId, shell, cwd, title, createdAt: session.createdAt };
  }

  get(ttyId: string): TtySession | undefined {
    return this.sessions.get(ttyId);
  }

  kill(ttyId: string): void {
    const session = this.sessions.get(ttyId);
    if (!session) return;
    session.pty.kill();
    this.sessions.delete(ttyId);
  }

  list(): TtySessionInfo[] {
    return [...this.sessions.values()].map(({ ttyId, shell, cwd, title, createdAt }) => ({
      ttyId, shell, cwd, title, createdAt,
    }));
  }
}

export const ttyManager = new TtyManager();
