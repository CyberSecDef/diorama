import type * as T from 'three';
import type { ThemeContext } from '../../theme';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Soft image-based lighting so metal and glass have something to reflect. */
export function roomLighting(ctx: ThemeContext, intensity = 0.5) {
  const { THREE, renderer, scene } = ctx;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
}

function skyDome(THREE: typeof T, top: string, horizon: string, bottom: string, power = 4) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) }, power: { value: power } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform float power; varying vec3 vP;
        void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(horizon, top, 1.0 - pow(1.0 - y, power)) : mix(horizon, bottom, min(1.0, -y * 6.0)); gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
}

function noiseCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  let seed = 42;
  draw(c.getContext('2d')!, () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  return c;
}

/** Deep space: stars, a big blue planet with clouds, a moon and a sun. */
export function space(ctx: ThemeContext) {
  const { THREE, scene } = ctx;
  scene.background = new THREE.Color('#02030a');
  scene.add(skyDome(THREE, '#010208', '#0c0a24', '#010208', 2));

  const n = 4000;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(800);
    pos.set([v.x, v.y, v.z], i * 3);
    const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.15, 0.5, 0.75 + Math.random() * 0.25);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, fog: false })));

  const surface = noiseCanvas(1024, 512, (g, r) => {
    g.fillStyle = '#1d4f8a'; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() > 0.3 ? '#4f7d3c' : '#a08a5a';
      g.beginPath(); g.ellipse(r() * 1024, 80 + r() * 352, 20 + r() * 90, 10 + r() * 50, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 160; i++) { g.beginPath(); g.ellipse(r() * 1024, r() * 512, 30 + r() * 120, 4 + r() * 12, r() * 0.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, 1024, 26); g.fillRect(0, 486, 1024, 26);
  });
  const ptex = new THREE.CanvasTexture(surface);
  ptex.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(260, 64, 48), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.9, fog: false }));
  planet.position.set(-120, -210, -560);
  planet.rotation.z = 0.3;
  scene.add(planet);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(272, 64, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * f * 1.6; }',
  }));
  atmo.position.copy(planet.position);
  scene.add(atmo);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 24), new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: 1, fog: false }));
  moon.position.set(260, 90, -620);
  scene.add(moon);

  // ringed gas giant on the other side of the sky
  const bands = noiseCanvas(512, 256, (g, r) => {
    for (let y = 0; y < 256; y += 4) {
      g.fillStyle = `hsl(${28 + Math.sin(y / 9) * 10 + r() * 6}, ${45 + r() * 15}%, ${48 + Math.sin(y / 5) * 12}%)`;
      g.fillRect(0, y, 512, 4);
    }
  });
  const btex = new THREE.CanvasTexture(bands);
  btex.colorSpace = THREE.SRGBColorSpace;
  const giant = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 32), new THREE.MeshStandardMaterial({ map: btex, roughness: 1, fog: false }));
  giant.position.set(220, 40, 640);
  giant.rotation.z = -0.35;
  scene.add(giant);
  const rings = new THREE.Mesh(new THREE.RingGeometry(180, 290, 96), new THREE.MeshBasicMaterial({ color: '#d9c39a', transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false }));
  rings.position.copy(giant.position);
  rings.rotation.set(Math.PI / 2 - 0.35, 0.25, 0);
  scene.add(rings);

  const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
  sun.position.set(400, 200, 300);
  scene.add(sun);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(THREE, '#fff6d8'), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(160);
  glow.position.set(520, 260, 390);
  scene.add(glow);
  return {
    update(dt: number) { planet.rotation.y += dt * 0.004; },
  };
}

function radial(THREE: typeof T, color: string) {
  const c = noiseCanvas(256, 256, g => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, color); grad.addColorStop(0.2, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A sunny afternoon: sky, lawn, trees, distant hills. */
export function outdoors(ctx: ThemeContext) {
  const { THREE, scene } = ctx;
  scene.background = new THREE.Color('#9cc8ef');
  scene.add(skyDome(THREE, '#4f8fd6', '#cfe6f7', '#6c8f4e', 3));
  scene.fog = new THREE.Fog('#cfe2ef', 60, 260);

  const grass = noiseCanvas(256, 256, (g, r) => {
    g.fillStyle = '#5f8f3e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(120,170,70,0.4)' : 'rgba(50,90,30,0.35)'; g.fillRect(r() * 256, r() * 256, 1.5, 3); }
  });
  const gt = new THREE.CanvasTexture(grass);
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  gt.repeat.set(120, 120);
  gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  scene.add(ground);

  const trunk = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 });
  const leaves = new THREE.MeshStandardMaterial({ color: '#3f7a35', roughness: 0.8 });
  const N = 70;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 8), trunk, N);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 1), leaves, N);
  const m = new THREE.Matrix4();
  let seed = 9;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = 22 + r() * 70;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.8 + r() * 0.9;
    m.compose(new THREE.Vector3(x, 1.1 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 3.2 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r(), r(), r())), new THREE.Vector3(s, s * 1.2, s));
    crowns.setMatrixAt(i, m);
  }
  scene.add(trunks, crowns);
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(60 + r() * 40, 24, 12), new THREE.MeshStandardMaterial({ color: '#6f9a58', roughness: 1 }));
    const a = (i / 9) * Math.PI * 2;
    hill.position.set(Math.cos(a) * 230, -45, Math.sin(a) * 230);
    hill.scale.y = 0.6;
    scene.add(hill);
  }

  scene.add(new THREE.HemisphereLight('#dff0ff', '#4d6b3a', 1.1));
  const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
  sun.position.set(30, 50, 20);
  scene.add(sun);
  return { update(_dt: number) {} };
}

/** High-rise view: dusk sky over a lit-up city far below. */
export function city(ctx: ThemeContext, floorY = 0) {
  const { THREE, scene } = ctx;
  scene.background = new THREE.Color('#1a1d33');
  scene.add(skyDome(THREE, '#0d1230', '#e8875a', '#0b0d16', 2.5));
  const groundY = floorY - 90;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: '#0b0d14', fog: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  scene.add(ground);

  const win = noiseCanvas(128, 256, (g, r) => {
    g.fillStyle = '#10141c'; g.fillRect(0, 0, 128, 256);
    for (let y = 4; y < 256; y += 10) for (let x = 4; x < 128; x += 9) {
      const lit = r();
      g.fillStyle = lit > 0.55 ? (lit > 0.9 ? '#ffe9b0' : '#f7c96b') : '#1a2130';
      g.fillRect(x, y, 6, 6);
    }
  });
  const wt = new THREE.CanvasTexture(win);
  wt.colorSpace = THREE.SRGBColorSpace;
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  wt.repeat.set(2, 4);
  const mat = new THREE.MeshStandardMaterial({ color: '#202634', map: wt, emissive: '#ffffff', emissiveMap: wt, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0.3, fog: false });
  const N = 420;
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N);
  const m = new THREE.Matrix4();
  let seed = 3;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = 130 + Math.pow(r(), 0.7) * 480;
    const w = 14 + r() * 26, h = 30 + Math.pow(r(), 2) * 170 * (d < 200 ? 1 : 0.7), dd = 14 + r() * 26;
    m.compose(new THREE.Vector3(Math.cos(a) * d, groundY + h / 2, Math.sin(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r()), new THREE.Vector3(w, h, dd));
    towers.setMatrixAt(i, m);
  }
  scene.add(towers);
  scene.add(new THREE.HemisphereLight('#ffd2b0', '#1a1d33', 0.6));
  const sun = new THREE.DirectionalLight('#ffb070', 1.2);
  sun.position.set(-100, 40, -200);
  scene.add(sun);
  return { update(_dt: number) {} };
}
