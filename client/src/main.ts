import '@xterm/xterm/css/xterm.css';
import './style.css';
import type { SurfaceInfo } from '../../server/protocol';
import { bell, chime } from './audio';
import { FocusOverlay, isWorldHotkey } from './focus';
import { Hud } from './hud';
import { Net } from './net';
import { NativeSurface, NativeWin, TerminalWin, type Win } from './windows';
import { World } from './world';
import { BUILTIN_THEMES } from './theme';

const world = new World(document.getElementById('world') as HTMLCanvasElement);
const net = new Net(() => ({ t: 'hello', viewport: FocusOverlay.available() }));
const overlay = new FocusOverlay(m => net.send(m));
// Handy in the devtools console when writing themes.
(window as any).diorama = { world };

const wins = new Map<string, Win>();
/** Every X surface id -> the top-level window it belongs to (and its own surface). */
const surfaces = new Map<number, { win: NativeWin; surface: NativeSurface }>();
let focusedKey: string | null = null;
let focusToken = 0;
/** Windows that show up shortly after we asked for them get focused automatically. */
let expectWindowUntil = 0;
let expectTerminal = false;
/** Screen slot the next expected window should land on (set when a prop launched it). */
let expectSlot: string | undefined;
/** prop label -> window it opened, so clicking the prop again focuses instead of relaunching */
let expectProp: string | undefined;
const propWindows = new Map<string, string>();

const hud = new Hud({
  launch(app) {
    expectWindowUntil = performance.now() + 15_000;
    expectSlot = expectProp = undefined;
    net.send({ t: 'launch', app });
  },
  openTerminal: () => openTerminal(),
  switchTheme: name => void switchTheme(name),
  goToRoom: id => void world.goToRoom(id),
  launcherToggled: open => { world.blocked = open; },
  focus: key => void focus(key),
  back: () => void back(),
  close(key) {
    const w = wins.get(key);
    if (w instanceof NativeWin) net.send({ t: 'close', id: w.id });
    if (w instanceof TerminalWin) net.send({ t: 'term-close', id: w.id });
  },
  fit(key) {
    const w = wins.get(key);
    if (!(w instanceof NativeWin)) return;
    const a = FocusOverlay.available();
    net.send({ t: 'resize', id: w.id, w: a.w, h: a.h });
  },
  notifyAction: (id, key) => net.send({ t: 'notify-action', id, key }),
  notifyDismiss: id => net.send({ t: 'notify-dismiss', id }),
});

function openTerminal(slot?: string, prop?: string) {
  expectTerminal = true;
  expectSlot = slot;
  expectProp = prop;
  const a = FocusOverlay.available();
  net.send({ t: 'term-open', cols: Math.floor(Math.min(a.w, 1400) / 9), rows: Math.floor(Math.min(a.h, 900) / 20) });
}

// ── Focus ──────────────────────────────────────────────────────────────────

async function focus(key: string) {
  const win = wins.get(key);
  if (!win) return;
  if (hud.isLauncherOpen) hud.toggleLauncher(false);
  const token = ++focusToken;
  if (focusedKey === key && overlay.win === win) return;
  overlay.hide();
  focusedKey = key;
  hud.setFocused(win);
  world.idle = false;
  await world.focus(key, overlay.rectFor(win));
  if (token !== focusToken) return;
  overlay.show(win);
  world.idle = true;
}

async function back() {
  if (!focusedKey) return;
  ++focusToken;
  overlay.hide();
  focusedKey = null;
  hud.setFocused(null);
  world.idle = false;
  await world.unfocus();
}

overlay.onBackdrop = () => void back();
world.onPick = key => void focus(key);

// Clicking a prop: focus the window it opened earlier, else launch its app.
world.onProp = (spec, app) => {
  const open = propWindows.get(spec.label);
  if (open && wins.has(open)) return void focus(open);
  if (!app) return hud.error(`${spec.label}: no matching application is installed.`);
  if (app.id === '__terminal') return openTerminal(spec.slot, spec.label);
  expectWindowUntil = performance.now() + 15_000;
  expectSlot = spec.slot;
  expectProp = spec.label;
  net.send({ t: 'launch', app: app.id });
};

async function switchTheme(name: string) {
  if (name === world.themeName) return;
  await back();
  await world.useTheme(name);
  for (const w of wins.values()) if (w instanceof TerminalWin) w.setTheme(world.theme.terminal ?? {});
  localStorage.setItem('diorama.theme', name);
  await refreshThemeMenu();
}

async function refreshThemeMenu() {
  const user: string[] = await fetch('/api/themes').then(r => (r.ok ? r.json() : [])).catch(() => []);
  hud.setThemes(BUILTIN_THEMES, user, world.themeName);
  hud.setRooms(world.rooms());
}

setInterval(() => {
  const id = world.currentRoom();
  hud.setRoom(id, world.rooms().find(r => r.id === id)?.name ?? 'Between rooms');
}, 300);

function refreshTasks() {
  hud.renderTasks([...wins.values()].sort((a, b) => a.createdAt - b.createdAt));
}

// ── Native surfaces ────────────────────────────────────────────────────────

function onSurface(s: SurfaceInfo) {
  const known = surfaces.get(s.id);
  if (known) {
    if (known.surface === known.win.surface) known.win.update(s);
    else { known.surface.info = s; known.surface.size(s.w, s.h); }
    if (overlay.win === known.win) overlay.refresh();
    if (known.win.key === focusedKey) hud.setFocused(known.win);
    refreshTasks();
    return;
  }
  if (s.parent === null && s.kind !== 'popup') {
    const win = new NativeWin(s);
    surfaces.set(s.id, { win, surface: win.surface });
    wins.set(win.key, win);
    const expected = performance.now() < expectWindowUntil;
    world.add(win, expected ? expectSlot : undefined);
    refreshTasks();
    if (expected) {
      expectWindowUntil = 0;
      if (expectProp) propWindows.set(expectProp, win.key);
      expectSlot = expectProp = undefined;
      void focus(win.key);
    }
    return;
  }
  // Dialog or menu: drawn over its top-level in the focus overlay.
  const parentKey = s.parent !== null ? `x${s.parent}` : focusedKey;
  const parent = parentKey ? wins.get(parentKey) : undefined;
  if (!(parent instanceof NativeWin)) return;
  const child = new NativeSurface(s);
  parent.children.set(s.id, child);
  surfaces.set(s.id, { win: parent, surface: child });
  if (overlay.win === parent) overlay.refresh();
  else if (s.kind === 'dialog') void focus(parent.key);
}

function onSurfaceGone(id: number) {
  const known = surfaces.get(id);
  if (!known) return;
  surfaces.delete(id);
  if (known.surface !== known.win.surface) {
    known.win.children.delete(id);
    if (overlay.win === known.win) overlay.refresh();
    return;
  }
  for (const cid of known.win.children.keys()) surfaces.delete(cid);
  removeWin(known.win.key);
}

function removeWin(key: string) {
  const w = wins.get(key);
  if (!w) return;
  if (focusedKey === key) void back();
  wins.delete(key);
  world.remove(key);
  w.dispose();
  refreshTasks();
}

// ── Terminals ──────────────────────────────────────────────────────────────

function addTerminal(id: number, title: string, backlog?: string) {
  if (wins.has(`t${id}`)) return;
  const t = new TerminalWin(id, title, world.theme.terminal ?? {}, backlog);
  t.term.onData(data => net.send({ t: 'term-in', id, data }));
  t.term.onResize(({ cols, rows }) => net.send({ t: 'term-resize', id, cols, rows }));
  t.term.onBell(() => { bell(); world.bell(t.key); });
  t.term.attachCustomKeyEventHandler(ev => !isWorldHotkey(ev));
  t.onChange = () => {
    refreshTasks();
    if (focusedKey === t.key) hud.setFocused(t);
  };
  wins.set(t.key, t);
  world.add(t, expectTerminal ? expectSlot : undefined);
  refreshTasks();
  if (expectTerminal) {
    expectTerminal = false;
    if (expectProp) propWindows.set(expectProp, t.key);
    expectSlot = expectProp = undefined;
    void focus(t.key);
  }
}

// ── Wiring ─────────────────────────────────────────────────────────────────

net.onStatus = up => hud.setConnected(up);
net.onTile(tile => surfaces.get(tile.id)?.surface.tile(tile));
net.on(msg => {
  switch (msg.t) {
    case 'hello': hud.setIdentity(msg.user, msg.host); break;
    case 'surface': onSurface(msg.s); break;
    case 'surface-gone': onSurfaceGone(msg.id); break;
    case 'activate': {
      const s = surfaces.get(msg.id);
      if (s) void focus(s.win.key);
      break;
    }
    case 'bell': {
      bell(msg.percent > 0 ? msg.percent / 100 : 0.5);
      const s = msg.id !== null ? surfaces.get(msg.id) : undefined;
      world.bell(s ? s.win.key : null);
      break;
    }
    case 'cursor': overlay.setCursor(msg.url, msg.hx, msg.hy); break;
    case 'notify': hud.notify(msg.n); chime(msg.n.urgency === 2); break;
    case 'notify-close': hud.closeNotification(msg.id); break;
    case 'term': addTerminal(msg.term.id, msg.term.title, msg.term.backlog); break;
    case 'term-data': (wins.get(`t${msg.id}`) as TerminalWin | undefined)?.term.write(msg.data); break;
    case 'term-exit': removeWin(`t${msg.id}`); break;
    case 'error': hud.error(msg.message); break;
  }
});

addEventListener('resize', () => {
  const a = FocusOverlay.available();
  net.send({ t: 'viewport', w: a.w, h: a.h });
});

addEventListener('keydown', ev => {
  if (isWorldHotkey(ev)) {
    ev.preventDefault();
    ev.stopPropagation();
    if (focusedKey) void back();
    else hud.toggleLauncher();
    return;
  }
  // Typing in the world view starts an app search, like a launcher should.
  if (!focusedKey && !hud.isLauncherOpen && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ev.preventDefault();
    hud.toggleLauncher(true, ev.key);
  }
}, true);

(async () => {
  // ?theme=name overrides the server's configured theme (handy for trying one out).
  const theme = new URLSearchParams(location.search).get('theme')
    ?? localStorage.getItem('diorama.theme')
    ?? document.documentElement.dataset.theme ?? 'orbit';
  await hud.loadApps();
  world.setApps(hud.appList);
  await world.useTheme(theme);
  for (const w of wins.values()) if (w instanceof TerminalWin) w.setTheme(world.theme.terminal ?? {});
  await refreshThemeMenu();
  net.connect();
})();
