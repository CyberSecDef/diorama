import * as THREE from 'three';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { SurfaceInfo } from '../../server/protocol';
import type { Tile } from './net';
import type { WindowHandle } from './theme';

export const MONO_FONT = '"Cascadia Mono", "JetBrains Mono", "Fira Code", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/** Shared base: something that can be shown on a host and focused. */
export abstract class Win implements WindowHandle {
  abstract readonly key: string;
  abstract readonly kind: 'native' | 'terminal';
  abstract readonly title: string;
  abstract readonly appClass: string;
  abstract readonly width: number;
  abstract readonly height: number;
  abstract texture: THREE.Texture;
  iconUrl?: string;
  readonly createdAt = performance.now();
  /** contents changed since the last texture upload */
  dirty = true;
  /** set by World when this window is in the focus overlay; skip texture uploads then */
  focused = false;
  onChange: () => void = () => {};

  flush() {
    if (this.dirty && !this.focused) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  abstract dispose(): void;
}

function makeTexture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

// ── Native X11 surfaces ──────────────────────────────────────────────────

export class NativeSurface {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { alpha: false })!;
  private chain: Promise<void> = Promise.resolve();
  onDraw: () => void = () => {};

  constructor(public info: SurfaceInfo) {
    this.canvas.className = 'surface';
    this.size(info.w, info.h);
  }

  size(w: number, h: number) {
    if (this.canvas.width === w && this.canvas.height === h) return false;
    // Keep old pixels while waiting for the full frame that follows a resize.
    const old = this.canvas.width && this.canvas.height ? this.snapshot() : null;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, w, h);
    if (old) this.ctx.drawImage(old, 0, 0);
    return true;
  }

  private snapshot() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    c.getContext('2d')!.drawImage(this.canvas, 0, 0);
    return c;
  }

  /** Decode in arrival order: a late big tile must not paint over a newer small one. */
  tile(t: Tile) {
    const blob = new Blob([t.jpeg as BlobPart], { type: 'image/jpeg' });
    const decoded = createImageBitmap(blob);
    this.chain = this.chain.then(async () => {
      let bmp: ImageBitmap;
      try { bmp = await decoded; } catch { return; }
      if (t.surfW !== this.canvas.width || t.surfH !== this.canvas.height) this.size(t.surfW, t.surfH);
      this.ctx.drawImage(bmp, t.x, t.y);
      bmp.close();
      this.onDraw();
    });
  }
}

/** A top-level X window plus its dialogs/menus (children are only shown in the focus overlay). */
export class NativeWin extends Win {
  readonly kind = 'native' as const;
  readonly surface: NativeSurface;
  readonly children = new Map<number, NativeSurface>();
  texture: THREE.CanvasTexture;

  constructor(info: SurfaceInfo) {
    super();
    this.surface = new NativeSurface(info);
    this.texture = makeTexture(this.surface.canvas);
    this.surface.onDraw = () => { this.dirty = true; };
    this.iconUrl = info.icon;
  }

  get info() { return this.surface.info; }
  get id() { return this.surface.info.id; }
  get key() { return `x${this.id}`; }
  get title() { return this.info.title || this.info.appClass || 'Window'; }
  get appClass() { return this.info.appClass; }
  get width() { return this.info.w; }
  get height() { return this.info.h; }

  update(info: SurfaceInfo) {
    const resized = info.w !== this.info.w || info.h !== this.info.h;
    this.surface.info = info;
    this.iconUrl = info.icon ?? this.iconUrl;
    if (resized) {
      this.surface.size(info.w, info.h);
      // WebGL textures are immutable in size; swap in a fresh one.
      this.texture.dispose();
      this.texture = makeTexture(this.surface.canvas);
      this.dirty = true;
    }
    this.onChange();
  }

  dispose() {
    this.texture.dispose();
  }
}

// ── Terminals ────────────────────────────────────────────────────────────

const holder = (() => {
  const d = document.createElement('div');
  d.id = 'term-holder';
  document.body.appendChild(d);
  return d;
})();

export class TerminalWin extends Win {
  readonly kind = 'terminal' as const;
  readonly term: Terminal;
  readonly fit = new FitAddon();
  readonly element = document.createElement('div');
  readonly appClass = 'Terminal';
  texture: THREE.CanvasTexture;
  title: string;
  private canvas = document.createElement('canvas');
  private palette: string[];
  private lastPaint = 0;
  private cell = { w: 9, h: 18 };

  constructor(public readonly id: number, title: string, theme: Record<string, string>, backlog?: string) {
    super();
    this.title = title;
    this.element.className = 'terminal-host';
    holder.appendChild(this.element);
    this.term = new Terminal({
      fontFamily: MONO_FONT,
      fontSize: 15,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme,
    });
    this.term.loadAddon(this.fit);
    this.term.open(this.element);
    this.palette = buildPalette(theme);
    if (backlog) this.term.write(backlog);
    this.term.onWriteParsed(() => { this.dirty = true; });
    this.term.onTitleChange(t => { this.title = t || title; this.onChange(); });
    this.texture = makeTexture(this.canvas);
    this.measure();
    this.paint();
  }

  get key() { return `t${this.id}`; }
  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }

  private measure() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.font = `30px ${MONO_FONT}`;
    this.cell = { w: Math.ceil(ctx.measureText('M').width), h: 36 };
  }

  /** Repaint the 3D texture from the xterm buffer (throttled; xterm owns the real rendering). */
  override flush() {
    if (!this.dirty || this.focused) return;
    const now = performance.now();
    if (now - this.lastPaint < 200) return;
    this.lastPaint = now;
    const resized = this.paint();
    if (resized) {
      this.texture.dispose();
      this.texture = makeTexture(this.canvas);
      this.onChange();
    }
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  private paint(): boolean {
    const { cols, rows } = this.term;
    const pad = 24;
    const w = cols * this.cell.w + pad * 2, h = rows * this.cell.h + pad * 2;
    const resized = this.canvas.width !== w || this.canvas.height !== h;
    if (resized) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.canvas.getContext('2d')!;
    const bgDefault = this.term.options.theme?.background ?? '#000';
    const fgDefault = this.term.options.theme?.foreground ?? '#ddd';
    ctx.fillStyle = bgDefault;
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'top';
    const buf = this.term.buffer.active;
    const cell = buf.getNullCell();
    const color = (isDefault: boolean, isPalette: boolean, isRGB: boolean, v: number, dflt: string) =>
      isDefault ? dflt : isPalette ? this.palette[v] ?? dflt : isRGB ? `#${v.toString(16).padStart(6, '0')}` : dflt;
    for (let y = 0; y < rows; y++) {
      const line = buf.getLine(buf.viewportY + y);
      if (!line) continue;
      let run = '', runColor = '', runX = 0, runBold = false;
      const flushRun = () => {
        if (!run.trim()) { run = ''; return; }
        ctx.font = `${runBold ? 'bold ' : ''}30px ${MONO_FONT}`;
        ctx.fillStyle = runColor;
        ctx.fillText(run, pad + runX * this.cell.w, pad + y * this.cell.h + 3);
        run = '';
      };
      for (let x = 0; x < cols; x++) {
        line.getCell(x, cell);
        const ch = cell.getChars() || ' ';
        if (cell.getWidth() === 0) continue;
        if (!cell.isBgDefault()) {
          ctx.fillStyle = color(false, !!cell.isBgPalette(), !!cell.isBgRGB(), cell.getBgColor(), bgDefault);
          ctx.fillRect(pad + x * this.cell.w, pad + y * this.cell.h, this.cell.w * cell.getWidth(), this.cell.h);
        }
        const fg = cell.isInverse()
          ? bgDefault
          : color(cell.isFgDefault(), !!cell.isFgPalette(), !!cell.isFgRGB(), cell.getFgColor(), fgDefault);
        const bold = !!cell.isBold();
        if (fg !== runColor || bold !== runBold || cell.getWidth() > 1) {
          flushRun();
          runColor = fg; runBold = bold; runX = x;
        }
        run += ch;
      }
      flushRun();
    }
    // cursor
    if (buf.viewportY === buf.baseY) {
      ctx.fillStyle = this.term.options.theme?.cursor ?? fgDefault;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(pad + buf.cursorX * this.cell.w, pad + buf.cursorY * this.cell.h, this.cell.w, this.cell.h);
      ctx.globalAlpha = 1;
    }
    return resized;
  }

  /** Move the live xterm into the focus overlay (or back to the hidden holder). */
  mount(parent: HTMLElement | null) {
    (parent ?? holder).appendChild(this.element);
    if (parent) {
      this.fit.fit();
      this.term.focus();
    } else {
      this.term.blur();
      this.dirty = true;
    }
  }

  setTheme(theme: Record<string, string>) {
    this.term.options.theme = theme;
    this.palette = buildPalette(theme);
    this.dirty = true;
  }

  dispose() {
    this.term.dispose();
    this.element.remove();
    this.texture.dispose();
  }
}

function buildPalette(t: Record<string, string>): string[] {
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  const dflt = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
    '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff'];
  const p: string[] = [];
  for (let i = 0; i < 16; i++) {
    const name = i < 8 ? names[i] : 'bright' + names[i - 8][0].toUpperCase() + names[i - 8].slice(1);
    p.push(t[name] ?? dflt[i]);
  }
  const lv = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
    p.push(`rgb(${lv[r]},${lv[g]},${lv[b]})`);
  }
  for (let i = 0; i < 24; i++) { const v = 8 + i * 10; p.push(`rgb(${v},${v},${v})`); }
  return p;
}
