import { spawn } from 'node:child_process';
import { homedir, hostname, userInfo } from 'node:os';
import type { WebSocket } from 'ws';
import type { AppCatalog } from './apps.js';
import type { Config } from './config.js';
import type { NotificationDaemon } from './notifications.js';
import type { ClientMsg, ServerMsg } from './protocol.js';
import type { WindowProvider } from './providers/types.js';
import type { Terminals } from './terminals.js';

/** Above this much unsent data a viewer is lagging: drop its frames, resync later. */
const CONGESTED = 4 * 1024 * 1024;
const DEFAULT_NOTIFY_MS = 6000;

interface Viewer {
  ws: WebSocket;
  focus: number | null;
  stale: Set<number>;
}

/** Every browser tab sees the same session (like VNC); input from any of them drives it. */
export class Hub {
  private viewers = new Set<Viewer>();
  private notifyTimers = new Map<number, NodeJS.Timeout>();
  private lastCursor?: ServerMsg;

  constructor(
    private cfg: Config,
    private provider: WindowProvider,
    private terms: Terminals,
    private notes: NotificationDaemon,
    private apps: AppCatalog,
  ) {
    provider.on('surface', s => this.broadcast({ t: 'surface', s }));
    provider.on('surface-gone', id => this.broadcast({ t: 'surface-gone', id }));
    provider.on('activate', id => this.broadcast({ t: 'activate', id }));
    provider.on('bell', (id, percent) => this.broadcast({ t: 'bell', id, percent }));
    provider.on('cursor', c => {
      const msg: ServerMsg = { t: 'cursor', ...c };
      this.lastCursor = msg;
      this.broadcast(msg);
    });
    provider.on('frame', (frame: Buffer, id: number) => this.sendFrame(frame, id));

    terms.on('data', (id, data) => this.broadcast({ t: 'term-data', id, data }));
    terms.on('exit', id => this.broadcast({ t: 'term-exit', id }));

    notes.on('notify', n => {
      this.broadcast({ t: 'notify', n });
      clearTimeout(this.notifyTimers.get(n.id));
      const ms = n.timeout === -1 ? DEFAULT_NOTIFY_MS : n.timeout;
      if (ms > 0 && n.urgency < 2) this.notifyTimers.set(n.id, setTimeout(() => notes.closed(n.id, 1), ms));
    });
    notes.on('close', id => {
      clearTimeout(this.notifyTimers.get(id));
      this.notifyTimers.delete(id);
      this.broadcast({ t: 'notify-close', id });
    });

    setInterval(() => this.resync(), 250).unref();
  }

  attach(ws: WebSocket) {
    const v: Viewer = { ws, focus: null, stale: new Set() };
    this.viewers.add(v);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg: ClientMsg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      try { this.onMessage(v, msg); } catch (err) { console.error('[diorama] message failed', msg.t, err); }
    });
    ws.on('close', () => {
      this.viewers.delete(v);
      this.provider.releaseAll();
      this.updatePriority();
    });
  }

  private onMessage(v: Viewer, m: ClientMsg) {
    const p = this.provider;
    switch (m.t) {
      case 'hello': {
        p.setViewport(m.viewport.w, m.viewport.h);
        this.send(v, { t: 'hello', theme: this.cfg.theme, screen: p.screen, user: userInfo().username, host: hostname() });
        for (const s of p.surfaces()) this.send(v, { t: 'surface', s });
        for (const term of this.terms.list()) this.send(v, { t: 'term', term });
        if (this.lastCursor) this.send(v, this.lastCursor);
        p.requestFull();
        break;
      }
      case 'viewport': p.setViewport(m.w, m.h); break;
      case 'focus':
        v.focus = m.id;
        p.focus(m.id);
        this.updatePriority();
        break;
      case 'ptr': p.pointer(m.x, m.y); break;
      case 'btn': p.pointer(m.x, m.y); p.button(m.b, m.down); break;
      case 'wheel': {
        p.pointer(m.x, m.y);
        const click = (b: number, n: number) => { for (let i = 0; i < n; i++) { p.button(b, true); p.button(b, false); } };
        if (m.dy) click(m.dy > 0 ? 5 : 4, Math.min(10, Math.abs(m.dy)));
        if (m.dx) click(m.dx > 0 ? 7 : 6, Math.min(10, Math.abs(m.dx)));
        break;
      }
      case 'key': p.key(m.code, m.down); break;
      case 'release-all': p.releaseAll(); break;
      case 'close': p.close(m.id); break;
      case 'resize': p.resize(m.id, m.w, m.h); break;
      case 'launch': this.launch(v, m.app); break;
      case 'term-open': {
        const info = this.terms.open(m.cols, m.rows, m.cmd ? ['/bin/sh', '-c', m.cmd] : undefined);
        this.broadcast({ t: 'term', term: info });
        break;
      }
      case 'term-in': this.terms.write(m.id, m.data); break;
      case 'term-resize': this.terms.resize(m.id, m.cols, m.rows); break;
      case 'term-close': this.terms.close(m.id); break;
      case 'notify-action': this.notes.invoke(m.id, m.key); break;
      case 'notify-dismiss': this.notes.closed(m.id, 2); break;
    }
  }

  private launch(v: Viewer, id: string) {
    const app = this.apps.get(id);
    if (!app) return this.send(v, { t: 'error', message: `Unknown app: ${id}` });
    if (app.terminal) {
      const info = this.terms.open(100, 30, app.exec);
      this.broadcast({ t: 'term', term: info });
      return;
    }
    const [cmd, ...args] = app.exec;
    const child = spawn(cmd, args, { env: this.provider.env(), cwd: homedir(), detached: true, stdio: 'ignore' });
    child.on('error', err => this.send(v, { t: 'error', message: `Could not start ${app.name}: ${err.message}` }));
    child.unref();
  }

  private updatePriority() {
    const ids = new Set<number>();
    for (const v of this.viewers) if (v.focus !== null) ids.add(v.focus);
    this.provider.setPriority(ids);
  }

  private sendFrame(frame: Buffer, id: number) {
    for (const v of this.viewers) {
      if (v.ws.readyState !== v.ws.OPEN) continue;
      if (v.ws.bufferedAmount > CONGESTED || v.stale.has(id)) { v.stale.add(id); continue; }
      v.ws.send(frame, { binary: true });
    }
  }

  /** Once a lagging viewer has drained, re-send whole surfaces it missed tiles of. */
  private resync() {
    for (const v of this.viewers) {
      if (!v.stale.size || v.ws.bufferedAmount > CONGESTED / 4) continue;
      for (const id of v.stale) this.provider.requestFull(id);
      v.stale.clear();
    }
  }

  private send(v: Viewer, msg: ServerMsg) {
    if (v.ws.readyState === v.ws.OPEN) v.ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg) {
    const text = JSON.stringify(msg);
    for (const v of this.viewers) if (v.ws.readyState === v.ws.OPEN) v.ws.send(text);
  }
}
