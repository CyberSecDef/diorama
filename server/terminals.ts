import { EventEmitter } from 'node:events';
import { homedir, userInfo } from 'node:os';
import pty from 'node-pty';
import type { TerminalInfo } from './protocol.js';

const BACKLOG = 256 * 1024;

interface Term {
  id: number;
  title: string;
  proc: pty.IPty;
  backlog: string;
}

/**
 * Server-owned PTYs. They outlive browser tabs: reload and you get the same
 * shells back with recent output replayed.
 *
 * Events: 'data' (id, data), 'exit' (id), 'title' (id, title)
 */
export class Terminals extends EventEmitter {
  private terms = new Map<number, Term>();
  private nextId = 1;

  constructor(private env: () => NodeJS.ProcessEnv) {
    super();
  }

  list(): TerminalInfo[] {
    return [...this.terms.values()].map(t => ({ id: t.id, title: t.title, backlog: t.backlog }));
  }

  open(cols: number, rows: number, cmd?: string[]): TerminalInfo {
    const shell = process.env.SHELL || userInfo().shell || '/bin/bash';
    const [file, args] = cmd?.length ? [cmd[0], cmd.slice(1)] : [shell, ['-l']];
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: clampDim(cols, 80), rows: clampDim(rows, 24),
      cwd: homedir(),
      env: { ...this.env(), TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
    });
    const t: Term = { id: this.nextId++, title: cmd?.[0] ?? shell.split('/').pop()!, proc, backlog: '' };
    this.terms.set(t.id, t);
    proc.onData(data => {
      t.backlog = (t.backlog + data).slice(-BACKLOG);
      this.emit('data', t.id, data);
    });
    proc.onExit(() => {
      this.terms.delete(t.id);
      this.emit('exit', t.id);
    });
    return { id: t.id, title: t.title };
  }

  write(id: number, data: string) {
    this.terms.get(id)?.proc.write(data);
  }

  resize(id: number, cols: number, rows: number) {
    try { this.terms.get(id)?.proc.resize(clampDim(cols, 80), clampDim(rows, 24)); } catch { /* exited */ }
  }

  setTitle(id: number, title: string) {
    const t = this.terms.get(id);
    if (t) t.title = title;
  }

  close(id: number) {
    this.terms.get(id)?.proc.kill();
  }

  killAll() {
    for (const t of this.terms.values()) t.proc.kill();
  }
}

function clampDim(v: number, dflt: number) {
  return Number.isFinite(v) && v > 1 ? Math.min(1000, Math.floor(v)) : dflt;
}
