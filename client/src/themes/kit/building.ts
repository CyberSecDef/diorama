import type * as T from 'three';
import type { Style } from './style';
import { worldUV } from './style';

export type Side = 'n' | 's' | 'e' | 'w';

export interface RoomSpec {
  id: string;
  name: string;
  /** Footprint; north is -z, east is +x. */
  x0: number; z0: number; x1: number; z1: number;
  /** floor height (default 0) and ceiling height above it (default 3) */
  y?: number;
  h?: number;
  floor?: T.Material | false;
  wall?: T.Material;
  outer?: T.Material;
  ceiling?: T.Material | false;
  /** skip walls (open plan, or a neighbour provides it) */
  walls?: Partial<Record<Side, boolean>>;
  light?: { color?: string; intensity?: number } | false;
  /** where "go to room" puts you; yaw 0 looks north (-z) */
  spawn?: { x: number; z: number; yaw: number };
  /** keep out of the rooms menu (corridors, stairwells) */
  hidden?: boolean;
}

export interface Collider { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }
export interface FloorRegion { x0: number; z0: number; x1: number; z1: number; y: number; y1?: number; axis?: 'x' | 'z' }

interface Opening { center: number; width: number; bottom: number; top: number; glass: boolean; frame: boolean; sign?: string }

interface Room { spec: Required<Pick<RoomSpec, 'y' | 'h'>> & RoomSpec; openings: Record<Side, Opening[]> }

export interface Slot {
  id: string;
  room: string | null;
  group: T.Group;
  idle: T.Object3D;
  pos: T.Vector3;
  rotY: number;
  w: number;
  h: number;
  occupant: string | null;
  floating: boolean;
}

const WALL_T = 0.12;

/**
 * Declarative building kit. Declare rooms, doors and windows, then build().
 * Produces meshes plus the data the walker needs (floors, colliders, rooms)
 * and the screen slots windows are hosted on.
 */
export class Building {
  readonly rooms = new Map<string, Room>();
  readonly colliders: Collider[] = [];
  readonly floors: FloorRegion[] = [];
  readonly slots = new Map<string, Slot>();
  readonly root: T.Group;
  private built = false;

  constructor(private THREE: typeof T, private style: Style, scene: T.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'building';
    scene.add(this.root);
  }

  room(spec: RoomSpec) {
    this.rooms.set(spec.id, { spec: { y: 0, h: 3, ...spec }, openings: { n: [], s: [], e: [], w: [] } });
    return spec.id;
  }

  /** Cut a doorway through the wall two rooms share. `at` is the world x or z of its centre. */
  door(a: string, b: string, at: number, opts: { width?: number; top?: number; sign?: boolean; frame?: boolean } = {}) {
    const ra = this.rooms.get(a)!.spec, rb = this.rooms.get(b)!.spec;
    const eps = 0.01;
    let sa: Side, sb: Side;
    if (Math.abs(ra.x1 - rb.x0) < eps) { sa = 'e'; sb = 'w'; }
    else if (Math.abs(ra.x0 - rb.x1) < eps) { sa = 'w'; sb = 'e'; }
    else if (Math.abs(ra.z1 - rb.z0) < eps) { sa = 's'; sb = 'n'; }
    else if (Math.abs(ra.z0 - rb.z1) < eps) { sa = 'n'; sb = 's'; }
    else throw new Error(`rooms ${a} and ${b} do not share a wall`);
    // Rooms on different levels (a double-height stairwell opening onto an
    // upper floor): the doorway sits at the higher floor in both walls.
    const sill = Math.max(ra.y ?? 0, rb.y ?? 0);
    const mk = (r: RoomSpec, sign?: string): Opening => {
      const bottom = sill - (r.y ?? 0);
      return { center: at, width: opts.width ?? 1.1, bottom, top: bottom + (opts.top ?? 2.2), glass: false, frame: opts.frame ?? true, sign };
    };
    this.rooms.get(a)!.openings[sa].push(mk(ra, opts.sign ? rb.name : undefined));
    this.rooms.get(b)!.openings[sb].push(mk(rb, opts.sign ? ra.name : undefined));
  }

  /** Glass window in a room's wall. Bottom/top are heights above that room's floor. */
  window(room: string, side: Side, at: number, width: number, bottom = 0.9, top = 2.3) {
    this.rooms.get(room)!.openings[side].push({ center: at, width, bottom, top, glass: true, frame: false });
  }

  /** Plain hole (no glass, no frame) — e.g. an archway or a pass-through. */
  hole(room: string, side: Side, at: number, width: number, bottom = 0, top = 2.4) {
    this.rooms.get(room)!.openings[side].push({ center: at, width, bottom, top, glass: false, frame: false });
  }

  // ── Geometry helpers ────────────────────────────────────────────────────

  /** Axis-aligned box from min/max corners. Collides by default when it is above ankle height. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: T.Material | T.Material[], opts: { collide?: boolean; shadow?: boolean; parent?: T.Object3D } = {}) {
    const { THREE } = this;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    const tile = (Array.isArray(mat) ? mat[4] : mat).userData.tile;
    if (tile) worldUV(geo, w, h, d, tile);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = opts.shadow ?? false;
    (opts.parent ?? this.root).add(m);
    if (opts.collide ?? true) this.colliders.push({ x0, z0, x1, z1, y0, y1 });
    return m;
  }

  collider(c: Collider) {
    this.colliders.push(c);
  }

  floor(r: FloorRegion) {
    this.floors.push(r);
  }

  /** A straight flight of stairs that you can walk: visual steps + a ramp floor region. */
  stairs(o: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; axis: 'x' | 'z'; up: 1 | -1; mat?: T.Material; open?: ('x0' | 'x1' | 'z0' | 'z1')[] }) {
    const rise = o.y1 - o.y0;
    const n = Math.max(2, Math.round(rise / 0.18));
    const len = o.axis === 'x' ? o.x1 - o.x0 : o.z1 - o.z0;
    const mat = o.mat ?? this.style.wood;
    for (let i = 0; i < n; i++) {
      const top = o.y0 + ((i + 1) * rise) / n;
      // step i covers the i-th slice in the "up" direction
      const a0 = o.up > 0 ? (i * len) / n : len - ((i + 1) * len) / n;
      const a1 = a0 + len / n;
      if (o.axis === 'x') this.box(o.x0 + a0, top - 0.06, o.z0, o.x0 + a1, top, o.z1, mat, { collide: false });
      else this.box(o.x0, top - 0.06, o.z0 + a0, o.x1, top, o.z0 + a1, mat, { collide: false });
      // riser
      const s = this.style.trim;
      if (o.axis === 'x') this.box(o.x0 + a0, o.y0, o.z0 + 0.02, o.x0 + a1, top - 0.06, o.z1 - 0.02, s, { collide: false });
      else this.box(o.x0 + 0.02, o.y0, o.z0 + a0, o.x1 - 0.02, top - 0.06, o.z0 + a1, s, { collide: false });
    }
    const [lo, hi] = o.up > 0 ? [o.y0, o.y1] : [o.y1, o.y0];
    this.floors.push({ x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, y: lo, y1: hi, axis: o.axis });
    // Open sides: keep people on the floor beside the stairs from walking into
    // the solid block once it is taller than a step. Starts where rise > 0.4.
    const skip = (0.4 / rise) * len;
    const [a0, a1] = o.up > 0 ? [skip, len] : [0, len - skip];
    for (const side of o.open ?? []) {
      const t = 0.05;
      if (o.axis === 'z') {
        const x = side === 'x0' ? o.x0 - t : o.x1;
        if (side === 'x0' || side === 'x1') this.colliders.push({ x0: x, x1: x + t, z0: o.z0 + a0, z1: o.z0 + a1, y0: o.y0, y1: o.y0 + 0.6 });
      } else {
        const z = side === 'z0' ? o.z0 - t : o.z1;
        if (side === 'z0' || side === 'z1') this.colliders.push({ x0: o.x0 + a0, x1: o.x0 + a1, z0: z, z1: z + t, y0: o.y0, y1: o.y0 + 0.6 });
      }
    }
  }

  /** Railing along a line (axis-aligned), with a collider. */
  rail(x0: number, z0: number, x1: number, z1: number, y: number, h = 1.0) {
    const { THREE } = this;
    const mat = this.style.trim;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const posts = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), mat);
      p.position.set(x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t);
      this.root.add(p);
    }
    const t = 0.03;
    this.box(Math.min(x0, x1) - t, y + h - 0.05, Math.min(z0, z1) - t, Math.max(x0, x1) + t, y + h + 0.01, Math.max(z0, z1) + t, mat, { collide: false });
    this.colliders.push({ x0: Math.min(x0, x1) - 0.06, z0: Math.min(z0, z1) - 0.06, x1: Math.max(x0, x1) + 0.06, z1: Math.max(z0, z1) + 0.06, y0: y, y1: y + h });
  }

  /** Point on a room's inner wall surface, facing into the room. `at` is world x (n/s) or z (e/w). */
  anchor(room: string, side: Side, at: number, height: number) {
    const r = this.rooms.get(room)!.spec;
    const y = r.y + height;
    const { THREE } = this;
    switch (side) {
      case 'n': return { pos: new THREE.Vector3(at, y, r.z0 + WALL_T), rotY: 0 };
      case 's': return { pos: new THREE.Vector3(at, y, r.z1 - WALL_T), rotY: Math.PI };
      case 'w': return { pos: new THREE.Vector3(r.x0 + WALL_T, y, at), rotY: Math.PI / 2 };
      case 'e': return { pos: new THREE.Vector3(r.x1 - WALL_T, y, at), rotY: -Math.PI / 2 };
    }
  }

  /** Place an object against a wall (its local +Z faces into the room). */
  onWall(obj: T.Object3D, room: string, side: Side, at: number, height: number) {
    const a = this.anchor(room, side, at, height);
    obj.position.copy(a.pos);
    obj.rotation.y = a.rotY;
    this.root.add(obj);
    return obj;
  }

  /** Place an object on a room's floor; `solid` = [width, depth] footprint collider (unrotated, i.e. at rotY 0/π). */
  onFloor(obj: T.Object3D, room: string, x: number, z: number, rotY = 0, solid?: [number, number], height = 1.2) {
    const r = this.rooms.get(room)!.spec;
    obj.position.set(x, r.y, z);
    obj.rotation.y = rotY;
    this.root.add(obj);
    if (solid) {
      const swap = Math.abs(Math.sin(rotY)) > 0.7;
      const [w, d] = swap ? [solid[1], solid[0]] : solid;
      this.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, y0: r.y, y1: r.y + height });
    }
    return obj;
  }

  // ── Screen slots ────────────────────────────────────────────────────────

  /** A wall-mounted display a window can be hosted on. `cy` = centre height above the floor. */
  screen(id: string, room: string, side: Side, at: number, cy: number, w: number, h: number) {
    const a = this.anchor(room, side, at, cy);
    return this.addSlot(id, room, a.pos, a.rotY, w, h, false);
  }

  /** A free-standing display (desk monitor, console). pos is the screen centre. */
  freeScreen(id: string, room: string | null, pos: T.Vector3, rotY: number, w: number, h: number, floating = false) {
    return this.addSlot(id, room, pos, rotY, w, h, floating);
  }

  private addSlot(id: string, room: string | null, pos: T.Vector3, rotY: number, w: number, h: number, floating: boolean) {
    const { THREE } = this;
    const s = this.style;
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = rotY;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), s.dark);
    bezel.position.z = 0.025;
    group.add(bezel);
    const idle = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.standbyTexture(), toneMapped: false }));
    idle.position.z = 0.051;
    group.add(idle);
    if (s.name === 'scifi') {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.012, 0.012), s.glow);
      edge.position.set(0, -h / 2 - 0.05, 0.04);
      group.add(edge);
    }
    this.root.add(group);
    const slot: Slot = { id, room, group, idle, pos: pos.clone(), rotY, w, h, occupant: null, floating };
    this.slots.set(id, slot);
    return slot;
  }

  removeSlot(id: string) {
    const s = this.slots.get(id);
    if (!s) return;
    this.root.remove(s.group);
    s.group.traverse(o => { if ((o as T.Mesh).geometry) (o as T.Mesh).geometry.dispose(); });
    this.slots.delete(id);
  }

  private standbyTex?: T.Texture;
  private standbyTexture() {
    if (this.standbyTex) return this.standbyTex;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 320;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, '#0b0f16'); grad.addColorStop(1, '#05070b');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 320);
    g.strokeStyle = this.style.accent; g.globalAlpha = 0.5; g.lineWidth = 3;
    g.beginPath(); g.moveTo(256, 120); g.lineTo(296, 143); g.lineTo(296, 189); g.lineTo(256, 212); g.lineTo(216, 189); g.lineTo(216, 143); g.closePath(); g.stroke();
    g.globalAlpha = 0.45; g.fillStyle = this.style.accent;
    g.font = `500 22px ${this.style.font}`; g.textAlign = 'center';
    g.fillText('STANDBY', 256, 250);
    this.standbyTex = new this.THREE.CanvasTexture(c);
    this.standbyTex.colorSpace = this.THREE.SRGBColorSpace;
    return this.standbyTex;
  }

  // ── Build ───────────────────────────────────────────────────────────────

  build() {
    if (this.built) return;
    this.built = true;
    for (const room of this.rooms.values()) this.buildRoom(room);
  }

  private buildRoom(room: Room) {
    const { THREE } = this;
    const r = room.spec;
    const s = this.style;
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const wallMat = r.wall ?? s.wall;
    const outerMat = r.outer ?? s.wallOuter;

    if (r.floor !== false) {
      // top face = floor, underside = ceiling (it is the ceiling of whatever is below)
      const fm = r.floor ?? s.floor;
      const f = this.box(r.x0, r.y - 0.1, r.z0, r.x1, r.y, r.z1, [fm, fm, fm, s.ceiling, fm, fm], { collide: false });
      f.receiveShadow = true;
      this.floors.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y: r.y });
    }
    if (r.ceiling !== false) {
      const mat = r.ceiling ?? s.ceiling;
      const geo = new THREE.PlaneGeometry(w, d);
      const tile = mat.userData.tile;
      if (tile) {
        const uv = geo.getAttribute('uv') as T.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
      }
      const c = new THREE.Mesh(geo, mat);
      c.rotation.x = Math.PI / 2;
      c.position.set((r.x0 + r.x1) / 2, r.y + r.h, (r.z0 + r.z1) / 2);
      this.root.add(c);
    }
    if (r.light !== false) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const span = Math.max(w, d);
      const light = new THREE.PointLight(r.light?.color ?? (s.name === 'home' ? '#ffe3b8' : '#ffffff'), r.light?.intensity ?? 3 + span * 0.6, span * 1.4 + 3, 1);
      light.position.set(cx, r.y + r.h - 0.35, cz);
      this.root.add(light);
      // visible fixture
      const fx = s.name === 'scifi' ? [Math.min(w, d) * 0.5, 0.18] : s.name === 'office' ? [1.2, 0.6] : [0.5, 0.5];
      const fixture = new THREE.Mesh(new THREE.BoxGeometry(fx[0], 0.04, fx[1]), s.glow);
      fixture.position.set(cx, r.y + r.h - 0.02, cz);
      fixture.userData.noPick = true;
      this.root.add(fixture);
    }

    const sides: Side[] = ['n', 's', 'e', 'w'];
    for (const side of sides) {
      if (r.walls?.[side] === false) continue;
      this.buildWall(r, side, room.openings[side], wallMat, outerMat);
    }
  }

  private buildWall(r: Room['spec'], side: Side, openings: Opening[], inner: T.Material, outer: T.Material) {
    const axisX = side === 'n' || side === 's';
    const from = axisX ? r.x0 : r.z0;
    const to = axisX ? r.x1 : r.z1;
    const fixed = side === 'n' ? r.z0 + WALL_T / 2 : side === 's' ? r.z1 - WALL_T / 2 : side === 'w' ? r.x0 + WALL_T / 2 : r.x1 - WALL_T / 2;
    // face order +x, -x, +y, -y, +z, -z
    const mats: T.Material[] = [inner, inner, inner, inner, inner, inner];
    if (side === 'n') { mats[4] = inner; mats[5] = outer; }
    if (side === 's') { mats[4] = outer; mats[5] = inner; }
    if (side === 'w') { mats[0] = inner; mats[1] = outer; }
    if (side === 'e') { mats[0] = outer; mats[1] = inner; }

    const piece = (a0: number, a1: number, b0: number, b1: number, collide: boolean) => {
      if (a1 - a0 < 0.005 || b1 - b0 < 0.005) return;
      const y0 = r.y + b0, y1 = r.y + b1;
      if (axisX) this.box(a0, y0, fixed - WALL_T / 2, a1, y1, fixed + WALL_T / 2, mats, { collide });
      else this.box(fixed - WALL_T / 2, y0, a0, fixed + WALL_T / 2, y1, a1, mats, { collide });
    };
    const blocker = (a0: number, a1: number, b0 = 0, b1 = r.h) => {
      const y0 = r.y + b0, y1 = r.y + b1;
      if (axisX) this.colliders.push({ x0: a0, z0: fixed - WALL_T / 2, x1: a1, z1: fixed + WALL_T / 2, y0, y1 });
      else this.colliders.push({ x0: fixed - WALL_T / 2, z0: a0, x1: fixed + WALL_T / 2, z1: a1, y0, y1 });
    };

    const ops = [...openings].sort((p, q) => p.center - q.center);
    let cursor = from;
    for (const op of ops) {
      const a0 = Math.max(from, op.center - op.width / 2), a1 = Math.min(to, op.center + op.width / 2);
      piece(cursor, a0, 0, r.h, true);
      piece(a0, a1, 0, op.bottom, false);
      piece(a0, a1, op.top, r.h, false);
      if (op.glass) blocker(a0, a1);
      else if (op.bottom > 0.3) { blocker(a0, a1, 0, op.bottom); blocker(a0, a1, op.top, r.h); }
      if (op.glass) this.glassPane(axisX, fixed, a0, a1, r.y + op.bottom, r.y + op.top);
      if (op.frame) this.doorFrame(r, side, a0, a1, op.bottom, op.top);
      if (op.sign) this.sign(r, side, (a0 + a1) / 2, op.top + 0.22, op.sign);
      cursor = a1;
    }
    piece(cursor, to, 0, r.h, true);
  }

  private glassPane(axisX: boolean, fixed: number, a0: number, a1: number, y0: number, y1: number) {
    const m = axisX
      ? this.box(a0, y0, fixed - 0.01, a1, y1, fixed + 0.01, this.style.glass, { collide: false })
      : this.box(fixed - 0.01, y0, a0, fixed + 0.01, y1, a1, this.style.glass, { collide: false });
    m.userData.noPick = true;
    // mullion frame
    const t = this.style.trim;
    const f = 0.04;
    if (axisX) {
      this.box(a0, y0 - f, fixed - 0.05, a1, y0, fixed + 0.05, t, { collide: false });
      this.box(a0, y1, fixed - 0.05, a1, y1 + f, fixed + 0.05, t, { collide: false });
    } else {
      this.box(fixed - 0.05, y0 - f, a0, fixed + 0.05, y0, a1, t, { collide: false });
      this.box(fixed - 0.05, y1, a0, fixed + 0.05, y1 + f, a1, t, { collide: false });
    }
  }

  private doorFrame(r: Room['spec'], side: Side, a0: number, a1: number, bottom: number, top: number) {
    const { THREE } = this;
    const mat = this.style.name === 'scifi' ? this.style.glow : this.style.trim;
    const thick = this.style.name === 'scifi' ? 0.03 : 0.07;
    const g = new THREE.Group();
    const w = a1 - a0;
    const jamb = (x: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(thick, top - bottom, 0.03), mat);
      m.position.set(x, (top + bottom) / 2, 0.015);
      g.add(m);
    };
    jamb(-w / 2 - thick / 2);
    jamb(w / 2 + thick / 2);
    const head = new THREE.Mesh(new THREE.BoxGeometry(w + thick * 2, thick, 0.03), mat);
    head.position.set(0, top + thick / 2, 0.015);
    g.add(head);
    g.traverse(o => { o.userData.noPick = true; });
    this.onWall(g, r.id, side, (a0 + a1) / 2, 0);
  }

  private sign(r: Room['spec'], side: Side, at: number, y: number, text: string) {
    const { THREE } = this;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d')!;
    const s = this.style;
    g.fillStyle = s.name === 'scifi' ? '#0d141c' : s.name === 'office' ? '#1e2a38' : '#3a2c22';
    g.beginPath(); g.roundRect(0, 0, 512, 96, 14); g.fill();
    g.fillStyle = s.name === 'home' ? '#f4e6cf' : s.accent;
    g.font = `600 44px ${s.font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.name === 'scifi' ? text.toUpperCase() : text, 256, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.position.z = 0.01;
    m.userData.noPick = true;
    const holder = new THREE.Group();
    holder.add(m);
    this.onWall(holder, r.id, side, at, y);
  }

  // ── Queries (used by the walker) ────────────────────────────────────────

  /** Highest walkable surface under (x,z) that is not above feetY + step. */
  groundAt(x: number, z: number, feetY: number, step = 0.5): number | null {
    let best: number | null = null;
    for (const f of this.floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      let y = f.y;
      if (f.y1 !== undefined) {
        const t = f.axis === 'x' ? (x - f.x0) / (f.x1 - f.x0) : (z - f.z0) / (f.z1 - f.z0);
        y = f.y + (f.y1 - f.y) * Math.min(1, Math.max(0, t));
      }
      if (y <= feetY + step && (best === null || y > best)) best = y;
    }
    return best;
  }

  roomAt(x: number, z: number, feetY: number): Room['spec'] | null {
    let best: Room['spec'] | null = null;
    for (const { spec: r } of this.rooms.values()) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      if (feetY < r.y - 0.6 || feetY > r.y + r.h - 0.5) continue;
      if (!best || r.y > best.y || (best.hidden && !r.hidden)) best = r;
    }
    return best;
  }
}
