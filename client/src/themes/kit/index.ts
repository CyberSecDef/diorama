import type * as T from 'three';
import type { AppMatch, Host, HostHint, ThemeContext, WindowHandle } from '../../theme';
import { Building, type Side, type Slot } from './building';
import { props } from './props';
import { makeStyle, type Style } from './style';
import { Walker } from './walker';

export { APPS } from './apps';
export { space, outdoors, city, roomLighting } from './env';
export type { Side } from './building';

/**
 * Everything a walkable theme needs: a Building to declare rooms in, a prop
 * library, a first-person Walker, and slot-based window hosting.
 */
export function createKit(ctx: ThemeContext, styleName: Style['name']) {
  const { THREE } = ctx;
  const style = makeStyle(THREE, styleName);
  const b = new Building(THREE, style, ctx.scene);
  const anims: ((dt: number, t: number) => void)[] = [];
  const P = props({ THREE, style, animate: fn => anims.push(fn) });
  const walker = new Walker(ctx, b, { x: 0, z: 0, yaw: 0 });
  let floatingCount = 0;

  /** Put an app prop on a wall. */
  function wallApp(obj: T.Object3D, room: string, side: Side, at: number, height: number, label: string, app: AppMatch, slot?: string) {
    b.onWall(obj, room, side, at, height);
    ctx.addProp(obj, { label, app, slot });
    return obj;
  }

  /** Put an app prop on the floor (or on furniture: pass `lift`). */
  function floorApp(obj: T.Object3D, room: string, x: number, z: number, rotY: number, label: string, app: AppMatch, o: { solid?: [number, number]; lift?: number; slot?: string } = {}) {
    b.onFloor(obj, room, x, z, rotY, o.solid);
    obj.position.y += o.lift ?? 0;
    ctx.addProp(obj, { label, app, slot: o.slot });
    return obj;
  }

  /** Desk with a monitor slot on it. Returns the slot id. */
  function workstation(id: string, room: string, x: number, z: number, rotY: number, o: { w?: number; screenW?: number; screenH?: number; chair?: boolean } = {}) {
    const w = o.w ?? 1.6;
    const desk = P.desk(w, 0.8);
    b.onFloor(desk, room, x, z, rotY, [w, 0.8], 0.8);
    const sw = o.screenW ?? 1.0, sh = o.screenH ?? 0.62;
    const y = b.rooms.get(room)!.spec.y! + 0.78 + 0.1 + sh / 2;
    // monitor sits toward the back edge; local -z is "back" of the desk
    const back = new THREE.Vector3(0, 0, -0.18).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const pos = new THREE.Vector3(x + back.x, y, z + back.z);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.04), style.dark);
    stand.position.set(pos.x - back.x * 0.15, y - sh / 2 - 0.06, pos.z - back.z * 0.15);
    stand.rotation.y = rotY;
    b.root.add(stand);
    b.freeScreen(id, room, pos, rotY, sw, sh);
    if (o.chair !== false) {
      const ch = P.chair();
      const front = new THREE.Vector3(0, 0, 0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      b.onFloor(ch, room, x + front.x, z + front.z, rotY + Math.PI);
    }
    return id;
  }

  // ── Hosting ─────────────────────────────────────────────────────────────

  interface SlotHost extends Host { slot: Slot; hover: number; hoverTo: number; bellAt: number; outline: T.MeshBasicMaterial }
  const hosts = new Set<SlotHost>();

  function pickSlot(hint: HostHint): Slot {
    const free = [...b.slots.values()].filter(s => !s.occupant && !s.floating);
    const dist = (s: Slot) => s.pos.distanceTo(hint.player);
    if (hint.slot) {
      const s = b.slots.get(hint.slot);
      if (s && !s.occupant) return s;
    }
    const room = b.roomAt(hint.player.x, hint.player.z, hint.player.y - 1.62)?.id;
    const inRoom = free.filter(s => s.room === room).sort((p, q) => dist(p) - dist(q));
    if (inRoom.length) return inRoom[0];
    const near = free.filter(s => dist(s) < 14 && Math.abs(s.pos.y - hint.player.y) < 2).sort((p, q) => dist(p) - dist(q));
    if (near.length) return near[0];
    return floatingSlot(hint);
  }

  /** No free screen nearby: conjure a free-standing one in front of the player. */
  function floatingSlot(hint: HostHint): Slot {
    const f = new THREE.Vector3(hint.facing.x, 0, hint.facing.z);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const k = floatingCount++;
    const offset = ((k % 3) - 1) * 1.9;
    let dist = 2.2;
    const feet = hint.player.y - 1.62;
    const free = (d: number) => {
      const p = hint.player.clone().addScaledVector(f, d).addScaledVector(side, offset);
      if (b.groundAt(p.x, p.z, feet) === null) return false;
      return !b.colliders.some(c => p.x > c.x0 - 0.4 && p.x < c.x1 + 0.4 && p.z > c.z0 - 0.4 && p.z < c.z1 + 0.4 && c.y1 > feet + 0.5 && c.y0 < feet + 2);
    };
    while (dist > 0.9 && !free(dist)) dist -= 0.3;
    const pos = hint.player.clone().addScaledVector(f, dist).addScaledVector(side, offset);
    pos.y = feet + 1.45;
    const rotY = Math.atan2(-f.x, -f.z);
    const slot = b.freeScreen(`floating-${k}-${Date.now()}`, null, pos, rotY, 1.5, 0.95, true);
    // a slim stand so it does not just hover
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), style.metal);
    pole.position.set(0, -0.95, -0.03);
    slot.group.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.03, 24), style.dark);
    base.position.set(0, -1.44, -0.03);
    slot.group.add(base);
    return slot;
  }

  function createHost(win: WindowHandle, hint: HostHint): Host {
    const slot = pickSlot(hint);
    slot.occupant = win.key;
    slot.idle.visible = false;
    const object = new THREE.Group();
    object.position.copy(slot.pos);
    object.rotation.y = slot.rotY;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: win.texture, toneMapped: false }));
    screen.position.z = 0.056;
    object.add(screen);
    const outline = new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), outline);
    frame.position.z = 0.054;
    object.add(frame);
    const h: SlotHost = {
      object, screen, slot, outline, hover: 0, hoverTo: 0, bellAt: -1,
      update(w) {
        const m = screen.material as T.MeshBasicMaterial;
        if (m.map !== w.texture) { m.map = w.texture; m.needsUpdate = true; }
        const fit = Math.min(slot.w / w.width, slot.h / w.height);
        screen.scale.set(w.width * fit, w.height * fit, 1);
        frame.scale.set(w.width * fit + 0.05, w.height * fit + 0.05, 1);
      },
      setHover(on) { h.hoverTo = on ? 1 : 0; },
      setFocused(on) { if (on) h.hover = h.hoverTo = 0; },
      bell() { h.bellAt = performance.now(); },
      dispose() {
        hosts.delete(h);
        slot.occupant = null;
        slot.idle.visible = true;
        if (slot.floating) b.removeSlot(slot.id);
        screen.geometry.dispose();
        (screen.material as T.Material).dispose();
        frame.geometry.dispose();
        outline.dispose();
      },
    };
    hosts.add(h);
    return h;
  }

  function frame(dt: number, t: number) {
    for (const a of anims) a(dt, t);
    const now = performance.now();
    for (const h of hosts) {
      h.hover += (h.hoverTo - h.hover) * Math.min(1, dt * 12);
      const bell = h.bellAt > 0 ? Math.max(0, 1 - (now - h.bellAt) / 700) : 0;
      h.outline.opacity = h.hover * 0.8 + bell;
      h.outline.color.set(bell > 0 ? style.accent2 : style.accent);
    }
  }

  return { THREE, style, b, P, walker, wallApp, floorApp, workstation, createHost, frame };
}
