import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import { randomUUID } from 'crypto';
import { userInfo } from 'os';

const OUTPUT_BUFFER_LIMIT = 64 * 1024; // 64 KB max replay buffer

// Le shell de connexion de l'utilisateur (champ /etc/passwd), pas process.env.SHELL :
// le serveur est démarré par un hook qui tourne sous /bin/sh, donc SHELL hérité vaut
// souvent "/bin/sh". Or /bin/sh = bash en mode POSIX → argv[0]="sh" → .bashrc ignoré
// (prompt nu, aucun alias). On résout depuis passwd pour obtenir le vrai bash/zsh.
function resolveLoginShell(): string {
  try {
    return userInfo().shell || process.env.SHELL || '/bin/bash';
  } catch {
    return process.env.SHELL || '/bin/bash';
  }
}

export interface TtySessionInfo {
  ttyId: string;
  shell: string;
  cwd: string;
  title: string;
  createdAt: number;
}

export interface TtySession extends TtySessionInfo {
  pty: IPty;
  outputBuffer: string;
}

class TtyManager {
  private sessions = new Map<string, TtySession>();
  private counter = 0;

  spawn(cwd: string): TtySession {
    const ttyId = randomUUID();
    const shell = resolveLoginShell();
    this.counter++;
    const title = `TTY ${this.counter}`;
    const ptyProcess = spawn(shell, [], {
      name: 'xterm-256color',
      cwd,
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });
    const session: TtySession = { ttyId, pty: ptyProcess, shell, cwd, title, createdAt: Date.now(), outputBuffer: '' };
    this.sessions.set(ttyId, session);
    // Buffer output so a WS that connects late can replay it
    ptyProcess.onData((data: string) => {
      session.outputBuffer += data;
      if (session.outputBuffer.length > OUTPUT_BUFFER_LIMIT) {
        session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_LIMIT);
      }
    });
    ptyProcess.onExit(() => { this.sessions.delete(ttyId); });
    return session;
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
