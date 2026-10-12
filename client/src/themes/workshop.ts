import type * as THREE from 'three';
import type { Host, ThemeContext, Theme, WindowHandle } from '../theme';
import { damp, makeLabel, screenSize } from './common';

/**
 * Workshop: a warm room at dusk. Every window is a monitor on its own desk;
 * desks form a horseshoe around you, and there is always room for one more.
 */
export default function workshop(ctx: ThemeContext): Theme {
  const { THREE, scene, camera, controls } = ctx;
  const AMBER = new THREE.Color('#ffb454');
  const CENTER = new THREE.Vector3(0, 0, 3.5);
  const RADIUS = 5.2;
  const DESK_Y = 0.76;

  interface DeskHost extends Host {
    target: { pos: THREE.Vector3; rotY: number };
    focused: boolean;
    hover: number;
    hoverTo: number;
    bellAt: number;
    size: { w: number; h: number };
    led: THREE.MeshBasicMaterial;
    lamp: THREE.PointLight;
    monitor: THREE.Group;
  }
  const hosts = new Set<DeskHost>();

  const wood = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.55, metalness: 0.05 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 0.7 });
  const plastic = new THREE.MeshStandardMaterial({ color: '#1c1c20', roughness: 0.45, metalness: 0.3 });

  function setup() {
    scene.background = new THREE.Color('#120d0a');
    scene.fog = new THREE.Fog('#120d0a', 14, 30);

    // Floor: plank pattern drawn on a canvas.
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `hsl(25, 35%, ${16 + ((i * 37) % 7)}%)`;
      g.fillRect(0, i * 64, 512, 64);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, i * 64, 512, 2);
      g.fillRect(((i * 173) % 512), i * 64, 2, 64);
    }
    const floorTex = new THREE.CanvasTexture(c);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Room shell
    const wallMat = new THREE.MeshStandardMaterial({ color: '#2a201a', roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), wallMat);
    back.position.set(0, 5, CENTER.z - RADIUS - 3.5);
    back.receiveShadow = true;
    scene.add(back);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), wallMat);
      wall.position.set(side * 11, 5, 0);
      wall.rotation.y = -side * Math.PI / 2;
      scene.add(wall);
    }

    // Big window on the back wall: dusk sky.
    const sky = document.createElement('canvas');
    sky.width = 16; sky.height = 256;
    const sg = sky.getContext('2d')!;
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1b2a4a'); grad.addColorStop(0.55, '#b0567a'); grad.addColorStop(0.8, '#ff9a4a'); grad.addColorStop(1, '#ffd08a');
    sg.fillStyle = grad; sg.fillRect(0, 0, 16, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
    pane.position.set(0, 4.3, back.position.z + 0.01);
    scene.add(pane);
    for (let i = -2; i <= 2; i++) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.3, 0.1), darkWood);
      mullion.position.set(i * 3, 4.3, back.position.z + 0.05);
      scene.add(mullion);
    }
    for (const y of [2.15, 6.45]) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(12.3, 0.12, 0.25), darkWood);
      sill.position.set(0, y, back.position.z + 0.1);
      scene.add(sill);
    }

    scene.add(new THREE.HemisphereLight('#ffcf9e', '#1a0f08', 0.5));
    const sun = new THREE.DirectionalLight('#ff9a5a', 1.4);
    sun.position.set(-2, 6, back.position.z + 2);
    sun.target.position.set(0, 0, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(sun, sun.target);

    // A plant, because every workshop has one.
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 24), new THREE.MeshStandardMaterial({ color: '#8a4b2d', roughness: 0.8 }));
    pot.position.set(-6, 0.225, -1);
    pot.castShadow = true;
    scene.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3f7d3a', roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), leafMat);
      leaf.scale.set(0.5, 1.6, 0.15);
      const a = (i / 14) * Math.PI * 2;
      leaf.position.set(-6 + Math.cos(a) * 0.18, 0.75 + (i % 3) * 0.12, -1 + Math.sin(a) * 0.18);
      leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
      leaf.castShadow = true;
      scene.add(leaf);
    }

    camera.fov = 55;
    camera.updateProjectionMatrix();
    controls.minDistance = 1.5;
    controls.maxDistance = 10;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minAzimuthAngle = -Math.PI * 0.4;
    controls.maxAzimuthAngle = Math.PI * 0.4;
  }

  function createHost(win: WindowHandle): Host {
    const object = new THREE.Group();

    // Desk
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.0), wood);
    top.position.y = DESK_Y;
    top.castShadow = top.receiveShadow = true;
    object.add(top);
    for (const [x, z] of [[-1, -0.42], [1, -0.42], [-1, 0.42], [1, 0.42]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, DESK_Y, 0.06), darkWood);
      leg.position.set(x, DESK_Y / 2, z);
      leg.castShadow = true;
      object.add(leg);
    }

    // Monitor: stand + bezel + screen; the bezel grows with the window's aspect.
    const monitor = new THREE.Group();
    monitor.position.set(0, DESK_Y + 0.03, -0.15);
    object.add(monitor);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.25), plastic);
    monitor.add(foot);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.04), plastic);
    monitor.add(neck);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), plastic);
    bezel.castShadow = true;
    monitor.add(bezel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: win.texture, toneMapped: false }));
    monitor.add(screen);
    const led = new THREE.MeshBasicMaterial({ color: '#3cff7a' });
    const ledMesh = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), led);
    monitor.add(ledMesh);

    // Screen glow onto the desk.
    const lamp = new THREE.PointLight('#9ec5ff', 0.6, 2.5, 2);
    monitor.add(lamp);

    // Keyboard + mug for scale and charm
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.025, 0.22), plastic);
    kb.position.set(0, DESK_Y + 0.045, 0.25);
    kb.castShadow = true;
    object.add(kb);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 20), new THREE.MeshStandardMaterial({ color: '#e8e1d6', roughness: 0.4 }));
    mug.position.set(0.75, DESK_Y + 0.085, 0.2);
    mug.castShadow = true;
    object.add(mug);

    // Name plate on the desk front.
    const label = makeLabel(THREE, { color: '#ffe2b8', bg: 'rgba(30,18,10,0.9)' });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.175), new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, toneMapped: false }));
    plate.position.set(0, DESK_Y - 0.1, 0.51);
    object.add(plate);

    const h: DeskHost = {
      object, screen, monitor, led, lamp,
      target: { pos: new THREE.Vector3(), rotY: 0 },
      focused: false, hover: 0, hoverTo: 0, bellAt: -1,
      size: { w: 1, h: 1 },
      update(w) {
        const m = screen.material as THREE.MeshBasicMaterial;
        m.map = w.texture;
        m.needsUpdate = true;
        const s = screenSize(w.width, w.height, ctx.pxToWorld, 1.9, 1.15);
        h.size = s;
        const lift = 0.12 + s.h / 2;
        screen.scale.set(s.w, s.h, 1);
        screen.position.set(0, lift, 0.0265);
        bezel.scale.set(s.w + 0.06, s.h + 0.08, 1);
        bezel.position.set(0, lift - 0.01, 0);
        neck.scale.y = lift;
        neck.position.set(0, lift / 2, -0.04);
        ledMesh.position.set(s.w / 2 - 0.02, lift - s.h / 2 - 0.035, 0.026);
        lamp.position.set(0, lift, 0.4);
        label.set(w.title, w.iconUrl);
      },
      setHover(on) { h.hoverTo = on ? 1 : 0; },
      setFocused(on) {
        h.focused = on;
        if (on) {
          object.position.copy(h.target.pos);
          object.rotation.y = h.target.rotY;
          object.scale.setScalar(1);
          object.updateMatrixWorld(true);
        }
      },
      bell() { h.bellAt = performance.now(); },
      dispose() {
        hosts.delete(h);
        label.dispose();
        object.traverse(o => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const mat = o.material as THREE.Material;
            if (mat !== wood && mat !== darkWood && mat !== plastic) mat.dispose();
          }
        });
      },
    };
    hosts.add(h);
    return h;
  }

  /** Horseshoe of desks; past ~7 desks a second ring forms behind the first. */
  function layout(list: { host: Host; win: WindowHandle }[]) {
    const perRing = 7;
    list.forEach(({ host }, i) => {
      const h = host as DeskHost;
      const ring = Math.floor(i / perRing);
      const inRing = Math.min(perRing, list.length - ring * perRing);
      const k = i % perRing;
      const r = RADIUS + ring * 2.6;
      const spread = Math.min(Math.PI * 0.8, (inRing - 1) * (2.5 / r));
      const a = inRing === 1 ? 0 : -spread / 2 + (spread * k) / (inRing - 1);
      h.target.pos.set(CENTER.x + Math.sin(a) * r, 0, CENTER.z - Math.cos(a) * r);
      h.target.rotY = -a;
      if (h.object.position.lengthSq() === 0) {
        h.object.position.copy(h.target.pos);
        h.object.rotation.y = h.target.rotY;
        h.object.scale.setScalar(0.01);
      }
    });
  }

  function frame(dt: number, t: number) {
    const now = performance.now();
    for (const h of hosts) {
      if (!h.focused) {
        h.object.position.x = damp(h.object.position.x, h.target.pos.x, 5, dt);
        h.object.position.z = damp(h.object.position.z, h.target.pos.z, 5, dt);
        h.object.rotation.y = damp(h.object.rotation.y, h.target.rotY, 5, dt);
      }
      h.object.scale.setScalar(h.focused ? 1 : damp(h.object.scale.x, 1, 6, dt));
      h.hover = damp(h.hover, h.hoverTo, 10, dt);
      const bell = h.bellAt > 0 ? Math.max(0, 1 - (now - h.bellAt) / 700) : 0;
      h.led.color.set(bell > 0 ? (Math.floor(t * 12) % 2 ? '#ff5a3c' : '#ffb454') : '#3cff7a');
      h.lamp.intensity = 0.5 + h.hover * 0.8 + bell * 2;
      h.lamp.color.copy(new THREE.Color('#9ec5ff')).lerp(AMBER, bell);
    }
  }

  return {
    name: 'workshop',
    css: {
      '--bg': '#120d0a',
      '--fg': '#f5e6d3',
      '--muted': '#b49a80',
      '--accent': '#ffb454',
      '--accent-2': '#ff7a59',
      '--panel': 'rgba(34, 22, 14, 0.82)',
      '--panel-border': 'rgba(255, 180, 84, 0.25)',
      '--backdrop': 'rgba(10, 6, 3, 0.55)',
      '--font': '"Iosevka Aile", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
      '--radius': '6px',
    },
    terminal: {
      background: '#1a120b', foreground: '#ffd9a8', cursor: '#ffb454', selectionBackground: '#5a3a1e',
      black: '#2a1d14', red: '#ff7a59', green: '#b8d97a', yellow: '#ffb454', blue: '#8ab4d9', magenta: '#d99ab8', cyan: '#8fd9c4', white: '#f5e6d3',
      brightBlack: '#6b5544', brightRed: '#ff9c80', brightGreen: '#cfe9a0', brightYellow: '#ffd08a', brightBlue: '#add0ef', brightMagenta: '#efb8d2', brightCyan: '#b0efdd', brightWhite: '#fff8ee',
    },
    setup,
    createHost,
    layout,
    frame,
    home: () => ({ position: new THREE.Vector3(0, 2.0, 6.0), target: new THREE.Vector3(0, 1.1, -0.5) }),
    focusDuration: 800,
  };
}
