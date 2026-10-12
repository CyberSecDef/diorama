import type * as T from 'three';
import type { CameraPose, Navigator, Room, ThemeContext } from '../../theme';
import type { Building } from './building';

const EYE = 1.62;
const RADIUS = 0.28;
const WALK = 2.8;
const RUN = 5.2;
const TURN = 1.9;
const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * First-person navigation for walkable themes.
 *   ↑/↓ walk (Shift: run) · ←/→ turn (Shift: strafe) · drag to look · wheel steps
 */
export class Walker implements Navigator {
  enabled = true;
  private feet: T.Vector3;
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private shift = false;
  private bob = 0;
  private wheelPush = 0;
  private drag: { x: number; y: number } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private ctx: ThemeContext, private b: Building, spawn: { x: number; y?: number; z: number; yaw: number }) {
    const { THREE } = ctx;
    this.feet = new THREE.Vector3(spawn.x, spawn.y ?? 0, spawn.z);
    this.yaw = spawn.yaw;
    this.bind();
  }

  private bind() {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', e => {
      this.shift = e.shiftKey;
      if (!this.enabled || !MOVE_KEYS.has(e.key) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      this.keys.add(e.key);
    });
    on(window, 'keyup', e => { this.shift = e.shiftKey; this.keys.delete(e.key); });
    on(window, 'blur', () => this.keys.clear());
    const el = this.ctx.renderer.domElement;
    on(el, 'pointerdown', e => { if (this.enabled && e.button === 0) this.drag = { x: e.clientX, y: e.clientY }; });
    on(window, 'pointerup', () => { this.drag = null; });
    on(window, 'pointermove', e => {
      if (!this.drag || !this.enabled) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.0045;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - (e.clientY - this.drag.y) * 0.0045));
      this.drag = { x: e.clientX, y: e.clientY };
    });
    on(el, 'wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      this.wheelPush += -e.deltaY * 0.004;
    }, { passive: false });
  }

  update(dt: number) {
    if (!this.enabled) { this.keys.clear(); this.drag = null; return; }
    const k = this.keys;
    let fwd = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    let strafe = 0;
    if (this.shift) strafe = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    else this.yaw += ((k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)) * TURN * dt;

    const speed = this.shift && fwd ? RUN : WALK;
    let dx = 0, dz = 0;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    if (fwd || strafe) {
      const len = Math.hypot(fwd, strafe);
      fwd /= len; strafe /= len;
      dx = (-sin * fwd + cos * strafe) * speed * dt;
      dz = (-cos * fwd - sin * strafe) * speed * dt;
      this.bob += dt * speed * 2.2;
    }
    if (Math.abs(this.wheelPush) > 0.001) {
      const step = this.wheelPush * Math.min(1, dt * 10);
      this.wheelPush -= step;
      dx += -sin * step;
      dz += -cos * step;
    }
    // Move per axis so we slide along walls instead of sticking.
    if (dx) this.tryMove(dx, 0);
    if (dz) this.tryMove(0, dz);

    const ground = this.b.groundAt(this.feet.x, this.feet.z, this.feet.y);
    if (ground !== null) {
      // Up steps quickly, fall a bit slower.
      const rate = ground > this.feet.y ? 18 : 9;
      this.feet.y += (ground - this.feet.y) * Math.min(1, dt * rate);
    }
    this.apply();
  }

  private tryMove(dx: number, dz: number) {
    const nx = this.feet.x + dx, nz = this.feet.z + dz;
    const ground = this.b.groundAt(nx, nz, this.feet.y);
    if (ground === null) return; // nothing to stand on: treat as a wall
    const y0 = Math.max(ground, this.feet.y) + 0.35, y1 = y0 + 1.4;
    for (const c of this.b.colliders) {
      if (c.y1 <= y0 || c.y0 >= y1) continue;
      const px = Math.max(c.x0, Math.min(nx, c.x1));
      const pz = Math.max(c.z0, Math.min(nz, c.z1));
      if ((nx - px) ** 2 + (nz - pz) ** 2 < RADIUS * RADIUS) return;
    }
    this.feet.x = nx;
    this.feet.z = nz;
  }

  private apply() {
    const cam = this.ctx.camera;
    const bob = Math.sin(this.bob) * 0.025 * (this.keys.size ? 1 : 0);
    cam.position.set(this.feet.x, this.feet.y + EYE + bob, this.feet.z);
    cam.up.set(0, 1, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);
  }

  /** Adopt the camera pose after a flight (focus return, room travel, theme switch). */
  sync() {
    const cam = this.ctx.camera;
    const dir = new this.ctx.THREE.Vector3();
    cam.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    this.feet.set(cam.position.x, cam.position.y - EYE, cam.position.z);
    const g = this.b.groundAt(this.feet.x, this.feet.z, this.feet.y + 0.3);
    if (g !== null) this.feet.y = g;
    this.apply();
  }

  rooms(): Room[] {
    return [...this.b.rooms.values()].map(r => ({ id: r.spec.id, name: r.spec.name, hidden: r.spec.hidden }));
  }

  currentRoom() {
    return this.b.roomAt(this.feet.x, this.feet.z, this.feet.y)?.id ?? null;
  }

  roomPose(id: string): CameraPose | null {
    const r = this.b.rooms.get(id)?.spec;
    if (!r) return null;
    const { THREE } = this.ctx;
    const sp = r.spawn ?? { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, yaw: 0 };
    const position = new THREE.Vector3(sp.x, r.y + EYE, sp.z);
    const target = position.clone().add(new THREE.Vector3(-Math.sin(sp.yaw), -0.05, -Math.cos(sp.yaw)));
    return { position, target };
  }

  pose(): CameraPose {
    const { THREE } = this.ctx;
    const position = new THREE.Vector3(this.feet.x, this.feet.y + EYE, this.feet.z);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    return { position, target: position.clone().add(dir) };
  }

  get position() {
    return this.feet;
  }

  dispose() {
    for (const c of this.cleanup) c();
  }
}
