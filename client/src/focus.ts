import type { ClientMsg } from '../../server/protocol';
import type { Rect } from './world';
import { NativeWin, TerminalWin, type Win } from './windows';

const MARGIN = { top: 56, right: 28, bottom: 28, left: 28 };

/** Is this the "back to the world" chord? It is never forwarded to apps. */
export const isWorldHotkey = (e: KeyboardEvent) => e.ctrlKey && e.altKey && e.code === 'Space';

/**
 * The focused window, shown as real DOM at (up to) 1:1 pixels on top of the
 * 3D scene. Native windows get pointer/keyboard forwarded in X root
 * coordinates; terminals are a live xterm.js.
 */
export class FocusOverlay {
  readonly el = document.getElementById('focus')!;
  private stage = document.createElement('div');
  win: Win | null = null;
  private scale = 1;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private pendingMove: { x: number; y: number } | null = null;
  private wheelAcc = { x: 0, y: 0 };
  private cursorCss = 'default';
  /** modifier keys we have told the server are held */
  private mods = new Set<string>();

  constructor(private send: (m: ClientMsg) => void) {
    this.stage.className = 'stage';
    this.el.appendChild(this.stage);
    this.bindInput();
    addEventListener('resize', () => { if (this.win) this.layout(); });
  }

  /** Area windows may occupy; also what the server treats as "maximized". */
  static available() {
    return {
      w: Math.floor(innerWidth - MARGIN.left - MARGIN.right),
      h: Math.floor(innerHeight - MARGIN.top - MARGIN.bottom),
    };
  }

  /** Where `win` will be drawn, in CSS px. World flies the 3D screen onto this. */
  rectFor(win: Win): Rect {
    const avail = FocusOverlay.available();
    let w: number, h: number;
    if (win instanceof TerminalWin) {
      w = Math.min(avail.w, 1400);
      h = Math.min(avail.h, 900);
    } else {
      const s = Math.min(1, avail.w / win.width, avail.h / win.height);
      w = Math.round(win.width * s);
      h = Math.round(win.height * s);
    }
    return {
      x: Math.round(MARGIN.left + (avail.w - w) / 2),
      y: Math.round(MARGIN.top + (avail.h - h) / 2),
      w, h,
    };
  }

  show(win: Win) {
    this.hide();
    // Whatever had DOM focus (a taskbar button, say) must not swallow keys meant for the app.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.mods.clear();
    this.win = win;
    win.focused = true;
    this.stage.replaceChildren();
    this.el.classList.add('visible');
    this.el.dataset.kind = win.kind;
    if (win instanceof NativeWin) {
      this.stage.appendChild(win.surface.canvas);
      for (const c of win.children.values()) this.stage.appendChild(c.canvas);
      this.send({ t: 'focus', id: win.id });
    } else if (win instanceof TerminalWin) {
      this.send({ t: 'focus', id: null });
    }
    this.layout();
    if (win instanceof TerminalWin) {
      win.mount(this.stage);
      this.send({ t: 'term-resize', id: win.id, cols: win.term.cols, rows: win.term.rows });
    }
  }

  hide() {
    const win = this.win;
    if (!win) return;
    win.focused = false;
    win.dirty = true;
    if (win instanceof NativeWin) {
      this.send({ t: 'release-all' });
      this.send({ t: 'focus', id: null });
    }
    if (win instanceof TerminalWin) win.mount(null);
    this.stage.replaceChildren();
    this.el.classList.remove('visible');
    this.win = null;
  }

  /** Window geometry or children changed. */
  refresh() {
    if (!this.win) return;
    if (this.win instanceof NativeWin) {
      const want = [this.win.surface.canvas, ...[...this.win.children.values()].map(c => c.canvas)];
      if (want.length !== this.stage.children.length || want.some((c, i) => this.stage.children[i] !== c)) {
        this.stage.replaceChildren(...want);
      }
    }
    this.layout();
  }

  private layout() {
    const win = this.win!;
    this.rect = this.rectFor(win);
    const st = this.stage.style;
    st.left = `${this.rect.x}px`;
    st.top = `${this.rect.y}px`;
    if (win instanceof NativeWin) {
      this.scale = this.rect.w / win.width;
      st.width = `${win.width}px`;
      st.height = `${win.height}px`;
      st.transform = `scale(${this.scale})`;
      const p = win.info;
      for (const c of win.children.values()) {
        c.canvas.style.left = `${c.info.x - p.x}px`;
        c.canvas.style.top = `${c.info.y - p.y}px`;
      }
      win.surface.canvas.style.left = '0px';
      win.surface.canvas.style.top = '0px';
    } else if (win instanceof TerminalWin) {
      st.width = `${this.rect.w}px`;
      st.height = `${this.rect.h}px`;
      st.transform = '';
      win.fit.fit();
    }
  }

  setCursor(url: string, hx: number, hy: number) {
    this.cursorCss = `url(${url}) ${hx} ${hy}, default`;
    if (this.win instanceof NativeWin) this.el.style.cursor = this.cursorCss;
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private toRoot(ev: { clientX: number; clientY: number }) {
    const p = (this.win as NativeWin).info;
    return {
      x: Math.round(p.x + (ev.clientX - this.rect.x) / this.scale),
      y: Math.round(p.y + (ev.clientY - this.rect.y) / this.scale),
    };
  }

  /**
   * Make the server's modifier state match the browser's before each key.
   * Covers missed keyups (focus changes, OS shortcuts) and synthetic input
   * that sets shiftKey without ever sending a Shift keydown.
   */
  private syncModifiers(ev: KeyboardEvent) {
    for (const [flag, codes] of MODIFIER_GROUPS) {
      const want = ev[flag];
      const held = codes.filter(c => this.mods.has(c));
      if (codes.includes(ev.code)) continue;
      if (want && !held.length) { this.mods.add(codes[0]); this.send({ t: 'key', code: codes[0], down: true }); }
      if (!want) for (const c of held) { this.mods.delete(c); this.send({ t: 'key', code: c, down: false }); }
    }
  }

  /** Clicks on the dimmed backdrop leave focus, unless a menu is open (then X needs the click to close it). */
  onBackdrop: () => void = () => {};

  private bindInput() {
    const native = () => this.win instanceof NativeWin;
    const insideStage = (ev: MouseEvent) =>
      ev.clientX >= this.rect.x && ev.clientX < this.rect.x + this.rect.w &&
      ev.clientY >= this.rect.y && ev.clientY < this.rect.y + this.rect.h;
    const hasPopup = () => this.win instanceof NativeWin && [...this.win.children.values()].some(c => c.info.kind === 'popup');
    const onChild = (ev: MouseEvent) => ev.target instanceof HTMLCanvasElement && ev.target !== (this.win as NativeWin).surface.canvas;

    this.el.addEventListener('pointermove', ev => {
      if (!native()) return;
      this.el.style.cursor = insideStage(ev) || onChild(ev) ? this.cursorCss : 'default';
      const first = !this.pendingMove;
      this.pendingMove = this.toRoot(ev);
      if (first) requestAnimationFrame(() => {
        if (this.pendingMove) this.send({ t: 'ptr', ...this.pendingMove });
        this.pendingMove = null;
      });
    });

    this.el.addEventListener('pointerdown', ev => {
      if (!this.win) return;
      if (!native()) {
        if (ev.target === this.el) this.onBackdrop();
        return;
      }
      if (!insideStage(ev) && !onChild(ev) && !hasPopup()) { this.onBackdrop(); return; }
      ev.preventDefault();
      this.el.setPointerCapture(ev.pointerId);
      this.pendingMove = null;
      this.send({ t: 'btn', b: xButton(ev.button), down: true, ...this.toRoot(ev) });
    });

    this.el.addEventListener('pointerup', ev => {
      if (!native() || !this.el.hasPointerCapture(ev.pointerId)) return;
      this.el.releasePointerCapture(ev.pointerId);
      this.send({ t: 'btn', b: xButton(ev.button), down: false, ...this.toRoot(ev) });
    });

    this.el.addEventListener('contextmenu', ev => ev.preventDefault());

    this.el.addEventListener('wheel', ev => {
      if (!native()) return;
      ev.preventDefault();
      // One X wheel click per ~line; trackpads send many small deltas.
      const unit = ev.deltaMode === 1 ? 1 : ev.deltaMode === 2 ? 0.1 : 40;
      this.wheelAcc.x += ev.deltaX / unit;
      this.wheelAcc.y += ev.deltaY / unit;
      const dx = Math.trunc(this.wheelAcc.x), dy = Math.trunc(this.wheelAcc.y);
      if (dx || dy) {
        this.wheelAcc.x -= dx; this.wheelAcc.y -= dy;
        this.send({ t: 'wheel', dx, dy, ...this.toRoot(ev) });
      }
    }, { passive: false });

    const key = (down: boolean) => (ev: KeyboardEvent) => {
      if (!native() || isWorldHotkey(ev) || ev.isComposing) return;
      if (isTextInput(document.activeElement) && !this.el.contains(document.activeElement)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.syncModifiers(ev);
      // X autorepeats held keys itself; browser repeats would double them.
      if (down && ev.repeat) return;
      if (MODIFIERS[ev.code] && this.mods.has(ev.code) === down) return;
      if (MODIFIERS[ev.code]) { if (down) this.mods.add(ev.code); else this.mods.delete(ev.code); }
      this.send({ t: 'key', code: ev.code, down });
    };
    addEventListener('keydown', key(true), true);
    addEventListener('keyup', key(false), true);
    addEventListener('blur', () => { if (native()) { this.mods.clear(); this.send({ t: 'release-all' }); } });
  }
}

const MODIFIER_GROUPS: [ 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', string[]][] = [
  ['shiftKey', ['ShiftLeft', 'ShiftRight']],
  ['ctrlKey', ['ControlLeft', 'ControlRight']],
  ['altKey', ['AltLeft', 'AltRight']],
  ['metaKey', ['MetaLeft', 'MetaRight']],
];
const MODIFIERS: Record<string, true> = Object.fromEntries(MODIFIER_GROUPS.flatMap(([, c]) => c.map(k => [k, true])));

function isTextInput(el: Element | null) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

/** DOM button -> X button (1 left, 2 middle, 3 right, 8 back, 9 forward) */
function xButton(b: number) {
  return [1, 2, 3, 8, 9][b] ?? 1;
}
