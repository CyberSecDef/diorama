import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AppEntry } from '../../server/protocol';
import { loadTheme, type AppMatch, type CameraPose, type Host, type PropSpec, type Theme } from './theme';
import type { Win } from './windows';

export interface Rect { x: number; y: number; w: number; h: number }

interface Entry { win: Win; host: Host }
interface Prop { object: THREE.Object3D; spec: PropSpec; baseScale: THREE.Vector3 }
type Pose = CameraPose & { up: THREE.Vector3 };

/** An app a prop resolved to; '__terminal' for the built-in terminal. */
export interface ResolvedApp { id: string; name: string }

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The Three.js side: theme world, one host per window, props, picking and camera flights. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
  readonly controls: OrbitControls;
  theme!: Theme;
  themeName = '';
  private entries = new Map<string, Entry>();
  private props: Prop[] = [];
  private apps: AppEntry[] = [];
  private t0 = performance.now();
  private tPrev = performance.now();
  private raycaster = new THREE.Raycaster();
  private hovered: { entry?: Entry; prop?: Prop } | null = null;
  private flight: { from: Pose; to: Pose; t0: number; ms: number; done: () => void } | null = null;
  private saved: CameraPose | null = null;
  private focusedKey: string | null = null;
  private tooltip = document.getElementById('tooltip')!;
  private cssKeys: string[] = [];
  private looping = false;
  /** true while a window is in the focus overlay: render less often */
  idle = false;
  /** set while 2D UI (launcher) owns the keyboard */
  blocked = false;
  private lastRender = 0;

  onPick: (key: string) => void = () => {};
  onProp: (spec: PropSpec, app: ResolvedApp | null) => void = () => {};

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
    this.raycaster.params.Points = { threshold: 0 };
    this.raycaster.params.Line = { threshold: 0 };
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindPointer();
  }

  setApps(apps: AppEntry[]) {
    this.apps = apps;
  }

  canMove = () => !this.focusedKey && !this.flight && !this.blocked;

  /** Load (or switch to) a theme. Open windows are re-hosted in the new world. */
  async useTheme(name: string) {
    if (this.theme) this.teardown();
    this.themeName = name;
    this.theme = await loadTheme(name, {
      THREE, scene: this.scene, camera: this.camera, renderer: this.renderer, controls: this.controls,
      pxToWorld: 0.0024,
      addProp: (object, spec) => this.addProp(object, spec),
      canMove: this.canMove,
    });
    await this.theme.setup();
    const home = this.theme.home?.();
    if (home) {
      this.camera.position.copy(home.position);
      this.controls.target.copy(home.target);
      this.camera.lookAt(home.target);
    }
    this.controls.enabled = !this.theme.navigator;
    this.theme.navigator?.sync();
    this.cssKeys = Object.keys(this.theme.css ?? {});
    for (const [k, v] of Object.entries(this.theme.css ?? {})) document.documentElement.style.setProperty(k, v);
    if (!this.theme.navigator) this.controls.update();
    for (const e of [...this.entries.values()].sort((a, b) => a.win.createdAt - b.win.createdAt)) this.host(e.win);
    this.relayout();
    if (!this.looping) { this.looping = true; this.loop(); }
  }

  private teardown() {
    for (const e of this.entries.values()) {
      this.scene.remove(e.host.object);
      e.host.dispose?.();
    }
    this.theme.navigator?.dispose?.();
    this.theme.dispose?.();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) {
          if (v instanceof THREE.Texture && !v.userData.dioramaWindow) v.dispose();
        }
        mat.dispose();
      }
    });
    this.scene.clear();
    this.scene.background = null;
    this.scene.environment = null;
    this.scene.fog = null;
    this.props = [];
    this.hovered = null;
    this.tooltip.classList.remove('visible');
    this.camera.up.set(0, 1, 0);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    Object.assign(this.controls, {
      enabled: true, minDistance: 0, maxDistance: Infinity, minPolarAngle: 0, maxPolarAngle: Math.PI,
      minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity,
    });
    for (const k of this.cssKeys) document.documentElement.style.removeProperty(k);
  }

  // ── Windows ─────────────────────────────────────────────────────────────

  add(win: Win, slot?: string) {
    const prev = win.onChange;
    win.onChange = () => { prev(); this.entries.get(win.key)?.host.update?.(win); };
    this.host(win, slot);
    this.relayout();
  }

  private host(win: Win, slot?: string) {
    const facing = new THREE.Vector3();
    this.camera.getWorldDirection(facing);
    const host = this.theme.createHost(win, { player: this.camera.position.clone(), facing, slot });
    this.scene.add(host.object);
    host.screen.userData.dioramaKey = win.key;
    host.object.userData.dioramaKey = win.key;
    this.entries.set(win.key, { win, host });
    host.update?.(win);
  }

  remove(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.scene.remove(e.host.object);
    e.host.dispose?.();
    this.entries.delete(key);
    if (this.hovered?.entry === e) this.hovered = null;
    this.relayout();
  }

  bell(key: string | null) {
    if (key) this.entries.get(key)?.host.bell?.();
  }

  private relayout() {
    const list = [...this.entries.values()].sort((a, b) => a.win.createdAt - b.win.createdAt);
    this.theme.layout?.(list);
  }

  // ── Props ───────────────────────────────────────────────────────────────

  private addProp(object: THREE.Object3D, spec: PropSpec) {
    const prop = { object, spec, baseScale: object.scale.clone() };
    object.traverse(o => { o.userData.dioramaProp = prop; });
    this.props.push(prop);
  }

  resolve(match: AppMatch): ResolvedApp | null {
    if (match === '__terminal') return { id: '__terminal', name: 'Terminal' };
    const lc = (s: string) => s.toLowerCase();
    for (const id of match.ids ?? []) {
      const a = this.apps.find(x => lc(x.id) === lc(id)) ?? this.apps.find(x => lc(x.id).endsWith(lc(id)));
      if (a) return a;
    }
    if (match.categories?.length) {
      const a = this.apps.find(x => match.categories!.every(c => x.categories.includes(c)));
      if (a) return a;
    }
    for (const n of match.names ?? []) {
      const a = this.apps.find(x => lc(x.name).includes(lc(n)));
      if (a) return a;
    }
    return null;
  }

  /** Where a prop is on screen (CSS px), for tests and theme debugging. */
  propScreenPosition(label: string): { x: number; y: number } | null {
    const p = this.props.find(q => q.spec.label === label);
    if (!p) return null;
    const box = new THREE.Box3().setFromObject(p.object);
    const v = box.getCenter(new THREE.Vector3()).project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }

  /** Point the camera at a prop from where we stand (tests / "find" features). */
  async lookAtProp(label: string) {
    const p = this.props.find(q => q.spec.label === label);
    if (!p || this.focusedKey) return;
    const target = new THREE.Box3().setFromObject(p.object).getCenter(new THREE.Vector3());
    await this.fly({ position: this.camera.position.clone(), target, up: new THREE.Vector3(0, 1, 0) }, 500);
    this.theme.navigator?.sync();
  }

  // ── Rooms ───────────────────────────────────────────────────────────────

  rooms() {
    return this.theme?.navigator?.rooms?.() ?? [];
  }

  currentRoom() {
    return this.theme?.navigator?.currentRoom?.() ?? null;
  }

  async goToRoom(id: string) {
    const pose = this.theme.navigator?.roomPose?.(id);
    if (!pose || this.focusedKey) return;
    await this.fly({ ...pose, up: new THREE.Vector3(0, 1, 0) }, 1100);
    this.theme.navigator?.sync();
  }

  // ── Focus ───────────────────────────────────────────────────────────────

  /** Fly the camera so the window's screen lands exactly on `rect` (CSS px). */
  focus(key: string, rect: Rect): Promise<void> {
    const e = this.entries.get(key);
    if (!e) return Promise.resolve();
    if (!this.saved) this.saved = { position: this.camera.position.clone(), target: this.lookTarget() };
    if (this.focusedKey && this.focusedKey !== key) this.entries.get(this.focusedKey)?.host.setFocused?.(false);
    this.focusedKey = key;
    this.setHover(null);
    e.host.setFocused?.(true);
    this.controls.enabled = false;
    const framed = this.framePose(e.host.screen, rect);
    const pose = this.theme.focusPose ? this.theme.focusPose(e.host, framed) : framed;
    return this.fly({ ...pose, up: framed.up });
  }

  unfocus(): Promise<void> {
    if (this.focusedKey) this.entries.get(this.focusedKey)?.host.setFocused?.(false);
    this.focusedKey = null;
    const back = this.saved ?? this.theme.home?.() ?? { position: new THREE.Vector3(0, 1.6, 6), target: new THREE.Vector3(0, 1.6, 0) };
    this.saved = null;
    return this.fly({ ...back, up: new THREE.Vector3(0, 1, 0) }).then(() => {
      if (this.theme.navigator) this.theme.navigator.sync();
      else this.controls.enabled = true;
    });
  }

  /** Where the camera is looking, as a point (flights interpolate between these). */
  private lookTarget() {
    if (!this.theme.navigator) return this.controls.target.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.camera.position.clone().addScaledVector(dir, 3);
  }

  private framePose(screen: THREE.Mesh, rect: Rect): Pose {
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

  private fly(to: Pose, ms?: number): Promise<void> {
    this.flight?.done();
    return new Promise(resolve => {
      this.flight = {
        from: { position: this.camera.position.clone(), target: this.lookTarget(), up: this.camera.up.clone() },
        to, t0: performance.now(), ms: ms ?? this.theme.focusDuration ?? 650, done: resolve,
      };
    });
  }

  // ── Picking ─────────────────────────────────────────────────────────────

  private bindPointer() {
    let down: { x: number; y: number } | null = null;
    let pending: PointerEvent | null = null;
    this.canvas.addEventListener('pointermove', ev => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) {
        this.setHover(null);
        return;
      }
      if (!pending) requestAnimationFrame(() => {
        const e = pending!;
        pending = null;
        if (!this.canMove()) return this.setHover(null);
        this.setHover(this.pick(e), e);
      });
      pending = ev;
    });
    this.canvas.addEventListener('pointerleave', () => this.setHover(null));
    this.canvas.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY }; });
    this.canvas.addEventListener('pointerup', ev => {
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (moved > 5 || ev.button !== 0 || !this.canMove()) return;
      const hit = this.pick(ev);
      if (hit?.entry) this.onPick(hit.entry.win.key);
      else if (hit?.prop) this.onProp(hit.prop.spec, this.resolve(hit.prop.spec.app));
    });
  }

  private setHover(h: { entry?: Entry; prop?: Prop } | null, ev?: PointerEvent) {
    const same = h?.entry === this.hovered?.entry && h?.prop === this.hovered?.prop;
    if (!same) {
      this.hovered?.entry?.host.setHover?.(false);
      if (this.hovered?.prop) this.hovered.prop.object.scale.copy(this.hovered.prop.baseScale);
      h?.entry?.host.setHover?.(true);
      if (h?.prop) h.prop.object.scale.copy(h.prop.baseScale).multiplyScalar(1.06);
      this.hovered = h;
      this.canvas.style.cursor = h ? 'pointer' : '';
    }
    if (h?.prop && ev) {
      const app = this.resolve(h.prop.spec.app);
      this.tooltip.innerHTML = `<b>${escapeHtml(h.prop.spec.label)}</b><span>${app ? escapeHtml(app.name) : 'not installed'}</span>`;
      this.tooltip.style.transform = `translate(${ev.clientX + 16}px, ${ev.clientY + 18}px)`;
      this.tooltip.classList.add('visible');
      this.tooltip.classList.toggle('missing', !app);
    } else {
      this.tooltip.classList.remove('visible');
    }
  }

  /** First thing under the pointer, so walls hide what is behind them. */
  private pick(ev: PointerEvent): { entry?: Entry; prop?: Prop } | null {
    const ndc = new THREE.Vector2((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObject(this.scene, true)) {
      const o = hit.object;
      if (!o.visible || o.userData.noPick || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) continue;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) {
        if (p.userData.dioramaKey) {
          const entry = this.entries.get(p.userData.dioramaKey);
          return entry ? { entry } : null;
        }
      }
      if (o.userData.dioramaProp) return { prop: o.userData.dioramaProp };
      return null;
    }
    return null;
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

    const nav = this.theme.navigator;
    if (this.flight) {
      const f = this.flight;
      const ease = this.theme.ease ?? easeInOutCubic;
      const t = Math.min(1, (now - f.t0) / f.ms);
      const k = ease(t);
      this.camera.position.lerpVectors(f.from.position, f.to.position, k);
      const look = new THREE.Vector3().lerpVectors(f.from.target, f.to.target, k);
      this.camera.up.lerpVectors(f.from.up, f.to.up, k).normalize();
      this.camera.lookAt(look);
      if (t >= 1) {
        this.flight = null;
        this.controls.target.copy(f.to.target);
        f.done();
      }
    } else if (nav) {
      nav.enabled = this.canMove();
      nav.update(dt);
    } else if (this.controls.enabled) {
      this.controls.update();
    }
    this.theme.frame?.(dt, (now - this.t0) / 1000);
    this.renderer.render(this.scene, this.camera);
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
