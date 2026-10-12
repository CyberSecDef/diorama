import type * as T from 'three';

/** Material palette a building is made of. Props and slots pick from it too. */
export interface Style {
  name: 'scifi' | 'home' | 'office';
  accent: string;
  accent2: string;
  wall: T.Material;
  wallOuter: T.Material;
  floor: T.Material;
  ceiling: T.Material;
  trim: T.Material;
  metal: T.MeshStandardMaterial;
  dark: T.MeshStandardMaterial;
  plastic: T.MeshStandardMaterial;
  wood: T.MeshStandardMaterial;
  fabric: T.MeshStandardMaterial;
  fabric2: T.MeshStandardMaterial;
  glass: T.Material;
  glow: T.MeshBasicMaterial;
  paper: T.MeshStandardMaterial;
  /** extra named floor/wall materials for specific rooms */
  extra: Record<string, T.Material>;
  /** font for signs and labels */
  font: string;
}

function canvas(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  return c;
}

function rand(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

export function tex(THREE: typeof T, c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Procedural surfaces (1 texture = 1 world metre unless noted) ──────────

const hullPanels = (base: string, line: string, accent: string) => canvas(512, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  const r = rand(7);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.03})`;
    g.fillRect(r() * s, r() * s, r() * 200, r() * 200);
  }
  g.strokeStyle = line; g.lineWidth = 4;
  g.strokeRect(2, 2, s - 4, s - 4);
  g.beginPath(); g.moveTo(0, s * 0.62); g.lineTo(s, s * 0.62); g.stroke();
  g.lineWidth = 2;
  g.strokeRect(s * 0.08, s * 0.08, s * 0.38, s * 0.46);
  g.strokeRect(s * 0.54, s * 0.08, s * 0.38, s * 0.46);
  g.fillStyle = accent;
  g.fillRect(s * 0.1, s * 0.66, s * 0.06, s * 0.02);
  g.fillStyle = line;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(s * (0.15 + i * 0.14), s * 0.85, 5, 0, Math.PI * 2); g.fill(); }
});

const deckPlates = () => canvas(512, (g, s) => {
  g.fillStyle = '#2a3038'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#161a20'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
  g.fillStyle = '#323a44';
  for (let y = 24; y < s; y += 32) for (let x = 24; x < s; x += 32) {
    g.save(); g.translate(x, y); g.rotate(((x + y) / 32) % 2 ? 0.6 : -0.6); g.fillRect(-9, -2, 18, 4); g.restore();
  }
});

const planks = (hue: number, light: number) => canvas(512, (g, s) => {
  const r = rand(hue * 13 + light);
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const l = light + (r() - 0.5) * 6;
    g.fillStyle = `hsl(${hue}, 38%, ${l}%)`;
    g.fillRect(0, (i * s) / rows, s, s / rows);
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = `hsla(${hue}, 40%, ${l - 6}%, 0.35)`;
      g.lineWidth = 1 + r() * 2;
      const y = (i + r()) * (s / rows);
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 6 - 3, s * 0.6, y + r() * 6 - 3, s, y); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, (i * s) / rows, s, 2);
    g.fillRect(((i * 0.37) % 1) * s, (i * s) / rows, 2, s / rows);
  }
});

const carpet = (color: string) => canvas(256, (g, s) => {
  g.fillStyle = color; g.fillRect(0, 0, s, s);
  const r = rand(3);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.05)`;
    g.fillRect(r() * s, r() * s, 1.5, 1.5);
  }
});

const tiles = (a: string, b: string, n = 4) => canvas(512, (g, s) => {
  const t = s / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * t, y * t, t, t);
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, s); g.moveTo(0, i * t); g.lineTo(s, i * t); g.stroke(); }
});

const plaster = (color: string) => canvas(256, (g, s) => {
  g.fillStyle = color; g.fillRect(0, 0, s, s);
  const r = rand(11);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
    g.fillRect(r() * s, r() * s, 2 + r() * 3, 2 + r() * 3);
  }
});

const bricks = () => canvas(512, (g, s) => {
  g.fillStyle = '#c9c2b6'; g.fillRect(0, 0, s, s);
  const r = rand(5);
  const bh = s / 8, bw = s / 4;
  for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
    const ox = (y % 2) * bw / 2;
    g.fillStyle = `hsl(${12 + r() * 8}, ${45 + r() * 15}%, ${34 + r() * 10}%)`;
    g.fillRect(x * bw + ox + 3, y * bh + 3, bw - 6, bh - 6);
  }
});

const concrete = (light: number) => canvas(256, (g, s) => {
  g.fillStyle = `hsl(210, 6%, ${light}%)`; g.fillRect(0, 0, s, s);
  const r = rand(17);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.04)`;
    g.fillRect(r() * s, r() * s, 2, 2);
  }
});

const ceilingTiles = () => canvas(512, (g, s) => {
  g.fillStyle = '#e9ebee'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#b8bdc4'; g.lineWidth = 8; g.strokeRect(0, 0, s, s);
  const r = rand(23);
  for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(r() * s, r() * s, 2, 2); }
});

export function makeStyle(THREE: typeof T, name: Style['name']): Style {
  const std = (o: T.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const textured = (c: HTMLCanvasElement, o: T.MeshStandardMaterialParameters = {}, tile = 1) => {
    const m = std({ map: tex(THREE, c), roughness: 0.8, ...o });
    m.userData.tile = tile;
    return m;
  };

  if (name === 'scifi') {
    const accent = '#5cc8ff';
    return {
      name, accent, accent2: '#ff9a3c', font: '"Orbitron", "Eurostile", "Segoe UI", sans-serif',
      wall: textured(hullPanels('#cfd6de', '#9aa6b3', accent), { roughness: 0.55, metalness: 0.2 }, 2.2),
      wallOuter: std({ color: '#3a4250', roughness: 0.6, metalness: 0.5 }),
      floor: textured(deckPlates(), { roughness: 0.5, metalness: 0.6 }, 1.2),
      ceiling: textured(hullPanels('#b7c0ca', '#8994a1', '#ffffff'), { roughness: 0.6 }, 2.2),
      trim: std({ color: '#5a6676', roughness: 0.35, metalness: 0.8 }),
      metal: std({ color: '#8b97a6', roughness: 0.3, metalness: 0.9 }),
      dark: std({ color: '#1d232c', roughness: 0.4, metalness: 0.6 }),
      plastic: std({ color: '#e9eef3', roughness: 0.35 }),
      wood: std({ color: '#6f5a4a', roughness: 0.6 }),
      fabric: std({ color: '#2f4f6f', roughness: 0.9 }),
      fabric2: std({ color: '#7a2f3a', roughness: 0.9 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }),
      paper: std({ color: '#f2f5f8', roughness: 0.9 }),
      extra: {
        medical: textured(hullPanels('#e8f0f2', '#b5c7cc', '#3cff9a'), { roughness: 0.5 }, 2.2),
        engineering: textured(hullPanels('#8f9aa6', '#5d6773', '#ffb000'), { roughness: 0.6, metalness: 0.4 }, 2.2),
        quarters: textured(planks(28, 30), { roughness: 0.7 }, 2.4),
        quartersWall: textured(hullPanels('#d9cfc3', '#b3a594', '#ffcf8a'), { roughness: 0.7 }, 2.2),
        science: textured(hullPanels('#d4e2ee', '#9fb4c6', '#b77dff'), { roughness: 0.5 }, 2.2),
      },
    };
  }
  if (name === 'home') {
    const accent = '#e8a54b';
    return {
      name, accent, accent2: '#5aa36a', font: '"Georgia", "Times New Roman", serif',
      wall: textured(plaster('#efe6d8'), { roughness: 0.95 }, 2),
      wallOuter: textured(bricks(), { roughness: 0.9 }, 1.6),
      floor: textured(planks(30, 42), { roughness: 0.6 }, 2.4),
      ceiling: std({ color: '#f7f3ec', roughness: 1 }),
      trim: std({ color: '#fbf8f2', roughness: 0.5 }),
      metal: std({ color: '#b8b4ad', roughness: 0.35, metalness: 0.8 }),
      dark: std({ color: '#2b2622', roughness: 0.6 }),
      plastic: std({ color: '#f1efe9', roughness: 0.4 }),
      wood: textured(planks(26, 30), { roughness: 0.55 }, 2.4),
      fabric: std({ color: '#5b7a99', roughness: 0.95 }),
      fabric2: std({ color: '#b8574a', roughness: 0.95 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.15, roughness: 0.05, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ color: '#fff1d0', toneMapped: false }),
      paper: std({ color: '#fbf8f0', roughness: 0.9 }),
      extra: {
        kitchen: textured(tiles('#e9e4da', '#d7cfc0', 6), { roughness: 0.4 }, 1.6),
        bathroom: textured(tiles('#dfeef2', '#c6dde3', 8), { roughness: 0.3 }, 1.6),
        carpet: textured(carpet('#8a9a7b'), { roughness: 1 }, 1.5),
        bedroomWall: textured(plaster('#d9e2ea'), { roughness: 0.95 }, 2),
        officeWall: textured(plaster('#e3dccb'), { roughness: 0.95 }, 2),
        kitchenWall: textured(plaster('#f3efe2'), { roughness: 0.9 }, 2),
      },
    };
  }
  const accent = '#3d8bff';
  return {
    name, accent, accent2: '#00c2a8', font: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    wall: textured(plaster('#eef0f2'), { roughness: 0.9 }, 2),
    wallOuter: std({ color: '#2b323b', roughness: 0.4, metalness: 0.6 }),
    floor: textured(carpet('#4d5560'), { roughness: 1 }, 1.5),
    ceiling: textured(ceilingTiles(), { roughness: 1 }, 1.2),
    trim: std({ color: '#9aa3ad', roughness: 0.3, metalness: 0.8 }),
    metal: std({ color: '#a9b2bc', roughness: 0.3, metalness: 0.85 }),
    dark: std({ color: '#22272e', roughness: 0.5 }),
    plastic: std({ color: '#f4f5f7', roughness: 0.4 }),
    wood: textured(planks(30, 38), { roughness: 0.5 }, 2.4),
    fabric: std({ color: '#2f4a6b', roughness: 0.95 }),
    fabric2: std({ color: '#5f6b77', roughness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#bfe0ff', transparent: true, opacity: 0.16, roughness: 0.02, metalness: 0.1, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    paper: std({ color: '#ffffff', roughness: 0.9 }),
    extra: {
      lobby: textured(tiles('#d9dcdf', '#c9cdd1', 2), { roughness: 0.25, metalness: 0.1 }, 1.6),
      server: textured(tiles('#6d747c', '#646b73', 2), { roughness: 0.6 }, 1.6),
      concrete: textured(concrete(62), { roughness: 0.9 }, 2),
      exec: textured(planks(20, 22), { roughness: 0.45 }, 2.4),
      accentWall: std({ color: '#1f3a5f', roughness: 0.8 }),
    },
  };
}

/** Rescale a BoxGeometry's UVs so textures tile per world metre instead of stretching. */
export function worldUV(geo: T.BufferGeometry, w: number, h: number, d: number, tile = 1) {
  const uv = geo.getAttribute('uv') as T.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices each (1 segment).
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * su) / tile, (uv.getY(k) * sv) / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}
