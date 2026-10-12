import type * as T from 'three';

/** Canvas texture with a window title (and icon) for labels under screens. */
export function makeLabel(THREE: typeof T, opts: { font?: string; color?: string; bg?: string; height?: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const ctx = canvas.getContext('2d')!;
  let last = '';
  let icon: HTMLImageElement | null = null;

  const draw = (title: string) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = opts.font ?? '500 54px "Inter", "Segoe UI", system-ui, sans-serif';
    const iconW = icon ? 96 : 0;
    let text = title;
    while (ctx.measureText(text).width > canvas.width - iconW - 80 && text.length > 4) text = text.slice(0, -2);
    if (text !== title) text = text.trimEnd() + '…';
    const tw = ctx.measureText(text).width + iconW + 64;
    const x0 = (canvas.width - tw) / 2;
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.beginPath();
      ctx.roundRect(x0, 14, tw, 100, 50);
      ctx.fill();
    }
    if (icon) ctx.drawImage(icon, x0 + 28, 30, 68, 68);
    ctx.fillStyle = opts.color ?? '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + 32 + iconW, 66);
    tex.needsUpdate = true;
  };

  return {
    texture: tex,
    set(title: string, iconUrl?: string) {
      const sig = title + '|' + (iconUrl ?? '');
      if (sig === last) return;
      last = sig;
      if (iconUrl && icon?.src !== iconUrl) {
        const img = new Image();
        img.onload = () => { icon = img; draw(title); };
        img.src = iconUrl;
      }
      draw(title);
    },
    dispose() { tex.dispose(); },
  };
}

/** Soft radial glow sprite texture. */
export function glowTexture(THREE: typeof T, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Screen size in world units: honour real pixel size, but keep tiny/huge windows sane. */
export function screenSize(w: number, h: number, pxToWorld: number, maxW = 3.2, maxH = 2.0) {
  let sw = w * pxToWorld, sh = h * pxToWorld;
  const s = Math.min(1, maxW / sw, maxH / sh);
  sw *= s; sh *= s;
  const grow = Math.max(1, 0.6 / Math.max(sh, 0.01));
  return { w: sw * grow, h: sh * grow };
}

export const damp = (from: number, to: number, lambda: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-lambda * dt));
