import { EventEmitter } from 'node:events';
import x11 from 'x11';
import sharp from 'sharp';
import type { SurfaceInfo, SurfaceKind } from '../../protocol.js';
import { FRAME_HEADER, FRAME_JPEG } from '../../protocol.js';
import type { WindowProvider } from '../types.js';
import type { Config } from '../../config.js';
import { XSession } from './session.js';
import { codeToKeycode } from './keymap.js';

const em = x11.eventMask;

// Core event codes
const MapNotify = 19, MapRequest = 20, ConfigureNotify = 22, ConfigureRequest = 23,
  UnmapNotify = 18, DestroyNotify = 17, PropertyNotify = 28, ClientMessage = 33;

/** Space between windows on the virtual screen. Menus and dialogs that spill
 * past their parent land here instead of on a neighbour's input area. */
const GAP = 160;
const MAX_INFLIGHT = 6;

const ATOMS = [
  'UTF8_STRING', 'WM_PROTOCOLS', 'WM_DELETE_WINDOW', 'WM_TAKE_FOCUS', 'WM_STATE', 'WM_CHANGE_STATE',
  'WM_TRANSIENT_FOR', 'WM_CLASS', 'WM_NAME',
  '_NET_SUPPORTED', '_NET_SUPPORTING_WM_CHECK', '_NET_WM_NAME', '_NET_ACTIVE_WINDOW', '_NET_CLIENT_LIST',
  '_NET_WM_STATE', '_NET_WM_STATE_FULLSCREEN', '_NET_WM_STATE_MAXIMIZED_VERT', '_NET_WM_STATE_MAXIMIZED_HORZ',
  '_NET_WM_STATE_MODAL', '_NET_CLOSE_WINDOW', '_NET_WM_WINDOW_TYPE', '_NET_WM_WINDOW_TYPE_DIALOG',
  '_NET_WM_WINDOW_TYPE_NORMAL', '_NET_WM_WINDOW_TYPE_UTILITY', '_NET_WM_WINDOW_TYPE_SPLASH',
  '_NET_WM_WINDOW_TYPE_DOCK', '_NET_WM_WINDOW_TYPE_DESKTOP', '_NET_WM_WINDOW_TYPE_NOTIFICATION',
  '_NET_WM_ICON', '_NET_FRAME_EXTENTS', '_NET_REQUEST_FRAME_EXTENTS', '_NET_WORKAREA',
  '_NET_NUMBER_OF_DESKTOPS', '_NET_CURRENT_DESKTOP', '_NET_DESKTOP_GEOMETRY', '_NET_WM_PID',
] as const;
type AtomName = typeof ATOMS[number];

interface Rect { x: number; y: number; w: number; h: number }

interface Win extends Rect {
  id: number;
  kind: SurfaceKind;
  parent: number | null;
  managed: boolean;
  mapped: boolean;
  title: string;
  appClass: string;
  icon?: string;
  protocols: Set<number>;
  damage?: number;
  dirty: Rect | null;
  inflight: boolean;
  lastSent: number;
  restore?: Rect;
  fullscreen: boolean;
  maximized: boolean;
}

export class LinuxProvider extends EventEmitter implements WindowProvider {
  readonly screen: { w: number; h: number };
  private session = new XSession();
  private X: any;
  private root = 0;
  private ext: Record<string, any> = {};
  private atoms = {} as Record<AtomName, number>;
  private wins = new Map<number, Win>();
  private priority = new Set<number>();
  private viewport = { w: 1600, h: 900 };
  private focused: number | null = null;
  private inflight = 0;
  private timer?: NodeJS.Timeout;
  private heldKeys = new Set<number>();
  private heldButtons = new Set<number>();
  private cursorCache = new Map<number, { url: string; hx: number; hy: number }>();
  private wmCheck = 0;

  constructor(private cfg: Config) {
    super();
    this.screen = { w: cfg.screen.width, h: cfg.screen.height };
  }

  env() {
    return this.session.env();
  }

  async start() {
    await this.session.start(this.cfg.display, this.screen.w, this.screen.h);
    // The x11 client reads XAUTHORITY from the environment when connecting.
    process.env.XAUTHORITY = this.session.xauthority;
    const display: any = await new Promise((resolve, reject) => {
      const client = x11.createClient({ display: this.session.display }, (err: any, d: any) => (err ? reject(err) : resolve(d)));
      client.on('error', (err: any) => this.onXError(err));
    });
    this.X = display.client;
    this.root = display.screen[0].root;
    this.X.on('event', (ev: any) => this.onEvent(ev));

    for (const name of ['composite', 'damage', 'xtest', 'xkb', 'fixes']) {
      this.ext[name] = await this.req<any>(cb => this.X.require(name, cb));
    }
    await Promise.all(ATOMS.map(async a => { this.atoms[a] = await this.req<number>(cb => this.X.InternAtom(false, a, cb)); }));

    // Every top-level window renders into its own off-screen pixmap, so a
    // window's pixels can be read even where another window covers it.
    this.ext.composite.RedirectSubwindows(this.root, this.ext.composite.Redirect.Automatic);

    await new Promise<void>((resolve, reject) => {
      this.X.ChangeWindowAttributes(this.root, {
        eventMask: em.SubstructureRedirect | em.SubstructureNotify | em.PropertyChange,
      }, (err: any) => (err ? reject(new Error('another window manager owns this display')) : resolve()));
      this.X.GetInputFocus(() => resolve());
    });

    this.setupEwmh();
    const xkb = this.ext.xkb;
    xkb.SelectEvents(xkb.UseCoreKbd, xkb.EventType.BellNotify, 0, xkb.EventType.BellNotify, 0, 0);
    this.ext.fixes.SelectCursorInput(this.root, this.ext.fixes.CursorNotifyMask.DisplayCursor);

    const tickMs = Math.max(5, Math.floor(1000 / this.cfg.capture.focusedFps / 2));
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  stop() {
    clearInterval(this.timer);
    try { this.X?.terminate?.(); } catch { /* already gone */ }
    this.session.stop();
  }

  surfaces(): SurfaceInfo[] {
    return [...this.wins.values()].filter(w => w.mapped).map(w => this.info(w));
  }

  // ── EWMH ────────────────────────────────────────────────────────────────

  private setupEwmh() {
    const X = this.X, a = this.atoms;
    this.wmCheck = X.AllocID();
    X.CreateWindow(this.wmCheck, this.root, -10, -10, 1, 1, 0, 0, 0, 0, {});
    for (const w of [this.root, this.wmCheck]) X.ChangeProperty(0, w, a._NET_SUPPORTING_WM_CHECK, X.atoms.WINDOW, 32, [this.wmCheck]);
    X.ChangeProperty(0, this.wmCheck, a._NET_WM_NAME, a.UTF8_STRING, 8, 'Diorama');
    // Deliberately not advertising _NET_WM_STATE_FOCUSED or _NET_WM_MOVERESIZE:
    // without them GTK falls back to plain focus events and its own moves.
    const supported: AtomName[] = [
      '_NET_SUPPORTED', '_NET_SUPPORTING_WM_CHECK', '_NET_WM_NAME', '_NET_ACTIVE_WINDOW', '_NET_CLIENT_LIST',
      '_NET_WM_STATE', '_NET_WM_STATE_FULLSCREEN', '_NET_WM_STATE_MAXIMIZED_VERT', '_NET_WM_STATE_MAXIMIZED_HORZ',
      '_NET_CLOSE_WINDOW', '_NET_WM_WINDOW_TYPE', '_NET_WM_WINDOW_TYPE_DIALOG', '_NET_WM_WINDOW_TYPE_NORMAL',
      '_NET_WM_ICON', '_NET_FRAME_EXTENTS', '_NET_REQUEST_FRAME_EXTENTS', '_NET_WORKAREA',
      '_NET_NUMBER_OF_DESKTOPS', '_NET_CURRENT_DESKTOP', '_NET_DESKTOP_GEOMETRY',
    ];
    X.ChangeProperty(0, this.root, a._NET_SUPPORTED, X.atoms.ATOM, 32, supported.map(n => a[n]));
    X.ChangeProperty(0, this.root, a._NET_NUMBER_OF_DESKTOPS, X.atoms.CARDINAL, 32, [1]);
    X.ChangeProperty(0, this.root, a._NET_CURRENT_DESKTOP, X.atoms.CARDINAL, 32, [0]);
    X.ChangeProperty(0, this.root, a._NET_DESKTOP_GEOMETRY, X.atoms.CARDINAL, 32, [this.screen.w, this.screen.h]);
    this.updateWorkarea();
  }

  private updateWorkarea() {
    // Apps size "maximized" and first-run windows from the workarea; keep it at
    // what the browser can actually show instead of the huge virtual screen.
    this.X.ChangeProperty(0, this.root, this.atoms._NET_WORKAREA, this.X.atoms.CARDINAL, 32,
      [0, 0, this.viewport.w, this.viewport.h]);
  }

  private updateClientList() {
    const ids = [...this.wins.values()].filter(w => w.managed && w.mapped).map(w => w.id);
    this.X.ChangeProperty(0, this.root, this.atoms._NET_CLIENT_LIST, this.X.atoms.WINDOW, 32, ids);
  }

  // ── Events ──────────────────────────────────────────────────────────────

  private onXError(err: any) {
    // BadWindow/BadDrawable/BadDamage races are routine: windows vanish while
    // requests about them are in flight.
    if ([3, 9].includes(err?.error)) return;
    if (process.env.DIORAMA_DEBUG) console.warn('[x11]', err?.message ?? err);
  }

  private onEvent(ev: any) {
    switch (ev.name === 'DamageNotify' || ev.name === 'XkbBellNotify' || ev.name === 'CursorNotify' ? ev.name : ev.type) {
      case MapRequest: void this.manage(ev.wid); break;
      case ConfigureRequest: this.onConfigureRequest(ev); break;
      case MapNotify: void this.onMapNotify(ev.wid, ev.overrideRedirect); break;
      case UnmapNotify: this.onUnmap(ev.wid); break;
      case DestroyNotify: this.onUnmap(ev.wid, true); break;
      case ConfigureNotify: this.onConfigureNotify(ev); break;
      case PropertyNotify: void this.onProperty(ev.wid, ev.atom); break;
      case ClientMessage: this.onClientMessage(ev); break;
      case 'DamageNotify': {
        const w = this.wins.get(ev.drawable);
        if (w) w.dirty = union(w.dirty, { x: ev.area.x, y: ev.area.y, w: ev.area.w, h: ev.area.h });
        break;
      }
      case 'XkbBellNotify':
        this.emit('bell', this.wins.has(ev.window) ? this.topOf(ev.window) : this.focused, ev.percent);
        break;
      case 'CursorNotify': void this.updateCursor(); break;
    }
  }

  private async manage(wid: number) {
    if (this.wins.has(wid)) { this.X.MapWindow(wid); return; }
    const X = this.X, a = this.atoms;
    try {
      const [geom, transientFor, types, protocols, state] = await Promise.all([
        this.req<any>(cb => X.GetGeometry(wid, cb)),
        this.cardinals(wid, X.atoms.WM_TRANSIENT_FOR),
        this.cardinals(wid, a._NET_WM_WINDOW_TYPE),
        this.cardinals(wid, a.WM_PROTOCOLS),
        this.cardinals(wid, a._NET_WM_STATE),
      ]);
      const parentId = transientFor[0] && this.wins.has(transientFor[0]) ? this.topOf(transientFor[0]) : null;
      const isDialog = parentId !== null || types.includes(a._NET_WM_WINDOW_TYPE_DIALOG);
      const w: Win = {
        id: wid, kind: isDialog && parentId !== null ? 'dialog' : 'window', parent: isDialog ? parentId : null,
        managed: true, mapped: false, x: 0, y: 0, ...this.clampSize(geom.width, geom.height),
        title: '', appClass: '', protocols: new Set(protocols), dirty: null, inflight: false, lastSent: 0,
        fullscreen: false, maximized: false,
      };
      if (w.parent !== null) {
        const p = this.wins.get(w.parent)!;
        w.x = p.x + Math.round((p.w - w.w) / 2);
        w.y = p.y + Math.round((p.h - w.h) / 3);
      } else {
        Object.assign(w, this.place(w.w, w.h, wid));
      }
      this.wins.set(wid, w);
      X.ChangeWindowAttributes(wid, { eventMask: em.PropertyChange });
      X.ConfigureWindow(wid, { x: w.x, y: w.y, width: w.w, height: w.h, borderWidth: 0 });
      X.ChangeProperty(0, wid, a._NET_FRAME_EXTENTS, X.atoms.CARDINAL, 32, [0, 0, 0, 0]);
      X.ChangeProperty(0, wid, a.WM_STATE, a.WM_STATE, 32, [1, 0]);
      await this.readTitle(w);
      if (state.includes(a._NET_WM_STATE_FULLSCREEN)) this.setFullscreen(w, true);
      X.MapWindow(wid);
      void this.readIcon(w);
    } catch (err) {
      debug('manage', err);
      this.wins.delete(wid);
    }
  }

  private async onMapNotify(wid: number, overrideRedirect: boolean) {
    let w = this.wins.get(wid);
    if (!w && overrideRedirect) {
      // Menus, tooltips, dropdowns: not managed, drawn on top of their owner.
      try {
        const geom = await this.req<any>(cb => this.X.GetGeometry(wid, cb));
        if (geom.width <= 2 || geom.height <= 2) return;
        if (geom.xPos + geom.width <= 0 || geom.yPos + geom.height <= 0) return;
        const transientFor = await this.cardinals(wid, this.X.atoms.WM_TRANSIENT_FOR);
        const parent = this.popupParent(transientFor[0], geom.xPos, geom.yPos);
        w = {
          id: wid, kind: 'popup', parent, managed: false, mapped: false,
          x: geom.xPos, y: geom.yPos, w: geom.width, h: geom.height,
          title: '', appClass: '', protocols: new Set(), dirty: null, inflight: false, lastSent: 0,
          fullscreen: false, maximized: false,
        };
        this.wins.set(wid, w);
      } catch { return; }
    }
    if (!w || w.mapped) return;
    w.mapped = true;
    w.damage = this.X.AllocID();
    this.ext.damage.Create(w.damage, wid, this.ext.damage.ReportLevel.RawRectangles);
    w.dirty = { x: 0, y: 0, w: w.w, h: w.h };
    if (w.managed) this.updateClientList();
    this.emit('surface', this.info(w));
    if (w.managed && w.kind === 'dialog') this.focus(w.id);
  }

  private onUnmap(wid: number, destroyed = false) {
    const w = this.wins.get(wid);
    if (!w) return;
    if (w.damage && !destroyed) this.ext.damage.Destroy(w.damage);
    this.wins.delete(wid);
    if (w.mapped) this.emit('surface-gone', wid);
    if (w.managed) {
      this.updateClientList();
      if (!destroyed) this.X.ChangeProperty(0, wid, this.atoms.WM_STATE, this.atoms.WM_STATE, 32, [0, 0]);
    }
    // Orphaned children (an app closing its main window first) go with it.
    for (const c of this.wins.values()) if (c.parent === wid) { c.parent = null; if (c.kind === 'popup') this.onUnmap(c.id); }
    if (this.focused === wid) this.focused = null;
  }

  private onConfigureRequest(ev: any) {
    const w = this.wins.get(ev.wid);
    const CWX = 1, CWY = 2, CWWidth = 4, CWHeight = 8;
    if (!w) {
      // Not managed yet (pre-map): let the app do what it wants.
      const v: any = {};
      if (ev.mask & CWX) v.x = ev.x;
      if (ev.mask & CWY) v.y = ev.y;
      if (ev.mask & CWWidth) v.width = ev.width;
      if (ev.mask & CWHeight) v.height = ev.height;
      this.X.ConfigureWindow(ev.wid, v);
      return;
    }
    const size = this.clampSize(ev.mask & CWWidth ? ev.width : w.w, ev.mask & CWHeight ? ev.height : w.h);
    let { x, y } = w;
    if (w.parent !== null && ev.mask & (CWX | CWY)) {
      // Dialogs may position themselves (usually relative to their parent).
      if (ev.mask & CWX) x = ev.x;
      if (ev.mask & CWY) y = ev.y;
    } else if (w.parent === null && this.overlaps({ x, y, ...size }, w.id)) {
      ({ x, y } = this.place(size.w, size.h, w.id));
    }
    this.X.ConfigureWindow(w.id, { x, y, width: size.w, height: size.h });
    if (x === w.x && y === w.y && size.w === w.w && size.h === w.h) this.sendSyntheticConfigure(w);
  }

  private onConfigureNotify(ev: any) {
    const wid = ev.wid1;
    const w = this.wins.get(wid);
    if (!w) return;
    const resized = ev.width !== w.w || ev.height !== w.h;
    const moved = ev.x !== w.x || ev.y !== w.y;
    if (!resized && !moved) return;
    const dx = ev.x - w.x, dy = ev.y - w.y;
    Object.assign(w, { x: ev.x, y: ev.y, w: ev.width, h: ev.height });
    if (resized) w.dirty = { x: 0, y: 0, w: w.w, h: w.h };
    // Dialogs ride along when their parent is moved by the layout.
    if (moved && w.managed && w.parent === null) {
      for (const c of this.wins.values()) {
        if (c.parent === w.id && c.managed) this.X.ConfigureWindow(c.id, { x: c.x + dx, y: c.y + dy });
      }
    }
    if (w.mapped) this.emit('surface', this.info(w));
  }

  private async onProperty(wid: number, atom: number) {
    const w = this.wins.get(wid);
    if (!w || !w.managed) return;
    const a = this.atoms;
    if (atom === a._NET_WM_NAME || atom === this.X.atoms.WM_NAME) {
      await this.readTitle(w);
      if (w.mapped) this.emit('surface', this.info(w));
    } else if (atom === a._NET_WM_ICON) {
      void this.readIcon(w);
    } else if (atom === a.WM_PROTOCOLS) {
      w.protocols = new Set(await this.cardinals(wid, a.WM_PROTOCOLS));
    }
  }

  private onClientMessage(ev: any) {
    const a = this.atoms;
    const w = this.wins.get(ev.wid);
    if (ev.message_type === a._NET_ACTIVE_WINDOW && w) {
      this.emit('activate', this.topOf(w.id));
    } else if (ev.message_type === a._NET_CLOSE_WINDOW && w) {
      this.close(w.id);
    } else if (ev.message_type === a._NET_REQUEST_FRAME_EXTENTS) {
      this.X.ChangeProperty(0, ev.wid, a._NET_FRAME_EXTENTS, this.X.atoms.CARDINAL, 32, [0, 0, 0, 0]);
    } else if (ev.message_type === a._NET_WM_STATE && w) {
      const [action, p1, p2] = ev.data as number[];
      const props = [p1, p2];
      const apply = (cur: boolean) => (action === 2 ? !cur : action === 1);
      if (props.includes(a._NET_WM_STATE_FULLSCREEN)) this.setFullscreen(w, apply(w.fullscreen));
      else if (props.includes(a._NET_WM_STATE_MAXIMIZED_HORZ) || props.includes(a._NET_WM_STATE_MAXIMIZED_VERT)) {
        this.setMaximized(w, apply(w.maximized));
      }
    }
  }

  // ── Window state ────────────────────────────────────────────────────────

  private setFullscreen(w: Win, on: boolean) {
    this.setBig(w, on, 'fullscreen');
  }

  private setMaximized(w: Win, on: boolean) {
    this.setBig(w, on, 'maximized');
  }

  /** Fullscreen and maximize both mean "fill the browser viewport" here. */
  private setBig(w: Win, on: boolean, which: 'fullscreen' | 'maximized') {
    if (w[which] === on) return;
    const wasBig = w.fullscreen || w.maximized;
    w[which] = on;
    const isBig = w.fullscreen || w.maximized;
    if (isBig && !wasBig) w.restore = { x: w.x, y: w.y, w: w.w, h: w.h };
    const size = isBig ? { w: this.viewport.w, h: this.viewport.h } : (w.restore ?? { w: w.w, h: w.h });
    let { x, y } = w;
    if (w.parent === null && this.overlaps({ x, y, ...size }, w.id)) ({ x, y } = this.place(size.w, size.h, w.id));
    this.X.ConfigureWindow(w.id, { x, y, width: size.w, height: size.h });
    const a = this.atoms;
    const state = [
      ...(w.fullscreen ? [a._NET_WM_STATE_FULLSCREEN] : []),
      ...(w.maximized ? [a._NET_WM_STATE_MAXIMIZED_HORZ, a._NET_WM_STATE_MAXIMIZED_VERT] : []),
    ];
    this.X.ChangeProperty(0, w.id, a._NET_WM_STATE, this.X.atoms.ATOM, 32, state);
  }

  private clampSize(w: number, h: number) {
    return {
      w: Math.max(1, Math.min(w, this.viewport.w, this.screen.w - 2 * GAP)),
      h: Math.max(1, Math.min(h, this.viewport.h, this.screen.h - 2 * GAP)),
    };
  }

  /** First-fit placement on the virtual screen so top-level windows never overlap. */
  private place(w: number, h: number, self: number): { x: number; y: number } {
    const others = [...this.wins.values()].filter(o => o.managed && o.parent === null && o.id !== self);
    const candidates = [{ x: GAP, y: GAP }];
    for (const o of others) candidates.push({ x: o.x + o.w + GAP, y: o.y }, { x: GAP, y: o.y + o.h + GAP });
    candidates.sort((p, q) => p.y - q.y || p.x - q.x);
    for (const c of candidates) {
      if (c.x + w > this.screen.w - GAP || c.y + h > this.screen.h - GAP) continue;
      if (!this.overlaps({ ...c, w, h }, self)) return c;
    }
    return { x: GAP, y: GAP };
  }

  private overlaps(r: Rect, self: number) {
    for (const o of this.wins.values()) {
      if (!o.managed || o.parent !== null || o.id === self) continue;
      if (r.x < o.x + o.w + GAP && o.x < r.x + r.w + GAP && r.y < o.y + o.h + GAP && o.y < r.y + r.h + GAP) return true;
    }
    return false;
  }

  private topOf(id: number): number {
    let w = this.wins.get(id);
    while (w && w.parent !== null && this.wins.has(w.parent)) w = this.wins.get(w.parent);
    return w ? w.id : id;
  }

  private popupParent(transientFor: number | undefined, x: number, y: number): number | null {
    if (transientFor && this.wins.has(transientFor)) return this.topOf(transientFor);
    for (const w of this.wins.values()) {
      if (w.managed && w.mapped && w.parent === null && x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return w.id;
    }
    return this.focused;
  }

  private sendSyntheticConfigure(w: Win) {
    this.X.SendEvent(w.id, 0, em.StructureNotify, {
      name: 'ConfigureNotify', wid: w.id, wid1: w.id, aboveSibling: 0,
      x: w.x, y: w.y, width: w.w, height: w.h, borderWidth: 0, overrideRedirect: 0,
    });
  }

  private info(w: Win): SurfaceInfo {
    return {
      id: w.id, kind: w.kind, parent: w.parent, x: w.x, y: w.y, w: w.w, h: w.h,
      title: w.title, appClass: w.appClass, icon: w.icon, fullscreen: w.fullscreen,
    };
  }

  // ── Properties ──────────────────────────────────────────────────────────

  private async prop(wid: number, atom: number, type = 0, longs = 1 << 20) {
    return this.req<any>(cb => this.X.GetProperty(0, wid, atom, type, 0, longs, cb));
  }

  private async cardinals(wid: number, atom: number): Promise<number[]> {
    try {
      const p = await this.prop(wid, atom, 0, 64);
      if (p.format !== 32) return [];
      const out: number[] = [];
      for (let i = 0; i + 4 <= p.data.length; i += 4) out.push(p.data.readUInt32LE(i));
      return out;
    } catch { return []; }
  }

  private async readTitle(w: Win) {
    try {
      const [net, legacy, cls] = await Promise.all([
        this.prop(w.id, this.atoms._NET_WM_NAME, this.atoms.UTF8_STRING, 1024),
        this.prop(w.id, this.X.atoms.WM_NAME, 0, 1024),
        this.prop(w.id, this.X.atoms.WM_CLASS, 0, 256),
      ]);
      w.title = net.data.length ? net.data.toString('utf8') : legacy.data.toString('latin1');
      const parts = cls.data.toString('latin1').split('\0');
      w.appClass = parts[1] || parts[0] || '';
    } catch (err) { debug('readTitle', err); }
  }

  private async readIcon(w: Win) {
    try {
      const p = await this.prop(w.id, this.atoms._NET_WM_ICON, this.X.atoms.CARDINAL);
      const d: Buffer = p.data;
      // Several sizes back to back: [w, h, w*h ARGB pixels]... pick the one closest to 64.
      let best: { off: number; w: number; h: number } | null = null;
      for (let off = 0; off + 8 <= d.length;) {
        const iw = d.readUInt32LE(off), ih = d.readUInt32LE(off + 4);
        if (!iw || !ih || off + 8 + iw * ih * 4 > d.length) break;
        if (!best || Math.abs(iw - 64) < Math.abs(best.w - 64)) best = { off: off + 8, w: iw, h: ih };
        off += 8 + iw * ih * 4;
      }
      if (!best) return;
      const rgba = Buffer.alloc(best.w * best.h * 4);
      for (let i = 0; i < best.w * best.h; i++) {
        const argb = d.readUInt32LE(best.off + i * 4);
        rgba[i * 4] = (argb >> 16) & 255; rgba[i * 4 + 1] = (argb >> 8) & 255;
        rgba[i * 4 + 2] = argb & 255; rgba[i * 4 + 3] = (argb >>> 24) & 255;
      }
      const png = await sharp(rgba, { raw: { width: best.w, height: best.h, channels: 4 } }).resize(64, 64).png().toBuffer();
      w.icon = `data:image/png;base64,${png.toString('base64')}`;
      if (w.mapped && this.wins.has(w.id)) this.emit('surface', this.info(w));
    } catch (err) { debug('readIcon', err); }
  }

  private async updateCursor() {
    try {
      const c = await this.req<any>(cb => this.ext.fixes.GetCursorImage(cb));
      let entry = this.cursorCache.get(c.cursorSerial);
      if (!entry) {
        const px = c.width * c.height;
        const rgba = Buffer.alloc(px * 4);
        for (let i = 0; i < px; i++) {
          const argb = c.cursorImage.readUInt32LE(i * 4);
          const alpha = (argb >>> 24) & 255;
          const un = (v: number) => (alpha ? Math.min(255, Math.round((v * 255) / alpha)) : 0);
          rgba[i * 4] = un((argb >> 16) & 255); rgba[i * 4 + 1] = un((argb >> 8) & 255);
          rgba[i * 4 + 2] = un(argb & 255); rgba[i * 4 + 3] = alpha;
        }
        const png = await sharp(rgba, { raw: { width: c.width, height: c.height, channels: 4 } }).png().toBuffer();
        entry = { url: `data:image/png;base64,${png.toString('base64')}`, hx: c.xhot, hy: c.yhot };
        this.cursorCache.set(c.cursorSerial, entry);
      }
      this.emit('cursor', entry);
    } catch (err) { debug('cursor', err); }
  }

  // ── Capture ─────────────────────────────────────────────────────────────

  setPriority(ids: Set<number>) {
    this.priority = ids;
  }

  requestFull(id?: number) {
    for (const w of this.wins.values()) {
      if (w.mapped && (id === undefined || w.id === id)) w.dirty = { x: 0, y: 0, w: w.w, h: w.h };
    }
  }

  private tick() {
    const now = Date.now();
    for (const w of this.wins.values()) {
      if (this.inflight >= MAX_INFLIGHT) return;
      if (!w.mapped || !w.dirty || w.inflight) continue;
      const fps = this.priority.has(this.topOf(w.id)) ? this.cfg.capture.focusedFps : this.cfg.capture.backgroundFps;
      if (now - w.lastSent < 1000 / fps) continue;
      void this.capture(w);
    }
  }

  private async capture(w: Win) {
    let r = clip(w.dirty!, { x: 0, y: 0, w: w.w, h: w.h });
    w.dirty = null;
    if (!r) return;
    // Lots of small damage: one full frame is cheaper than a big partial one.
    if (r.w * r.h > 0.6 * w.w * w.h) r = { x: 0, y: 0, w: w.w, h: w.h };
    w.inflight = true;
    this.inflight++;
    const surfW = w.w, surfH = w.h;
    try {
      const img = await this.req<any>(cb => this.X.GetImage(2, w.id, r.x, r.y, r.w, r.h, 0xffffffff, cb));
      const src: Buffer = img.data;
      const bpp = src.length / (r.w * r.h);
      if (bpp !== 4) throw new Error(`unsupported pixel format (${bpp} bytes/pixel)`);
      const rgb = Buffer.allocUnsafe(r.w * r.h * 3);
      for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
        rgb[j] = src[i + 2]; rgb[j + 1] = src[i + 1]; rgb[j + 2] = src[i];
      }
      const jpeg = await sharp(rgb, { raw: { width: r.w, height: r.h, channels: 3 } })
        .jpeg({ quality: this.cfg.capture.jpegQuality, chromaSubsampling: '4:4:4', mozjpeg: false })
        .toBuffer();
      if (!this.wins.has(w.id)) return;
      const frame = Buffer.allocUnsafe(FRAME_HEADER + jpeg.length);
      frame.writeUInt8(FRAME_JPEG, 0);
      frame.writeUInt32LE(w.id, 1);
      frame.writeUInt16LE(r.x, 5); frame.writeUInt16LE(r.y, 7);
      frame.writeUInt16LE(r.w, 9); frame.writeUInt16LE(r.h, 11);
      frame.writeUInt16LE(surfW, 13); frame.writeUInt16LE(surfH, 15);
      jpeg.copy(frame, FRAME_HEADER);
      this.emit('frame', frame, w.id);
    } catch (err) {
      // Window resized or vanished mid-capture; damage will bring us back.
      debug('capture', err);
    } finally {
      w.inflight = false;
      w.lastSent = Date.now();
      this.inflight--;
    }
  }

  // ── Control & input ─────────────────────────────────────────────────────

  setViewport(w: number, h: number) {
    this.viewport = { w: Math.max(320, Math.round(w)), h: Math.max(240, Math.round(h)) };
    this.updateWorkarea();
    for (const win of this.wins.values()) {
      if (win.fullscreen || win.maximized) this.X.ConfigureWindow(win.id, { width: this.viewport.w, height: this.viewport.h });
    }
  }

  focus(id: number | null) {
    const a = this.atoms;
    if (id === null || !this.wins.has(id)) {
      this.focused = null;
      this.X.SetInputFocus(this.root, 1);
      this.X.ChangeProperty(0, this.root, a._NET_ACTIVE_WINDOW, this.X.atoms.WINDOW, 32, [0]);
      return;
    }
    const top = this.topOf(id);
    // A modal dialog keeps the keyboard while it is up.
    const dialog = [...this.wins.values()].find(c => c.parent === top && c.kind === 'dialog' && c.mapped);
    const target = this.wins.get(dialog?.id ?? top)!;
    this.focused = top;
    this.X.RaiseWindow(top);
    for (const c of this.wins.values()) if (c.parent === top && c.managed) this.X.RaiseWindow(c.id);
    this.X.SetInputFocus(target.id, 2);
    if (target.protocols.has(a.WM_TAKE_FOCUS)) {
      this.X.SendClientMessage(target.id, target.id, a.WM_PROTOCOLS, 32, [a.WM_TAKE_FOCUS, 0], 0);
    }
    this.X.ChangeProperty(0, this.root, a._NET_ACTIVE_WINDOW, this.X.atoms.WINDOW, 32, [target.id]);
  }

  close(id: number) {
    const w = this.wins.get(id);
    if (!w) return;
    const a = this.atoms;
    if (w.protocols.has(a.WM_DELETE_WINDOW)) {
      this.X.SendClientMessage(w.id, w.id, a.WM_PROTOCOLS, 32, [a.WM_DELETE_WINDOW, 0], 0);
    } else {
      this.X.KillClient(w.id);
    }
  }

  resize(id: number, width: number, height: number) {
    const w = this.wins.get(id);
    if (!w || !w.managed) return;
    const size = this.clampSize(Math.round(width), Math.round(height));
    let { x, y } = w;
    if (w.parent === null && this.overlaps({ x, y, ...size }, w.id)) ({ x, y } = this.place(size.w, size.h, w.id));
    this.X.ConfigureWindow(w.id, { x, y, width: size.w, height: size.h });
  }

  pointer(x: number, y: number) {
    const t = this.ext.xtest;
    t.FakeInput(t.MotionNotify, 0, 0, this.root, clampInt(x, 0, this.screen.w - 1), clampInt(y, 0, this.screen.h - 1));
  }

  button(b: number, down: boolean) {
    const t = this.ext.xtest;
    if (down) this.heldButtons.add(b); else this.heldButtons.delete(b);
    t.FakeInput(down ? t.ButtonPress : t.ButtonRelease, b, 0, this.root, 0, 0);
  }

  key(code: string, down: boolean) {
    const kc = codeToKeycode(code);
    if (kc === undefined) return;
    const t = this.ext.xtest;
    if (down) this.heldKeys.add(kc); else this.heldKeys.delete(kc);
    t.FakeInput(down ? t.KeyPress : t.KeyRelease, kc, 0, this.root, 0, 0);
  }

  releaseAll() {
    const t = this.ext.xtest;
    for (const kc of this.heldKeys) t.FakeInput(t.KeyRelease, kc, 0, this.root, 0, 0);
    for (const b of this.heldButtons) t.FakeInput(t.ButtonRelease, b, 0, this.root, 0, 0);
    this.heldKeys.clear();
    this.heldButtons.clear();
  }

  private req<T>(fn: (cb: (err: any, res: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => fn((err, res) => (err ? reject(err) : resolve(res))));
  }
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function clip(r: Rect, bounds: Rect): Rect | null {
  const x = Math.max(r.x, bounds.x), y = Math.max(r.y, bounds.y);
  const w = Math.min(r.x + r.w, bounds.x + bounds.w) - x, h = Math.min(r.y + r.h, bounds.y + bounds.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function debug(what: string, err: unknown) {
  if (process.env.DIORAMA_DEBUG) console.warn(`[diorama:x11] ${what}:`, err);
}
