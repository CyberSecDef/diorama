import type * as THREE from 'three';
import type { Host, ThemeContext, Theme, WindowHandle } from '../theme';
import { damp, glowTexture, makeLabel, screenSize } from './common';

/**
 * Orbit: windows float as glass panels on a wide arc under a night sky,
 * each tethered to a glowing ring on a fading grid floor.
 */
export default function orbit(ctx: ThemeContext): Theme {
  const { THREE, scene, camera, controls } = ctx;
  const ACCENT = new THREE.Color('#7aa2ff');
  const ACCENT2 = new THREE.Color('#c77dff');
  const CENTER = new THREE.Vector3(0, 0, 5);
  const RADIUS = 7.5;
  const glow = glowTexture(THREE);

  interface OrbitHost extends Host {
    target: { pos: THREE.Vector3; rotY: number };
    phase: number;
    hover: number;
    hoverTo: number;
    bellAt: number;
    focused: boolean;
    size: { w: number; h: number };
  }
  const hosts = new Set<OrbitHost>();

  function setup() {
    scene.background = new THREE.Color('#05060d');
    scene.fog = new THREE.FogExp2('#0a0c1d', 0.035);

    // Sky dome: deep blue overhead, violet haze at the horizon.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color('#03040a') }, horizon: { value: new THREE.Color('#1c1640') } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = pow(1.0 - max(vP.y, 0.0), 6.0); gl_FragColor = vec4(mix(top, horizon, h), 1.0); }',
      }),
    );
    scene.add(sky);

    // Stars
    const starCount = 2500;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.05;
      v.normalize().multiplyScalar(300);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ size: 1.2, sizeAttenuation: false, color: '#c8d2ff', fog: false, transparent: true, opacity: 0.8 })));

    // Grid floor that fades into the distance.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(80, 64),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { color: { value: ACCENT.clone().multiplyScalar(0.55) } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
        fragmentShader: `uniform vec3 color; varying vec3 vW;
          float line(float c, float w){ float d = abs(fract(c - 0.5) - 0.5) / fwidth(c); return 1.0 - min(d / w, 1.0); }
          void main(){
            float g = max(line(vW.x, 1.0), line(vW.z, 1.0)) * 0.6 + max(line(vW.x * 0.2, 1.2), line(vW.z * 0.2, 1.2)) * 0.4;
            float fade = exp(-length(vW.xz) * 0.06);
            gl_FragColor = vec4(color * g, g * fade * 0.9);
          }`,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Floor glow under the arc.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({
      map: glow, color: ACCENT2, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.01, CENTER.z - RADIUS);
    scene.add(pool);

    scene.add(new THREE.HemisphereLight('#8aa0ff', '#120a24', 0.6));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(3, 8, 6);
    scene.add(key);

    camera.fov = 50;
    camera.updateProjectionMatrix();
    controls.minDistance = 1.5;
    controls.maxDistance = 16;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minAzimuthAngle = -Math.PI * 0.45;
    controls.maxAzimuthAngle = Math.PI * 0.45;
  }

  function createHost(win: WindowHandle): Host {
    const object = new THREE.Group();
    const panel = new THREE.Group();
    object.add(panel);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: win.texture, toneMapped: false }),
    );
    screen.position.z = 0.012;
    panel.add(screen);

    // Glass slab behind the screen
    const slabMat = new THREE.MeshPhysicalMaterial({
      color: '#0d1024', roughness: 0.25, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.85,
      emissive: ACCENT, emissiveIntensity: 0.05,
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.02), slabMat);
    panel.add(slab);

    // Halo
    const haloMat = new THREE.MeshBasicMaterial({
      map: glow, color: ACCENT, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
    halo.position.z = -0.05;
    panel.add(halo);

    // Title label
    const label = makeLabel(THREE, { bg: 'rgba(10,12,30,0.75)', color: '#dfe6ff' });
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.2),
      new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    panel.add(labelMesh);

    // Tether: beam down to a ring on the floor
    const beamMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6, 1, true), beamMat);
    object.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.22, 48), new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    object.add(ring);

    const h: OrbitHost = {
      object, screen,
      target: { pos: new THREE.Vector3(), rotY: 0 },
      phase: Math.random() * Math.PI * 2,
      hover: 0, hoverTo: 0, bellAt: -1, focused: false,
      size: { w: 1, h: 1 },
      update(w) {
        (screen.material as THREE.MeshBasicMaterial).map = w.texture;
        (screen.material as THREE.MeshBasicMaterial).needsUpdate = true;
        const s = screenSize(w.width, w.height, ctx.pxToWorld);
        h.size = s;
        screen.scale.set(s.w, s.h, 1);
        slab.scale.set(s.w + 0.06, s.h + 0.06, 1);
        halo.scale.set(s.w * 1.9, s.h * 1.9, 1);
        labelMesh.position.y = -s.h / 2 - 0.16;
        label.set(w.title, w.iconUrl);
      },
      setHover(on) { h.hoverTo = on ? 1 : 0; },
      setFocused(on) {
        h.focused = on;
        if (on) {
          // Snap to the resting pose so the camera frames exactly what stays put.
          h.hover = h.hoverTo = 0;
          panel.scale.setScalar(1);
          object.position.copy(h.target.pos);
          object.rotation.y = h.target.rotY;
          panel.position.y = 0;
          object.updateMatrixWorld(true);
        }
      },
      bell() { h.bellAt = performance.now(); },
      dispose() {
        label.dispose();
        object.traverse(o => {
          if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
        });
      },
    };
    hosts.add(h);
    const baseDispose = h.dispose!;
    h.dispose = () => { hosts.delete(h); baseDispose(); };
    // Remember the parts frame() animates.
    Object.assign(h, { _panel: panel, _halo: haloMat, _slab: slabMat, _beam: beam, _beamMat: beamMat, _ring: ring });
    return h;
  }

  /** Arc rows around CENTER, filling outward from the middle. */
  function layout(list: { host: Host; win: WindowHandle }[]) {
    const items = list.map(e => e.host as OrbitHost);
    const maxArc = Math.PI * 0.85;
    const gap = 0.7;
    const rows: OrbitHost[][] = [[]];
    let used = 0;
    for (const h of items) {
      const span = (h.size.w + gap) / RADIUS;
      if (used + span > maxArc && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push(h);
      used += span;
    }
    let y = 0;
    rows.forEach(row => {
      const rowH = Math.max(...row.map(h => h.size.h));
      const total = row.reduce((s, h) => s + (h.size.w + gap) / RADIUS, 0);
      let a = -total / 2;
      const baseY = 1.0 + y + rowH / 2;
      for (const h of row) {
        const span = (h.size.w + gap) / RADIUS;
        const mid = a + span / 2;
        h.target.pos.set(CENTER.x + Math.sin(mid) * RADIUS, baseY, CENTER.z - Math.cos(mid) * RADIUS);
        h.target.rotY = -mid;
        a += span;
      }
      y += rowH + 0.55;
    });
    for (const h of items) {
      if (h.object.position.lengthSq() === 0) {
        // New window: rise up from the floor at its slot.
        h.object.position.copy(h.target.pos).setY(-1.5);
        h.object.rotation.y = h.target.rotY;
      }
    }
  }

  function frame(dt: number, t: number) {
    const now = performance.now();
    for (const h of hosts) {
      const p = h as OrbitHost & Record<string, any>;
      if (!h.focused) {
        h.object.position.x = damp(h.object.position.x, h.target.pos.x, 4, dt);
        h.object.position.y = damp(h.object.position.y, h.target.pos.y, 4, dt);
        h.object.position.z = damp(h.object.position.z, h.target.pos.z, 4, dt);
        h.object.rotation.y = damp(h.object.rotation.y, h.target.rotY, 4, dt);
        p._panel.position.y = Math.sin(t * 0.7 + h.phase) * 0.035;
        h.hover = damp(h.hover, h.hoverTo, 10, dt);
        p._panel.scale.setScalar(1 + h.hover * 0.03);
      }
      const bell = h.bellAt > 0 ? Math.max(0, 1 - (now - h.bellAt) / 600) : 0;
      p._halo.opacity = 0.22 + h.hover * 0.35 + (h.focused ? 0.3 : 0) + bell * 0.8;
      p._halo.color.copy(ACCENT).lerp(ACCENT2, bell);
      p._slab.emissiveIntensity = 0.05 + h.hover * 0.25 + bell * 0.8;
      // Beam from the panel bottom to the floor ring.
      const bottom = h.object.position.y + p._panel.position.y - h.size.h / 2 - 0.3;
      p._beam.scale.y = Math.max(0.01, bottom);
      p._beam.position.y = -h.object.position.y + bottom / 2;
      p._ring.position.y = -h.object.position.y + 0.02;
      p._ring.scale.setScalar(1 + Math.sin(t * 1.5 + h.phase) * 0.06 + bell * 0.6);
      p._beamMat.opacity = 0.15 + h.hover * 0.3 + bell * 0.6;
    }
  }

  return {
    name: 'orbit',
    css: {
      '--bg': '#05060d',
      '--fg': '#e3e8ff',
      '--muted': '#8b93b8',
      '--accent': '#7aa2ff',
      '--accent-2': '#c77dff',
      '--panel': 'rgba(14, 17, 38, 0.72)',
      '--panel-border': 'rgba(122, 162, 255, 0.22)',
      '--backdrop': 'rgba(3, 4, 12, 0.55)',
      '--font': '"Inter", "Segoe UI", system-ui, sans-serif',
      '--radius': '14px',
    },
    terminal: {
      background: '#0b0d1c', foreground: '#dfe5ff', cursor: '#7aa2ff', selectionBackground: '#2a3570',
      black: '#1b1e33', red: '#ff6b8b', green: '#7ee0a4', yellow: '#ffd479', blue: '#7aa2ff', magenta: '#c77dff', cyan: '#6ee6f2', white: '#dfe5ff',
      brightBlack: '#4a5080', brightRed: '#ff8fa8', brightGreen: '#a2f0c0', brightYellow: '#ffe3a3', brightBlue: '#a3bfff', brightMagenta: '#dca6ff', brightCyan: '#9ff0f7', brightWhite: '#ffffff',
    },
    setup,
    createHost,
    layout,
    frame,
    home: () => ({ position: new THREE.Vector3(0, 2.3, 6.2), target: new THREE.Vector3(0, 2.0, 0) }),
    focusDuration: 700,
  };
}
