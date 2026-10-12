import type { AppEntry, Notification } from '../../server/protocol';
import type { Win } from './windows';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface HudActions {
  launch(appId: string): void;
  openTerminal(): void;
  focus(key: string): void;
  back(): void;
  close(key: string): void;
  fit(key: string): void;
  notifyAction(id: number, key: string): void;
  notifyDismiss(id: number): void;
}

/** The 2D chrome around the 3D world: top bar, taskbar, launcher, toasts. */
export class Hud {
  private apps: AppEntry[] = [];
  private launcherOpen = false;
  private selected = 0;
  private filtered: (AppEntry | { id: '__terminal'; name: string; comment: string })[] = [];

  constructor(private act: HudActions) {
    $('#btn-launcher').onclick = () => this.toggleLauncher();
    $('#btn-terminal').onclick = () => act.openTerminal();
    $('#btn-back').onclick = () => act.back();
    $('#btn-fullscreen').onclick = () => toggleFullscreen();
    $('#btn-logout').onclick = async () => {
      await fetch('/api/logout', { method: 'POST' });
      location.href = '/login';
    };
    const search = $<HTMLInputElement>('#launcher-search');
    search.oninput = () => { this.selected = 0; this.renderApps(); };
    search.onkeydown = ev => {
      if (ev.key === 'Escape') { this.toggleLauncher(false); ev.preventDefault(); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') { this.move(1); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') { this.move(-1); ev.preventDefault(); }
      else if (ev.key === 'Enter') { this.activate(this.filtered[this.selected]); ev.preventDefault(); }
    };
    $('#launcher').addEventListener('pointerdown', ev => { if (ev.target === $('#launcher')) this.toggleLauncher(false); });
    setInterval(() => this.tickClock(), 1000);
    this.tickClock();
    document.addEventListener('fullscreenchange', () => {
      const nav = navigator as any;
      // In fullscreen, Keyboard Lock lets Ctrl+W, Alt+Tab-ish chords reach the apps.
      if (document.fullscreenElement) nav.keyboard?.lock?.().catch(() => {});
      else nav.keyboard?.unlock?.();
    });
  }

  async loadApps() {
    const res = await fetch('/api/apps');
    if (res.ok) this.apps = await res.json();
  }

  setIdentity(user: string, host: string) {
    $('#identity').textContent = `${user}@${host}`;
  }

  setConnected(up: boolean) {
    document.body.classList.toggle('offline', !up);
  }

  // ── Mode & taskbar ──────────────────────────────────────────────────────

  setFocused(win: Win | null) {
    document.body.classList.toggle('focused', !!win);
    $('#focus-title').textContent = win ? win.title : '';
    $('#btn-fit').style.display = win?.kind === 'native' ? '' : 'none';
    $('#btn-fit').onclick = () => win && this.act.fit(win.key);
    $('#btn-close').onclick = () => win && this.act.close(win.key);
    for (const el of document.querySelectorAll<HTMLElement>('.task')) el.classList.toggle('active', el.dataset.key === win?.key);
  }

  renderTasks(wins: Win[]) {
    const bar = $('#taskbar');
    bar.replaceChildren(...wins.map(w => {
      const b = document.createElement('button');
      b.className = 'task';
      b.dataset.key = w.key;
      b.title = w.title;
      b.innerHTML = `${w.iconUrl ? `<img src="${esc(w.iconUrl)}" alt="">` : `<span class="glyph">${w.kind === 'terminal' ? '&gt;_' : '▢'}</span>`}<span class="label">${esc(w.title)}</span>`;
      b.onclick = () => this.act.focus(w.key);
      return b;
    }));
    bar.classList.toggle('empty', wins.length === 0);
  }

  // ── Launcher ────────────────────────────────────────────────────────────

  get isLauncherOpen() {
    return this.launcherOpen;
  }

  toggleLauncher(open = !this.launcherOpen, initial = '') {
    this.launcherOpen = open;
    $('#launcher').classList.toggle('visible', open);
    const search = $<HTMLInputElement>('#launcher-search');
    if (open) {
      search.value = initial;
      this.selected = 0;
      this.renderApps();
      // Focus now, synchronously: the keys typed right after the first one must land here.
      search.focus();
      void this.loadApps().then(() => this.renderApps());
    } else {
      search.blur();
    }
  }

  private move(d: number) {
    if (!this.filtered.length) return;
    this.selected = (this.selected + d + this.filtered.length) % this.filtered.length;
    this.renderApps();
  }

  private activate(app?: { id: string }) {
    if (!app) return;
    this.toggleLauncher(false);
    if (app.id === '__terminal') this.act.openTerminal();
    else this.act.launch(app.id);
  }

  private renderApps() {
    const q = $<HTMLInputElement>('#launcher-search').value.trim().toLowerCase();
    const builtin = { id: '__terminal' as const, name: 'Terminal', comment: 'diorama web terminal' };
    const score = (a: { name: string; comment?: string }) => {
      const n = a.name.toLowerCase();
      if (!q) return 1;
      if (n.startsWith(q)) return 3;
      if (n.includes(q)) return 2;
      return (a.comment ?? '').toLowerCase().includes(q) ? 1 : 0;
    };
    this.filtered = [builtin, ...this.apps]
      .map(a => ({ a, s: score(a) }))
      .filter(x => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map(x => x.a);
    const grid = $('#launcher-grid');
    grid.replaceChildren(...this.filtered.slice(0, 120).map((a, i) => {
      const b = document.createElement('button');
      b.className = 'app' + (i === this.selected ? ' selected' : '');
      b.title = a.comment ?? '';
      const icon = a.id === '__terminal'
        ? '<span class="glyph">&gt;_</span>'
        : (a as AppEntry).hasIcon ? `<img src="/api/icon/${encodeURIComponent(a.id)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=glyph>◆</span>'">` : '<span class="glyph">◆</span>';
      b.innerHTML = `${icon}<span>${esc(a.name)}</span>`;
      b.onclick = () => this.activate(a);
      return b;
    }));
    grid.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  // ── Toasts ──────────────────────────────────────────────────────────────

  notify(n: Notification) {
    const id = `note-${n.id}`;
    document.getElementById(id)?.remove();
    const el = document.createElement('div');
    el.className = `toast urgency-${n.urgency}`;
    el.id = id;
    el.innerHTML = `
      <div class="toast-head"><span class="toast-app">${esc(n.app || 'Notification')}</span><button class="x" title="Dismiss">×</button></div>
      <div class="toast-summary">${esc(n.summary)}</div>
      ${n.body ? `<div class="toast-body">${esc(n.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${n.actions.filter(a => a.key !== 'default').length ? `<div class="toast-actions">${n.actions.filter(a => a.key !== 'default').map(a => `<button data-k="${esc(a.key)}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    el.querySelector<HTMLButtonElement>('.x')!.onclick = ev => { ev.stopPropagation(); this.act.notifyDismiss(n.id); };
    el.querySelectorAll<HTMLButtonElement>('.toast-actions button').forEach(b => {
      b.onclick = ev => { ev.stopPropagation(); this.act.notifyAction(n.id, b.dataset.k!); };
    });
    el.onclick = () => {
      if (n.actions.some(a => a.key === 'default')) this.act.notifyAction(n.id, 'default');
      else this.act.notifyDismiss(n.id);
    };
    $('#toasts').prepend(el);
  }

  closeNotification(id: number) {
    const el = document.getElementById(`note-${id}`);
    if (!el) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }

  error(message: string) {
    const el = document.createElement('div');
    el.className = 'toast error';
    el.textContent = message;
    el.onclick = () => el.remove();
    $('#toasts').prepend(el);
    setTimeout(() => el.remove(), 8000);
  }

  private tickClock() {
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#clock').title = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
