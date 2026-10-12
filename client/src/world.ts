import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadTheme, type CameraPose, type Host, type Theme } from './theme';
import type { Win } from './windows';

export interface Rect { x: number; y: number; w: number; h: number }

interface Entry { win: Win; host: Host }

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The Three.js side: theme world, one host per window, picking and camera flights. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
  readonly controls: OrbitControls;
  theme!: Theme;
  private entries = new Map<string, Entry>();
  private t0 = performance.now();
  private tPrev = performance.now();
  private raycaster = new THREE.Raycaster();
  private hovered: Entry | null = null;
  private flight: { from: CameraPose & { up: THREE.Vector3 }; to: CameraPose & { up: THREE.Vector3 }; t0: number; ms: number; done: () => void } | null = null;
  private saved: CameraPose | null = null;
  private focusedKey: string | null = null;
  /** true while a window is in the focus overlay: render less often */
  idle = false;
  private lastRender = 0;

  onPick: (key: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindPointer();
  }

  async useTheme(name: string) {
    this.theme = await loadTheme(name, {
      THREE, scene: this.scene, camera: this.camera, renderer: this.renderer, controls: this.controls, pxToWorld: 0.0024,
    });
    await this.theme.setup();
    const home = this.theme.home?.();
    if (home) {
      this.camera.position.copy(home.position);
      this.controls.target.copy(home.target);
    }
    for (const [k, v] of Object.entries(this.theme.css ?? {})) document.documentElement.style.setProperty(k, v);
    this.controls.update();
    this.loop();
  }

  // ── Windows ─────────────────────────────────────────────────────────────

  add(win: Win) {
    const host = this.theme.createHost(win);
    this.scene.add(host.object);
    host.screen.userData.dioramaKey = win.key;
    const entry = { win, host };
    this.entries.set(win.key, entry);
    const prev = win.onChange;
    win.onChange = () => { prev(); host.update?.(win); };
    host.update?.(win);
    this.relayout();
  }

  remove(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.scene.remove(e.host.object);
    e.host.dispose?.();
    this.entries.delete(key);
    if (this.hovered === e) this.hovered = null;
    this.relayout();
  }

  bell(key: string | null) {
    if (key) this.entries.get(key)?.host.bell?.();
  }

  private relayout() {
    const list = [...this.entries.values()].sort((a, b) => a.win.createdAt - b.win.createdAt);
    this.theme.layout(list);
  }

  // ── Focus ───────────────────────────────────────────────────────────────

  /** Fly the camera so the window's screen lands exactly on `rect` (CSS px). */
  focus(key: string, rect: Rect): Promise<void> {
    const e = this.entries.get(key);
    if (!e) return Promise.resolve();
    if (!this.saved) this.saved = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    if (this.focusedKey && this.focusedKey !== key) this.entries.get(this.focusedKey)?.host.setFocused?.(false);
    this.focusedKey = key;
    e.host.setFocused?.(true);
    this.controls.enabled = false;
    const framed = this.framePose(e.host.screen, rect);
    const pose = this.theme.focusPose ? this.theme.focusPose(e.host, framed) : framed;
    return this.fly({ ...pose, up: (framed as any).up ?? new THREE.Vector3(0, 1, 0) });
  }

  unfocus(): Promise<void> {
    if (this.focusedKey) this.entries.get(this.focusedKey)?.host.setFocused?.(false);
    this.focusedKey = null;
    const back = this.saved ?? this.theme.home?.() ?? { position: new THREE.Vector3(0, 1.6, 6), target: new THREE.Vector3(0, 1.6, 0) };
    this.saved = null;
    return this.fly({ ...back, up: new THREE.Vector3(0, 1, 0) }).then(() => {
      this.controls.enabled = true;
    });
  }

  private framePose(screen: THREE.Mesh, rect: Rect): CameraPose & { up: THREE.Vector3 } {
    screen.updateWorldMatrix(true, false);
    const geo = screen.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const center = box.getCenter(new THREE.Vector3()).applyMatrix4(screen.matrixWorld);
    const scale = new THREE.Vector3();
    screen.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    const worldW = (box.max.x - box.min.x) * scale.x;
    const worldH = (box.max.y - box.min.y) * scale.y;
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(screen.matrixWorld);
    const vh = innerHeight, vw = innerWidth;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanH = tanV * this.camera.aspect;
    // Distance at which the mesh projects to exactly rect.h (or rect.w) pixels.
    const dH = (worldH * vh) / (2 * tanV * rect.h);
    const dW = (worldW * vw) / (2 * tanH * rect.w);
    const d = Math.max(dH, dW);
    // Rect may be off-centre (chrome bars): shift the camera so the mesh lands there.
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    const pxToWorld = (2 * d * tanV) / vh;
    const offX = (rect.x + rect.w / 2 - vw / 2) * pxToWorld;
    const offY = (rect.y + rect.h / 2 - vh / 2) * pxToWorld;
    const shift = right.clone().multiplyScalar(-offX).add(up.clone().multiplyScalar(offY));
    const target = center.clone().add(shift);
    const position = target.clone().add(normal.multiplyScalar(d));
    return { position, target, up };
  }

  private fly(to: CameraPose & { up: THREE.Vector3 }): Promise<void> {
    this.flight?.done();
    return new Promise(resolve => {
      this.flight = {
        from: { position: this.camera.position.clone(), target: this.controls.target.clone(), up: this.camera.up.clone() },
        to, t0: performance.now(), ms: this.theme.focusDuration ?? 650, done: resolve,
      };
    });
  }

  // ── Picking ─────────────────────────────────────────────────────────────

  private bindPointer() {
    let down: { x: number; y: number } | null = null;
    this.canvas.addEventListener('pointermove', ev => {
      if (!this.controls.enabled) return;
      const e = this.pick(ev);
      if (e !== this.hovered) {
        this.hovered?.host.setHover?.(false);
        e?.host.setHover?.(true);
        this.hovered = e;
        this.canvas.style.cursor = e ? 'pointer' : '';
      }
    });
    this.canvas.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY }; });
    this.canvas.addEventListener('pointerup', ev => {
      if (!down || !this.controls.enabled) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (moved > 5 || ev.button !== 0) return;
      const e = this.pick(ev);
      if (e) this.onPick(e.win.key);
    });
  }

  private pick(ev: PointerEvent): Entry | null {
    const ndc = new THREE.Vector2((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const screens = [...this.entries.values()].map(e => e.host.screen);
    const hit = this.raycaster.intersectObjects(screens, false)[0];
    return hit ? this.entries.get(hit.object.userData.dioramaKey) ?? null : null;
  }

  // ── Loop ────────────────────────────────────────────────────────────────

  private resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    // Behind the focus overlay the world only needs to tick along.
    if (this.idle && !this.flight && now - this.lastRender < 100) return;
    this.lastRender = now;
    const dt = Math.min((now - this.tPrev) / 1000, 0.1);
    this.tPrev = now;
    for (const e of this.entries.values()) e.win.flush();

    if (this.flight) {
      const f = this.flight;
      const ease = this.theme.ease ?? easeInOutCubic;
      const t = Math.min(1, (now - f.t0) / f.ms);
      const k = ease(t);
      this.camera.position.lerpVectors(f.from.position, f.to.position, k);
      this.controls.target.lerpVectors(f.from.target, f.to.target, k);
      this.camera.up.lerpVectors(f.from.up, f.to.up, k).normalize();
      this.camera.lookAt(this.controls.target);
      if (t >= 1) { this.flight = null; f.done(); }
    } else if (this.controls.enabled) {
      this.controls.update();
    }
    this.theme.frame?.(dt, (now - this.t0) / 1000);
    this.renderer.render(this.scene, this.camera);
  };
}
