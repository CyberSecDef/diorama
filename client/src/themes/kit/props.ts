import type * as T from 'three';
import type { Style } from './style';

export interface PropKit {
  THREE: typeof T;
  style: Style;
  /** register a per-frame animation */
  animate(fn: (dt: number, t: number) => void): void;
}

/**
 * Procedural props. Conventions:
 *  - wall props: origin on the wall surface, facing +Z, centred.
 *  - floor/desk props: origin at the centre of their footprint, on the ground.
 */
export function props(K: PropKit) {
  const { THREE, style: S } = K;

  const box = (p: T.Object3D, w: number, h: number, d: number, mat: T.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    p.add(m);
    return m;
  };
  const cyl = (p: T.Object3D, rt: number, rb: number, h: number, mat: T.Material, x = 0, y = 0, z = 0, seg = 24) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    p.add(m);
    return m;
  };
  const std = (color: string, o: T.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const glow = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { tex: t, canvas: c, g: c.getContext('2d')! };
  };
  const face = (p: T.Object3D, w: number, h: number, tex: T.Texture, z: number, x = 0, y = 0, basic = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    m.position.set(x, y, z);
    p.add(m);
    return m;
  };
  const group = () => new THREE.Group();

  // ── App props: wall-mounted ─────────────────────────────────────────────

  function calendar() {
    const g = group();
    box(g, 0.44, 0.6, 0.012, S.paper, 0, 0, 0.006);
    const { tex, g: c } = canvasTex(440, 600, () => {});
    let drawnFor = '';
    const draw = () => {
      const now = new Date();
      const key = now.toDateString();
      if (key === drawnFor) return;
      drawnFor = key;
      c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, 440, 600);
      c.fillStyle = S.name === 'scifi' ? '#1d3b57' : S.name === 'office' ? S.accent : '#b8574a';
      c.fillRect(0, 0, 440, 230);
      c.fillStyle = '#fff'; c.font = `600 54px ${S.font}`; c.textAlign = 'center';
      c.fillText(now.toLocaleString([], { month: 'long' }), 220, 110);
      c.font = `400 30px ${S.font}`;
      c.fillText(String(now.getFullYear()), 220, 165);
      const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      c.font = `500 22px ${S.font}`; c.fillStyle = '#666';
      'SMTWTFS'.split('').forEach((d, i) => c.fillText(d, 40 + i * 60, 270));
      c.font = `500 26px ${S.font}`;
      for (let d = 1; d <= days; d++) {
        const cell = first + d - 1;
        const x = 40 + (cell % 7) * 60, y = 315 + Math.floor(cell / 7) * 52;
        if (d === now.getDate()) {
          c.strokeStyle = '#d33'; c.lineWidth = 4;
          c.beginPath(); c.arc(x, y - 9, 22, 0, Math.PI * 2); c.stroke();
        }
        c.fillStyle = cell % 7 === 0 ? '#c44' : '#333';
        c.fillText(String(d), x, y);
      }
      tex.needsUpdate = true;
    };
    draw();
    face(g, 0.42, 0.573, tex, 0.0125);
    for (let i = 0; i < 9; i++) cyl(g, 0.008, 0.008, 0.03, S.metal, -0.16 + i * 0.04, 0.3, 0.013, 8).rotation.x = Math.PI / 2;
    K.animate(() => draw());
    return g;
  }

  function clock(radius = 0.2) {
    const g = group();
    const rim = cyl(g, radius + 0.02, radius + 0.02, 0.05, S.name === 'home' ? S.wood : S.dark, 0, 0, 0.025, 48);
    rim.rotation.x = Math.PI / 2;
    const { tex } = canvasTex(400, 400, c => {
      c.fillStyle = S.name === 'scifi' ? '#0b1118' : '#fdfbf6';
      c.beginPath(); c.arc(200, 200, 200, 0, Math.PI * 2); c.fill();
      c.strokeStyle = S.name === 'scifi' ? S.accent : '#222';
      c.fillStyle = c.strokeStyle;
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const long = i % 5 === 0;
        c.lineWidth = long ? 8 : 3;
        c.beginPath();
        c.moveTo(200 + Math.sin(a) * (long ? 150 : 168), 200 - Math.cos(a) * (long ? 150 : 168));
        c.lineTo(200 + Math.sin(a) * 185, 200 - Math.cos(a) * 185);
        c.stroke();
      }
      c.font = `600 44px ${S.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let h = 1; h <= 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        c.fillText(String(h), 200 + Math.sin(a) * 118, 200 - Math.cos(a) * 118);
      }
    });
    const dial = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ map: tex, toneMapped: S.name !== 'scifi' }));
    dial.position.z = 0.051;
    g.add(dial);
    const hand = (len: number, w: number, mat: T.Material, z: number) => {
      const pivot = group();
      pivot.position.z = z;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.006), mat);
      m.position.y = len / 2 - len * 0.12;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    };
    const handMat = S.name === 'scifi' ? glow(S.accent) : std('#1a1a1a');
    const hh = hand(radius * 0.55, 0.018, handMat, 0.056);
    const mh = hand(radius * 0.82, 0.012, handMat, 0.06);
    const sh = hand(radius * 0.88, 0.005, glow('#e03b3b'), 0.064);
    K.animate(() => {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      sh.rotation.z = -(s / 60) * Math.PI * 2;
      mh.rotation.z = -(m / 60) * Math.PI * 2;
      hh.rotation.z = -(h / 12) * Math.PI * 2;
    });
    return g;
  }

  function calculator() {
    const g = group();
    const body = S.name === 'scifi' ? S.dark : std('#2d3137', { roughness: 0.4 });
    box(g, 0.36, 0.52, 0.05, body, 0, 0, 0.025);
    const { tex } = canvasTex(320, 80, c => {
      c.fillStyle = '#b9c9a7'; c.fillRect(0, 0, 320, 80);
      c.fillStyle = '#1f2a1a'; c.font = '600 54px monospace'; c.textAlign = 'right';
      c.fillText('3.14159', 305, 62);
    });
    face(g, 0.3, 0.075, tex, 0.051, 0, 0.18, true);
    const keyMat = std('#e8e8e8', { roughness: 0.5 });
    const opMat = std('#f08a24', { roughness: 0.5 });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      box(g, 0.062, 0.05, 0.02, c === 3 ? opMat : keyMat, -0.111 + c * 0.074, 0.09 - r * 0.068, 0.06);
    }
    return g;
  }

  function notepad() {
    const g = group();
    box(g, 0.32, 0.44, 0.012, S.wood, 0, 0, 0.006);
    const { tex } = canvasTex(300, 400, c => {
      c.fillStyle = '#fffef6'; c.fillRect(0, 0, 300, 400);
      c.strokeStyle = '#a9c4e8'; c.lineWidth = 2;
      for (let y = 70; y < 400; y += 28) { c.beginPath(); c.moveTo(0, y); c.lineTo(300, y); c.stroke(); }
      c.strokeStyle = '#e8a0a0'; c.beginPath(); c.moveTo(40, 0); c.lineTo(40, 400); c.stroke();
      c.fillStyle = '#2b3a67'; c.font = 'italic 22px "Segoe Print", "Comic Sans MS", cursive';
      ['To do:', '- water plants', '- ship v0.2', '- call mom', '- refactor kit', '- coffee'].forEach((l, i) => c.fillText(l, 50, 92 + i * 28));
    });
    face(g, 0.28, 0.37, tex, 0.013, 0, -0.02);
    box(g, 0.12, 0.035, 0.025, S.metal, 0, 0.2, 0.02);
    return g;
  }

  function whiteboard(w = 1.6, h = 0.95) {
    const g = group();
    box(g, w + 0.05, h + 0.05, 0.03, S.trim, 0, 0, 0.015);
    const { tex } = canvasTex(800, 475, c => {
      c.fillStyle = '#fbfcfd'; c.fillRect(0, 0, 800, 475);
      c.lineWidth = 5; c.lineCap = 'round';
      c.strokeStyle = '#1b5fc1'; c.font = '600 44px "Segoe Print", "Comic Sans MS", cursive'; c.fillStyle = '#1b5fc1';
      c.fillText('Q4 Roadmap', 40, 70);
      c.strokeStyle = '#2a8f3a';
      c.strokeRect(50, 120, 180, 90); c.strokeRect(320, 120, 180, 90); c.strokeRect(590, 120, 160, 90);
      c.beginPath(); c.moveTo(230, 165); c.lineTo(320, 165); c.moveTo(500, 165); c.lineTo(590, 165); c.stroke();
      c.fillStyle = '#c0392b'; c.font = '500 30px "Segoe Print", "Comic Sans MS", cursive';
      c.fillText('ship it!', 600, 300);
      c.strokeStyle = '#555'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(60, 420); for (let x = 60; x < 520; x += 20) c.lineTo(x, 420 - Math.pow((x - 60) / 460, 2) * 160 - Math.sin(x / 30) * 12); c.stroke();
    });
    face(g, w, h, tex, 0.031);
    box(g, w * 0.8, 0.03, 0.06, S.trim, 0, -h / 2 - 0.02, 0.04);
    return g;
  }

  function mailbox() {
    const g = group();
    const mat = S.name === 'scifi' ? S.metal : std(S.name === 'home' ? '#3b5d3a' : '#2f4a6b', { metalness: 0.4, roughness: 0.4 });
    box(g, 0.34, 0.42, 0.16, mat, 0, 0, 0.08);
    box(g, 0.22, 0.025, 0.01, S.dark, 0, 0.12, 0.162);
    const { tex } = canvasTex(256, 160, c => {
      c.fillStyle = '#f6f1e3'; c.fillRect(0, 0, 256, 160);
      c.strokeStyle = '#9b7b4a'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(128, 90); c.lineTo(256, 0); c.stroke();
      c.fillStyle = '#c0392b'; c.fillRect(196, 18, 40, 46);
    });
    const env = face(g, 0.2, 0.125, tex, 0.0, 0, 0.17);
    env.position.z = 0.12;
    env.rotation.x = -0.25;
    return g;
  }

  function picture(w = 0.8, h = 0.55, seed = 1) {
    const g = group();
    box(g, w + 0.08, h + 0.08, 0.04, S.name === 'scifi' ? S.metal : S.name === 'office' ? S.dark : std('#a77d3f', { metalness: 0.5, roughness: 0.35 }), 0, 0, 0.02);
    const { tex } = canvasTex(400, Math.round(400 * h / w), c => {
      const H = c.canvas.height;
      const sky = c.createLinearGradient(0, 0, 0, H);
      const pal = [['#f6c177', '#eb6f92'], ['#9ccfd8', '#31748f'], ['#ffd6a5', '#6d597a']][seed % 3];
      sky.addColorStop(0, pal[0]); sky.addColorStop(1, pal[1]);
      c.fillStyle = sky; c.fillRect(0, 0, 400, H);
      c.fillStyle = 'rgba(255,255,240,0.9)'; c.beginPath(); c.arc(300, H * 0.3, 28, 0, Math.PI * 2); c.fill();
      for (let k = 0; k < 3; k++) {
        c.fillStyle = `rgba(30,40,60,${0.35 + k * 0.2})`;
        c.beginPath(); c.moveTo(0, H);
        for (let x = 0; x <= 400; x += 20) c.lineTo(x, H * (0.55 + k * 0.12) - Math.sin(x / (60 + k * 30) + seed + k) * 30);
        c.lineTo(400, H); c.fill();
      }
    });
    face(g, w, h, tex, 0.041);
    return g;
  }

  function gauges() {
    const g = group();
    box(g, 0.9, 0.6, 0.06, S.dark, 0, 0, 0.03);
    const needles: T.Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const x = -0.28 + i * 0.28;
      const dial = cyl(g, 0.1, 0.1, 0.01, std('#f2f2f2'), x, 0.1, 0.065, 32);
      dial.rotation.x = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 32, 1, Math.PI * 0.75, Math.PI * 0.5), glow('#e74c3c'));
      ring.position.set(x, 0.1, 0.071);
      g.add(ring);
      const pivot = group();
      pivot.position.set(x, 0.1, 0.075);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.085, 0.004), std('#111'));
      n.position.y = 0.04;
      pivot.add(n);
      g.add(pivot);
      needles.push(pivot);
    }
    const bars: T.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const b = box(g, 0.045, 0.16, 0.01, glow(i > 9 ? '#e74c3c' : i > 7 ? '#f1c40f' : '#2ecc71'), -0.33 + i * 0.06, -0.15, 0.065);
      bars.push(b);
    }
    K.animate((_dt, t) => {
      needles.forEach((n, i) => { n.rotation.z = Math.sin(t * (0.7 + i * 0.3) + i) * 1.1; });
      bars.forEach((b, i) => {
        const v = 0.5 + 0.5 * Math.sin(t * 2 + i * 0.6) * Math.sin(t * 0.7 + i);
        b.scale.y = 0.15 + v;
        b.position.y = -0.23 + 0.08 * b.scale.y;
      });
    });
    return g;
  }

  function console(w = 0.75, h = 0.5) {
    const g = group();
    box(g, w + 0.08, h + 0.08, 0.06, S.name === 'home' ? std('#d8d2c4') : S.dark, 0, 0, 0.03);
    const { tex, g: c } = canvasTex(512, Math.round(512 * h / w), () => {});
    const lines = ['$ uptime', ' 12:04 up 41 days, load 0.42', '$ df -h /', ' /dev/nvme0n1p2  1.8T  61%', '$ _'];
    const H = c.canvas.height;
    let last = -1;
    K.animate((_dt, t) => {
      const blink = Math.floor(t * 2) % 2;
      if (blink === last) return;
      last = blink;
      c.fillStyle = '#04110a'; c.fillRect(0, 0, 512, H);
      c.fillStyle = '#33ff88'; c.font = '600 30px monospace';
      lines.forEach((l, i) => c.fillText(i === lines.length - 1 ? (blink ? '$ █' : '$') : l, 22, 50 + i * 42));
      tex.needsUpdate = true;
    });
    face(g, w, h, tex, 0.061, 0, 0, true);
    return g;
  }

  // ── App props: free-standing ────────────────────────────────────────────

  function bookshelf(w = 1.2, h = 2.0) {
    const g = group();
    const frame = S.name === 'scifi' ? S.metal : S.wood;
    box(g, w, h, 0.04, frame, 0, h / 2, -0.16);
    box(g, 0.04, h, 0.36, frame, -w / 2, h / 2, 0);
    box(g, 0.04, h, 0.36, frame, w / 2, h / 2, 0);
    const shelves = 5;
    const colors = ['#8e2b2b', '#2b4f8e', '#2f6b3a', '#c49a2c', '#5b3a6e', '#1f1f1f', '#b5651d', '#3c6e71'];
    let k = 0;
    for (let i = 0; i <= shelves; i++) {
      const y = 0.05 + (i * (h - 0.1)) / shelves;
      box(g, w, 0.03, 0.36, frame, 0, y, 0);
      if (i === shelves) break;
      let x = -w / 2 + 0.05;
      while (x < w / 2 - 0.08) {
        const bw = 0.03 + ((k * 37) % 5) * 0.008, bh = 0.22 + ((k * 13) % 7) * 0.015;
        box(g, bw, bh, 0.24, std(colors[k % colors.length]), x + bw / 2, y + 0.015 + bh / 2, 0.02);
        x += bw + 0.004;
        k++;
      }
    }
    return g;
  }

  function filingCabinet() {
    const g = group();
    const mat = std(S.name === 'scifi' ? '#7b8796' : S.name === 'home' ? '#6b6f73' : '#8d96a0', { metalness: 0.6, roughness: 0.4 });
    box(g, 0.5, 1.32, 0.6, mat, 0, 0.66, 0);
    for (let i = 0; i < 4; i++) {
      box(g, 0.46, 0.3, 0.01, std('#a3acb5', { metalness: 0.6, roughness: 0.35 }), 0, 0.17 + i * 0.32, 0.305);
      box(g, 0.14, 0.02, 0.03, S.metal, 0, 0.24 + i * 0.32, 0.32);
      box(g, 0.08, 0.04, 0.005, S.paper, 0, 0.29 + i * 0.32, 0.311);
    }
    return g;
  }

  function globe() {
    const g = group();
    cyl(g, 0.16, 0.2, 0.05, S.wood, 0, 0.025, 0);
    cyl(g, 0.025, 0.025, 0.75, S.metal, 0, 0.4, 0);
    const { tex } = canvasTex(512, 256, c => {
      c.fillStyle = '#2d6aa3'; c.fillRect(0, 0, 512, 256);
      c.fillStyle = '#6aa35a';
      let seed = 4;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 40; i++) {
        c.beginPath();
        const x = r() * 512, y = 40 + r() * 176;
        c.ellipse(x, y, 20 + r() * 50, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#eef'; c.fillRect(0, 0, 512, 16); c.fillRect(0, 240, 512, 16);
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    ball.position.y = 1.0;
    ball.rotation.z = 0.41;
    g.add(ball);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.008, 8, 64, Math.PI * 1.3), S.metal);
    ring.position.y = 1.0;
    ring.rotation.z = 0.41 + Math.PI / 2;
    g.add(ring);
    K.animate(dt => { ball.rotateY(dt * 0.3); });
    return g;
  }

  function holoTable() {
    const g = group();
    cyl(g, 0.55, 0.65, 0.9, S.dark, 0, 0.45, 0, 32);
    cyl(g, 0.6, 0.6, 0.04, S.metal, 0, 0.92, 0, 48);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), glow(S.accent));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.945;
    g.add(disc);
    const holoMat = new THREE.MeshBasicMaterial({ color: S.accent, wireframe: true, transparent: true, opacity: 0.6, toneMapped: false });
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 2), holoMat);
    planet.position.y = 1.45;
    g.add(planet);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.004, 6, 64), holoMat);
    orbit.position.y = 1.45;
    orbit.rotation.x = 1.2;
    g.add(orbit);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.5, 32, 1, true), new THREE.MeshBasicMaterial({ color: S.accent, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.y = 1.2;
    cone.rotation.x = Math.PI;
    cone.userData.noPick = true;
    g.add(cone);
    K.animate((dt, t) => { planet.rotation.y += dt * 0.5; orbit.rotation.z += dt * 0.8; planet.position.y = 1.45 + Math.sin(t) * 0.03; });
    return g;
  }

  function serverRack(seed = 0) {
    const g = group();
    box(g, 0.62, 2.0, 1.0, std('#1b1f24', { metalness: 0.5, roughness: 0.4 }), 0, 1.0, 0);
    const leds: T.MeshBasicMaterial[] = [];
    for (let u = 0; u < 14; u++) {
      box(g, 0.56, 0.11, 0.01, std('#2a3038', { metalness: 0.6 }), 0, 0.2 + u * 0.125, 0.505);
      for (let l = 0; l < 4; l++) {
        const m = glow(l === 0 ? '#2ecc71' : '#3498db');
        leds.push(m);
        box(g, 0.012, 0.012, 0.005, m, 0.18 + l * 0.025, 0.2 + u * 0.125, 0.512);
      }
    }
    let acc = 0;
    K.animate(dt => {
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      for (let i = 0; i < leds.length; i++) {
        if (((i * 7 + seed) % 4) === 0) continue;
        leds[i].color.set(Math.random() > 0.5 ? (i % 4 === 0 ? '#2ecc71' : '#3498db') : '#0b0f14');
      }
    });
    return g;
  }

  function camera() {
    const g = group();
    for (let i = 0; i < 3; i++) {
      const leg = cyl(g, 0.012, 0.012, 1.25, S.dark, 0, 0, 0, 8);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.sin(a) * 0.18, 0.6, Math.cos(a) * 0.18);
      leg.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
    }
    box(g, 0.24, 0.15, 0.12, std('#1c1c1c', { roughness: 0.4 }), 0, 1.32, 0);
    const lens = cyl(g, 0.05, 0.055, 0.12, std('#111', { metalness: 0.6, roughness: 0.2 }), 0, 1.32, 0.11, 24);
    lens.rotation.x = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), glow('#3a6ea5'));
    glass.position.set(0, 1.32, 0.171);
    g.add(glass);
    box(g, 0.02, 0.02, 0.01, glow('#e74c3c'), 0.09, 1.38, 0.061);
    return g;
  }

  function radio() {
    const g = group();
    box(g, 0.5, 0.3, 0.2, S.name === 'scifi' ? S.metal : S.wood, 0, 0.15, 0);
    const { tex } = canvasTex(256, 128, c => {
      c.fillStyle = '#2b2622'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#5a4b3f';
      for (let y = 8; y < 128; y += 10) for (let x = 8; x < 256; x += 10) { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
    });
    face(g, 0.28, 0.2, tex, 0.101, -0.08, 0.15);
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), glow('#ffcf7a'));
    dial.position.set(0.15, 0.2, 0.101);
    g.add(dial);
    const knob = cyl(g, 0.025, 0.025, 0.03, S.dark, 0.15, 0.1, 0.11, 16);
    knob.rotation.x = Math.PI / 2;
    const notes: T.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), glow(S.accent));
      n.userData.noPick = true;
      g.add(n);
      notes.push(n);
    }
    K.animate((_dt, t) => notes.forEach((n, i) => {
      const p = (t * 0.4 + i / 3) % 1;
      n.position.set(-0.1 + Math.sin(p * 6 + i) * 0.08, 0.32 + p * 0.4, 0);
      (n.material as T.MeshBasicMaterial).opacity = 1 - p;
      (n.material as T.MeshBasicMaterial).transparent = true;
    }));
    return g;
  }

  function microscope() {
    const g = group();
    box(g, 0.22, 0.03, 0.28, S.plastic, 0, 0.015, 0);
    box(g, 0.05, 0.36, 0.06, S.plastic, 0, 0.2, -0.09);
    box(g, 0.14, 0.02, 0.14, S.dark, 0, 0.13, 0.02);
    const tube = cyl(g, 0.03, 0.03, 0.26, S.dark, 0, 0.36, 0.0, 16);
    tube.rotation.x = 0.4;
    cyl(g, 0.02, 0.02, 0.08, S.metal, 0, 0.19, 0.03, 12);
    box(g, 0.1, 0.004, 0.06, glow('#b77dff'), 0, 0.142, 0.02);
    return g;
  }

  // ── Furniture & decor ───────────────────────────────────────────────────

  function desk(w = 1.6, d = 0.8, h = 0.76) {
    const g = group();
    box(g, w, 0.05, d, S.name === 'scifi' ? S.metal : S.wood, 0, h - 0.025, 0);
    const legMat = S.name === 'home' ? S.wood : S.metal;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.05, h - 0.05, 0.05, legMat, x * (w / 2 - 0.05), (h - 0.05) / 2, z * (d / 2 - 0.05));
    return g;
  }

  function chair(color?: string) {
    const g = group();
    const seat = color ? std(color, { roughness: 0.9 }) : S.fabric;
    box(g, 0.48, 0.08, 0.46, seat, 0, 0.47, 0);
    box(g, 0.46, 0.5, 0.07, seat, 0, 0.78, -0.2);
    cyl(g, 0.03, 0.03, 0.42, S.metal, 0, 0.22, 0, 8);
    cyl(g, 0.26, 0.26, 0.03, S.dark, 0, 0.02, 0, 5);
    return g;
  }

  function captainChair() {
    const g = group();
    cyl(g, 0.35, 0.45, 0.25, S.dark, 0, 0.12, 0, 24);
    box(g, 0.72, 0.14, 0.66, std('#5a1e24', { roughness: 0.7 }), 0, 0.52, 0);
    box(g, 0.72, 0.85, 0.14, std('#5a1e24', { roughness: 0.7 }), 0, 1.0, -0.28);
    box(g, 0.1, 0.12, 0.6, S.metal, -0.38, 0.68, 0);
    box(g, 0.1, 0.12, 0.6, S.metal, 0.38, 0.68, 0);
    box(g, 0.08, 0.02, 0.14, glow(S.accent), -0.38, 0.75, 0.1);
    box(g, 0.08, 0.02, 0.14, glow(S.accent2), 0.38, 0.75, 0.1);
    return g;
  }

  function stationConsole(w = 1.4) {
    const g = group();
    box(g, w, 0.8, 0.6, S.dark, 0, 0.4, 0);
    const top = box(g, w, 0.06, 0.66, S.metal, 0, 0.86, 0.04);
    top.rotation.x = 0.35; // tilted toward whoever stands in front (+z)
    const { tex, g: c } = canvasTex(512, 160, () => {});
    let last = -1;
    K.animate((_dt, t) => {
      const f = Math.floor(t * 3);
      if (f === last) return;
      last = f;
      c.fillStyle = '#071019'; c.fillRect(0, 0, 512, 160);
      for (let i = 0; i < 18; i++) {
        c.fillStyle = (i + f) % 5 === 0 ? S.accent2 : S.accent;
        c.globalAlpha = 0.4 + ((i * 7 + f) % 6) / 10;
        c.fillRect(14 + (i % 9) * 55, 18 + Math.floor(i / 9) * 70, 44, 52);
      }
      c.globalAlpha = 1;
      tex.needsUpdate = true;
    });
    const panel = face(g, w - 0.1, 0.42, tex, 0, 0, 0, true);
    panel.rotation.x = -Math.PI / 2 + 0.35;
    panel.position.set(0, 0.9, 0.05);
    return g;
  }

  function bed(w = 1.6, l = 2.1) {
    const g = group();
    const frame = S.name === 'scifi' ? S.metal : S.wood;
    box(g, w, 0.3, l, frame, 0, 0.15, 0);
    box(g, w - 0.06, 0.22, l - 0.06, std('#f3f1ec', { roughness: 0.95 }), 0, 0.41, 0.0);
    box(g, w - 0.04, 0.08, l * 0.62, S.fabric, 0, 0.55, l * 0.18);
    box(g, w * 0.38, 0.12, 0.35, std('#ffffff', { roughness: 1 }), -w * 0.22, 0.58, -l / 2 + 0.3);
    box(g, w * 0.38, 0.12, 0.35, std('#ffffff', { roughness: 1 }), w * 0.22, 0.58, -l / 2 + 0.3);
    box(g, w, 0.9, 0.08, frame, 0, 0.45, -l / 2 - 0.04);
    return g;
  }

  function sofa(w = 2.1) {
    const g = group();
    const f = S.fabric;
    box(g, w, 0.42, 0.9, f, 0, 0.21, 0);
    box(g, w, 0.5, 0.2, f, 0, 0.62, -0.35);
    box(g, 0.2, 0.3, 0.9, f, -w / 2 + 0.1, 0.55, 0);
    box(g, 0.2, 0.3, 0.9, f, w / 2 - 0.1, 0.55, 0);
    for (let i = 0; i < 3; i++) box(g, (w - 0.45) / 3 - 0.02, 0.12, 0.62, f, -((w - 0.45) / 3) + i * ((w - 0.45) / 3), 0.48, 0.08);
    return g;
  }

  function table(w = 1.2, d = 0.8, h = 0.75, round = false) {
    const g = group();
    const top = S.name === 'scifi' ? S.metal : S.wood;
    if (round) {
      cyl(g, w / 2, w / 2, 0.05, top, 0, h - 0.025, 0, 40);
      cyl(g, 0.06, 0.06, h - 0.05, S.metal, 0, (h - 0.05) / 2, 0, 12);
      cyl(g, 0.3, 0.3, 0.03, S.metal, 0, 0.015, 0, 24);
    } else {
      box(g, w, 0.05, d, top, 0, h - 0.025, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.05, h - 0.05, 0.05, top, x * (w / 2 - 0.06), (h - 0.05) / 2, z * (d / 2 - 0.06));
    }
    return g;
  }

  function counter(w = 2.4, d = 0.62) {
    const g = group();
    box(g, w, 0.86, d, std('#fafafa', { roughness: 0.5 }), 0, 0.43, 0);
    box(g, w + 0.02, 0.04, d + 0.03, std('#3b3f45', { roughness: 0.25, metalness: 0.2 }), 0, 0.88, 0);
    for (let i = 0; i < Math.floor(w / 0.6); i++) box(g, 0.14, 0.02, 0.02, S.metal, -w / 2 + 0.3 + i * 0.6, 0.75, d / 2 + 0.01);
    return g;
  }

  function fridge() {
    const g = group();
    box(g, 0.75, 1.85, 0.7, std('#e9ecef', { roughness: 0.3, metalness: 0.3 }), 0, 0.925, 0);
    box(g, 0.73, 0.01, 0.01, S.dark, 0, 1.25, 0.351);
    box(g, 0.03, 0.4, 0.04, S.metal, 0.3, 1.5, 0.37);
    box(g, 0.03, 0.3, 0.04, S.metal, 0.3, 0.95, 0.37);
    return g;
  }

  function wardrobe() {
    const g = group();
    box(g, 1.2, 2.0, 0.6, S.wood, 0, 1.0, 0);
    box(g, 0.005, 1.9, 0.01, S.dark, 0, 1.0, 0.301);
    box(g, 0.02, 0.2, 0.03, S.metal, -0.05, 1.05, 0.32);
    box(g, 0.02, 0.2, 0.03, S.metal, 0.05, 1.05, 0.32);
    return g;
  }

  function nightstand() {
    const g = group();
    box(g, 0.45, 0.5, 0.4, S.wood, 0, 0.25, 0);
    box(g, 0.1, 0.02, 0.02, S.metal, 0, 0.36, 0.21);
    cyl(g, 0.08, 0.1, 0.03, S.metal, 0.08, 0.515, 0, 16);
    cyl(g, 0.012, 0.012, 0.3, S.metal, 0.08, 0.67, 0, 8);
    const shade = cyl(g, 0.08, 0.13, 0.16, std('#f5ead6', { emissive: '#ffcf8a', emissiveIntensity: 0.6 }), 0.08, 0.86, 0, 20);
    shade.material = new THREE.MeshStandardMaterial({ color: '#f5ead6', emissive: '#ffcf8a', emissiveIntensity: 0.6, side: THREE.DoubleSide });
    return g;
  }

  function plant(scale = 1) {
    const g = group();
    cyl(g, 0.2 * scale, 0.15 * scale, 0.35 * scale, std('#a0522d', { roughness: 0.8 }), 0, 0.175 * scale, 0, 20);
    const leaf = std('#3f7d3a', { roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 10, 8), leaf);
      const a = (i / 12) * Math.PI * 2;
      m.scale.set(0.45, 1.5, 0.12);
      m.position.set(Math.cos(a) * 0.12 * scale, (0.55 + (i % 3) * 0.1) * scale, Math.sin(a) * 0.12 * scale);
      m.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
      g.add(m);
    }
    return g;
  }

  function rug(w = 2.4, d = 1.6, color = '#7a4a3a') {
    const g = group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), std(color, { roughness: 1 }));
    m.position.y = 0.006;
    m.receiveShadow = true;
    g.add(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.014, d - 0.2), std('#d8c7a0', { roughness: 1 }));
    b.position.y = 0.007;
    g.add(b);
    const c = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.016, d - 0.3), std(color, { roughness: 1 }));
    c.position.y = 0.008;
    g.add(c);
    g.traverse(o => { o.userData.noPick = true; });
    return g;
  }

  function reactor() {
    const g = group();
    cyl(g, 1.2, 1.4, 0.4, S.metal, 0, 0.2, 0, 32);
    cyl(g, 1.2, 1.4, 0.4, S.metal, 0, 4.0, 0, 32);
    const coreMat = new THREE.MeshBasicMaterial({ color: '#4fd8ff', transparent: true, opacity: 0.85, toneMapped: false });
    const core = cyl(g, 0.5, 0.5, 3.4, coreMat, 0, 2.1, 0, 32);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.4, 12, 6, true), new THREE.MeshStandardMaterial({ color: '#8b97a6', wireframe: true, metalness: 0.8 }));
    cage.position.y = 2.1;
    g.add(cage);
    const rings: T.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 12, 48), S.metal);
      r.rotation.x = Math.PI / 2;
      r.position.y = 1.0 + i * 1.1;
      g.add(r);
      rings.push(r);
    }
    const light = new THREE.PointLight('#4fd8ff', 6, 9, 1.5);
    light.position.y = 2.1;
    g.add(light);
    K.animate((_dt, t) => {
      const pulse = 0.75 + Math.sin(t * 2.4) * 0.25;
      coreMat.color.setHSL(0.53, 0.9, 0.45 + pulse * 0.2);
      light.intensity = 4 + pulse * 4;
      rings.forEach((r, i) => { r.position.y = 1.0 + i * 1.1 + Math.sin(t * 1.3 + i) * 0.12; });
      core.scale.set(pulse, 1, pulse);
    });
    return g;
  }

  function medBed() {
    const g = group();
    box(g, 0.9, 0.6, 2.0, S.plastic, 0, 0.3, 0);
    box(g, 0.85, 0.12, 1.95, std('#cfe8e2', { roughness: 0.9 }), 0, 0.66, 0);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 12, 32, Math.PI), S.metal);
    arch.position.set(0, 0.7, 0);
    g.add(arch);
    const scan = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.01, 0.03), glow('#3cff9a'));
    scan.userData.noPick = true;
    g.add(scan);
    K.animate((_dt, t) => { scan.position.set(0, 0.75, Math.sin(t * 1.2) * 0.9); arch.position.z = Math.sin(t * 1.2) * 0.9; });
    return g;
  }

  function labBench(w = 2.2) {
    const g = group();
    box(g, w, 0.9, 0.75, S.plastic, 0, 0.45, 0);
    box(g, w + 0.04, 0.04, 0.8, S.dark, 0, 0.92, 0);
    const tubeMat = (c: string) => new THREE.MeshPhysicalMaterial({ color: c, transparent: true, opacity: 0.6, roughness: 0.1, emissive: c, emissiveIntensity: 0.4 });
    for (let i = 0; i < 6; i++) cyl(g, 0.03, 0.03, 0.22, tubeMat(['#3cff9a', '#b77dff', '#5cc8ff'][i % 3]), -w / 2 + 0.25 + i * 0.09, 1.05, -0.2, 12);
    box(g, 0.6, 0.02, 0.15, S.metal, -w / 2 + 0.47, 0.95, -0.2);
    return g;
  }

  function crates() {
    const g = group();
    const m = std('#6b5d4a', { roughness: 0.8 });
    box(g, 0.8, 0.8, 0.8, m, 0, 0.4, 0);
    box(g, 0.6, 0.6, 0.6, m, 0.75, 0.3, 0.1);
    box(g, 0.6, 0.6, 0.6, std('#7a6a52'), 0.1, 1.1, 0.05).rotation.y = 0.3;
    return g;
  }

  function pipes(len = 6) {
    const g = group();
    const colors = ['#b08d57', '#7b8796', '#a33c3c'];
    for (let i = 0; i < 3; i++) {
      const p = cyl(g, 0.07, 0.07, len, std(colors[i], { metalness: 0.7, roughness: 0.35 }), 0, 0.3 + i * 0.22, 0, 16);
      p.rotation.z = Math.PI / 2;
    }
    for (let x = -len / 2 + 0.5; x < len / 2; x += 1.2) box(g, 0.08, 0.9, 0.2, S.dark, x, 0.45, 0);
    g.traverse(o => { o.userData.noPick = true; });
    return g;
  }

  function cubicle(w = 1.8, d = 1.6) {
    const g = group();
    const panel = std('#7d8a99', { roughness: 0.95 });
    box(g, w, 1.25, 0.06, panel, 0, 0.625, -d / 2);
    box(g, 0.06, 1.25, d, panel, -w / 2, 0.625, 0);
    box(g, w, 0.04, 0.07, S.trim, 0, 1.27, -d / 2);
    box(g, 0.07, 0.04, d, S.trim, -w / 2, 1.27, 0);
    const dk = desk(w - 0.1, 0.7);
    dk.position.set(0.02, 0, -d / 2 + 0.38);
    g.add(dk);
    const ch = chair();
    ch.position.set(0, 0, 0.1);
    ch.rotation.y = Math.PI;
    g.add(ch);
    return g;
  }

  function receptionDesk(w = 3.2) {
    const g = group();
    box(g, w, 1.1, 0.5, S.wood, 0, 0.55, 0.25);
    box(g, w, 0.75, 0.6, std('#f4f5f7'), 0, 0.375, -0.3);
    box(g, w + 0.05, 0.04, 0.55, std('#ffffff', { roughness: 0.2 }), 0, 1.12, 0.25);
    box(g, w * 0.9, 0.05, 0.01, glow(S.accent), 0, 0.95, 0.501);
    return g;
  }

  function waterCooler() {
    const g = group();
    box(g, 0.32, 1.0, 0.32, S.plastic, 0, 0.5, 0);
    cyl(g, 0.14, 0.14, 0.42, new THREE.MeshPhysicalMaterial({ color: '#8fc7ff', transparent: true, opacity: 0.55, roughness: 0.05 }), 0, 1.22, 0, 24);
    box(g, 0.04, 0.04, 0.04, glow('#3498db'), -0.06, 0.8, 0.17);
    box(g, 0.04, 0.04, 0.04, glow('#e74c3c'), 0.06, 0.8, 0.17);
    return g;
  }

  function coffeeMachine() {
    const g = group();
    box(g, 0.32, 0.42, 0.36, std('#1c1c1c', { roughness: 0.3, metalness: 0.4 }), 0, 0.21, 0);
    box(g, 0.2, 0.06, 0.1, S.metal, 0, 0.3, 0.2);
    cyl(g, 0.04, 0.035, 0.08, std('#ffffff'), 0, 0.06, 0.12, 16);
    box(g, 0.06, 0.02, 0.01, glow('#2ecc71'), 0.08, 0.36, 0.181);
    return g;
  }

  return {
    // apps
    calendar, clock, calculator, notepad, whiteboard, mailbox, picture, gauges, console,
    bookshelf, filingCabinet, globe, holoTable, serverRack, camera, radio, microscope,
    // furniture & decor
    desk, chair, captainChair, stationConsole, bed, sofa, table, counter, fridge, wardrobe,
    nightstand, plant, rug, reactor, medBed, labBench, crates, pipes, cubicle, receptionDesk,
    waterCooler, coffeeMachine,
  };
}

export type Props = ReturnType<typeof props>;
