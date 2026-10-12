import type { Theme, ThemeContext } from '../theme';
import { APPS, createKit, outdoors, roomLighting } from './kit';

/**
 * House: a two-storey home on a sunny lawn. The entry hall's staircase leads
 * up to a landing; downstairs are the living room, kitchen, office and a small
 * library, upstairs the bedroom, a hobby studio and the bathroom.
 */
export default function house(ctx: ThemeContext): Theme {
  const kit = createKit(ctx, 'home');
  const { THREE, b, P, style: S, wallApp, floorApp, workstation } = kit;
  const UP = 3.1;

  const at = (m: InstanceType<typeof THREE.Mesh>, x: number, y: number, z: number) => { m.position.set(x, y, z); return m; };

  function setup() {
    outdoors(ctx);
    roomLighting(ctx, 0.45);

    // ── Ground floor (ceilings come from the floors above) ───────────────
    b.room({ id: 'hall', name: 'Entry Hall', x0: -2, z0: 0, x1: 2, z1: 6, h: UP + 2.8, spawn: { x: -0.6, z: 5.2, yaw: 0 }, light: { intensity: 9 } });
    b.room({ id: 'living', name: 'Living Room', x0: -8, z0: -6, x1: -2, z1: 6, h: 3, ceiling: false, spawn: { x: -3, z: 1.5, yaw: Math.PI / 2 + 0.4 } });
    b.room({ id: 'kitchen', name: 'Kitchen', x0: 2, z0: 0, x1: 8, z1: 6, h: 3, ceiling: false, floor: S.extra.kitchen, wall: S.extra.kitchenWall, spawn: { x: 3, z: 3, yaw: -Math.PI / 2 } });
    b.room({ id: 'office', name: 'Home Office', x0: 2, z0: -6, x1: 8, z1: 0, h: 3, ceiling: false, wall: S.extra.officeWall, spawn: { x: 5, z: -1, yaw: 0 } });
    b.room({ id: 'library', name: 'Library', x0: -2, z0: -6, x1: 2, z1: 0, h: 3, ceiling: false, floor: S.extra.carpet, spawn: { x: -1, z: -1, yaw: 0 }, light: { intensity: 5, color: '#ffd9a0' } });

    // ── Upper floor ─────────────────────────────────────────────────────
    b.room({ id: 'landing', name: 'Landing', x0: -2, z0: -6, x1: 2, z1: 0, y: UP, h: 2.8, floor: S.extra.carpet, hidden: true, spawn: { x: 1.3, z: -1, yaw: 0 } });
    b.room({ id: 'bedroom', name: 'Bedroom', x0: -8, z0: -6, x1: -2, z1: 6, y: UP, h: 2.8, floor: S.extra.carpet, wall: S.extra.bedroomWall, spawn: { x: -3, z: -3, yaw: Math.PI / 2 } });
    b.room({ id: 'studio', name: 'Hobby Studio', x0: 2, z0: -6, x1: 8, z1: 0, y: UP, h: 2.8, spawn: { x: 3, z: -3, yaw: -Math.PI / 2 } });
    b.room({ id: 'bathroom', name: 'Bathroom', x0: 2, z0: 0, x1: 8, z1: 6, y: UP, h: 2.8, floor: S.extra.bathroom, wall: S.extra.bathroom, spawn: { x: 5, z: 1, yaw: Math.PI } });

    b.door('hall', 'living', 3, { width: 1.4 });
    b.door('hall', 'kitchen', 3, { width: 1.4 });
    b.door('hall', 'library', -1.1, { width: 1.1 });
    b.door('library', 'living', -3, { width: 1.0 });
    b.door('library', 'office', -3, { width: 1.0 });
    b.door('office', 'kitchen', 5, { width: 1.0 });
    // top of the stairs: an opening from the stairwell onto the landing
    b.door('hall', 'landing', 1.3, { width: 1.3, frame: false });
    b.door('landing', 'bedroom', -3, { width: 1.0 });
    b.door('landing', 'studio', -3, { width: 1.0 });
    b.door('studio', 'bathroom', 5, { width: 1.0 });

    // windows (exterior walls only)
    b.window('living', 'w', -2.5, 2.4, 0.8, 2.3);
    b.window('living', 's', -5, 2.6, 0.8, 2.3);
    b.window('living', 'n', -5.6, 1.6, 0.9, 2.2);
    b.window('kitchen', 's', 5.2, 2.2, 1.0, 2.2);
    b.window('kitchen', 'e', 3.2, 1.6, 1.1, 2.1);
    b.window('office', 'e', -2, 1.6, 0.9, 2.2);
    b.window('office', 'n', 3.4, 1.4, 0.9, 2.2);
    b.window('hall', 's', 0, 1.6, UP + 0.6, UP + 2.3);
    b.window('bedroom', 'w', -4.2, 1.8, 0.8, 2.2);
    b.window('bedroom', 's', -5, 2.0, 0.8, 2.2);
    b.window('studio', 'n', 5, 2.4, 0.8, 2.2);
    b.window('studio', 'e', -3, 1.6, 0.8, 2.2);
    b.window('bathroom', 'e', 3, 1.2, 1.3, 2.2);
    b.window('landing', 'n', 0, 1.6, 0.8, 2.2);
    b.build();

    // stairs up the east side of the hall, rising northward onto the landing
    b.stairs({ x0: 0.65, z0: 0, x1: 1.88, z1: 5.0, y0: 0, y1: UP, axis: 'z', up: -1, open: ['x0'] });
    // front door (closed), porch light
    b.box(-0.55, 0, 5.87, 0.55, 2.15, 5.93, S.wood, { collide: false });
    b.box(0.35, 1.0, 5.83, 0.42, 1.06, 5.86, S.metal, { collide: false });
    // pitched roof
    const roofMat = new THREE.MeshStandardMaterial({ color: '#6e3b2c', roughness: 0.85 });
    for (const sgn of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.15, 7.4), roofMat);
      r.position.set(0, UP + 2.8 + 1.6, sgn * 3.2);
      r.rotation.x = sgn * 0.48;
      b.root.add(r);
    }

    // ── Living room ──────────────────────────────────────────────────────
    b.screen('living-tv', 'living', 'n', -3.6, 1.45, 2.2, 1.25);
    b.onFloor(P.sofa(2.4), 'living', -3.6, -1.6, Math.PI, [2.4, 0.9], 0.8);
    b.onFloor(P.table(1.1, 0.6, 0.42), 'living', -3.6, -3.4, 0, [1.1, 0.6], 0.45);
    b.onFloor(P.rug(3, 2.2), 'living', -3.6, -3.0);
    floorApp(P.bookshelf(1.6, 2.1), 'living', -7.68, 3.6, Math.PI / 2, 'Bookshelf', APPS.docs, { solid: [1.6, 0.4], slot: 'living-tv' });
    b.onFloor(P.table(0.5, 0.5, 0.6, true), 'living', -6.4, -1.6, 0, [0.5, 0.5], 0.6);
    floorApp(P.radio(), 'living', -6.4, -1.6, 0.6, 'Record Player', APPS.music, { lift: 0.6 });
    wallApp(P.picture(1.1, 0.7, 0), 'living', 's', -2.9, 1.7, 'Family Photos', APPS.photos, 'living-s');
    wallApp(P.picture(0.6, 0.8, 1), 'living', 'e', -1.2, 1.6, 'Art Print', APPS.images, 'living-tv');
    b.onFloor(P.plant(1.3), 'living', -7.4, -5.4, 0, [0.5, 0.5]);
    b.onFloor(P.plant(1.1), 'living', -2.5, 5.4, 0, [0.5, 0.5]);
    b.screen('living-s', 'living', 's', -7, 1.6, 1.0, 0.65);

    // ── Kitchen ──────────────────────────────────────────────────────────
    b.onFloor(P.counter(3.6), 'kitchen', 7.6, 3.4, -Math.PI / 2, [3.6, 0.62], 0.9);
    b.onFloor(P.fridge(), 'kitchen', 7.55, 0.75, -Math.PI / 2, [0.75, 0.7], 1.9);
    floorApp(P.coffeeMachine(), 'kitchen', 7.6, 4.6, -Math.PI / 2, 'Coffee Machine', APPS.characters, { lift: 0.9 });
    b.onFloor(P.table(1.4, 0.9, 0.75), 'kitchen', 4.4, 3.4, 0, [1.4, 0.9], 0.8);
    for (const [x, z, r] of [[3.7, 2.6, 0], [5.1, 2.6, 0], [3.7, 4.2, Math.PI], [5.1, 4.2, Math.PI]] as const) b.onFloor(P.chair('#c9a27a'), 'kitchen', x, z, r);
    wallApp(P.calendar(), 'kitchen', 'n', 3.4, 1.55, 'Family Calendar', APPS.calendar, 'kitchen-w');
    wallApp(P.clock(0.17), 'kitchen', 'n', 6.6, 2.2, 'Kitchen Clock', APPS.clock);
    wallApp(P.console(0.42, 0.3), 'kitchen', 'w', 1.0, 1.4, 'Recipe Tablet', APPS.browser, 'kitchen-w');
    b.screen('kitchen-w', 'kitchen', 'w', 5.0, 1.65, 1.1, 0.68);

    // ── Home office ──────────────────────────────────────────────────────
    workstation('office-desk', 'office', 5.6, -5.35, 0, { w: 1.9, screenW: 1.1, screenH: 0.66 });
    wallApp(P.calculator(), 'office', 'e', -4.4, 1.45, 'Calculator', APPS.calculator, 'office-desk');
    wallApp(P.console(0.6, 0.42), 'office', 'e', -0.8, 1.45, 'Computer Terminal', APPS.terminal, 'office-w');
    floorApp(P.filingCabinet(), 'office', 2.4, -1.2, Math.PI / 2, 'Filing Cabinet', APPS.files, { solid: [0.5, 0.6], slot: 'office-w' });
    wallApp(P.notepad(), 'office', 'w', -1.1, 1.8, 'Notepad', APPS.editor, 'office-w');
    wallApp(P.mailbox(), 'office', 's', 3.2, 1.3, 'Mail', APPS.email, 'office-desk');
    wallApp(P.whiteboard(1.2, 0.7), 'office', 's', 7.0, 1.55, 'Ideas Board', APPS.writer, 'office-w');
    b.screen('office-w', 'office', 'w', -4.9, 1.6, 1.3, 0.8);

    // ── Library ─────────────────────────────────────────────────────────
    floorApp(P.bookshelf(1.5, 2.2), 'library', -1.05, -5.68, 0, 'Reading Shelf', APPS.docs, { solid: [1.5, 0.4], slot: 'library-e' });
    b.onFloor(P.bookshelf(1.5, 2.2), 'library', 0.95, -5.68, 0, [1.5, 0.4], 2.2);
    floorApp(P.globe(), 'library', 1.3, -2.2, 0, 'Globe', APPS.browser, { solid: [0.5, 0.5], slot: 'library-e' });
    b.onFloor(P.chair('#7a4a3a'), 'library', -0.8, -3.0, Math.PI * 0.8);
    b.onFloor(P.rug(2.2, 1.6, '#4a3a5a'), 'library', 0, -3.2);
    b.screen('library-e', 'library', 'e', -3.4, 1.6, 1.0, 0.65);

    // ── Landing ─────────────────────────────────────────────────────────
    b.onFloor(P.plant(1.0), 'landing', -1.6, -5.5, 0, [0.4, 0.4]);
    wallApp(P.picture(0.8, 0.55, 2), 'landing', 'w', -1.2, 1.6, 'Gallery', APPS.photos);

    // ── Bedroom ─────────────────────────────────────────────────────────
    b.onFloor(P.bed(1.7, 2.1), 'bedroom', -6.85, 0, Math.PI / 2, [1.7, 2.1], 0.9);
    b.onFloor(P.nightstand(), 'bedroom', -7.6, -1.3, Math.PI / 2, [0.4, 0.45], 0.6);
    b.onFloor(P.nightstand(), 'bedroom', -7.6, 1.3, Math.PI / 2, [0.4, 0.45], 0.6);
    wallApp(P.clock(0.16), 'bedroom', 'w', 0, 1.85, 'Alarm Clock', APPS.clock);
    floorApp(P.radio(), 'bedroom', -7.62, 1.3, Math.PI / 2, 'Bedside Radio', APPS.music, { lift: 0.5 });
    b.onFloor(P.wardrobe(), 'bedroom', -4.5, -5.6, 0, [1.2, 0.6], 2);
    b.onFloor(P.rug(2.6, 1.8, '#5b6b8a'), 'bedroom', -4.6, 0);
    b.screen('bedroom-tv', 'bedroom', 'e', 2.8, 1.5, 1.6, 0.95);
    wallApp(P.calendar(), 'bedroom', 'n', -6.8, 1.6, 'Calendar', APPS.calendar, 'bedroom-tv');
    wallApp(P.notepad(), 'bedroom', 's', -2.8, 1.45, 'Journal', APPS.editor, 'bedroom-tv');
    b.onFloor(P.plant(0.9), 'bedroom', -2.6, 5.4, 0, [0.4, 0.4]);

    // ── Hobby studio ────────────────────────────────────────────────────
    workstation('studio-desk', 'studio', 6.9, -0.6, Math.PI, { w: 1.7, screenW: 1.1, screenH: 0.66 });
    floorApp(P.camera(), 'studio', 3.2, -5.2, Math.PI * 0.2, 'Camera', APPS.camera, { solid: [0.5, 0.5], slot: 'studio-w' });
    wallApp(P.picture(1.0, 0.7, 1), 'studio', 'w', -4.8, 1.6, 'Photo Prints', APPS.photos, 'studio-w');
    floorApp(P.serverRack(3), 'studio', 7.5, -5.4, 0, 'Home Server', APPS.monitor, { solid: [0.62, 1.0] });
    wallApp(P.console(0.5, 0.36), 'studio', 'n', 2.9, 1.5, 'Code Station', APPS.code, 'studio-desk');
    b.screen('studio-w', 'studio', 'w', -1.2, 1.55, 1.3, 0.8);

    // ── Bathroom ────────────────────────────────────────────────────────
    b.onFloor(P.counter(1.6, 0.55), 'bathroom', 7.65, 4.6, -Math.PI / 2, [1.6, 0.55], 0.9);
    const tub = new THREE.Group();
    const porcelain = new THREE.MeshStandardMaterial({ color: '#f6f7f8', roughness: 0.2 });
    tub.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.8), porcelain), 0, 0.275, 0));
    tub.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.6), new THREE.MeshStandardMaterial({ color: '#a9d8ea', roughness: 0.05 })), 0, 0.5, 0));
    b.onFloor(tub, 'bathroom', 3.1, 5.3, 0, [1.7, 0.8], 0.6);
    const mirror = new THREE.Group();
    mirror.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.03), S.trim), 0, 0, 0.015));
    mirror.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.64), new THREE.MeshStandardMaterial({ color: '#dfe9ee', metalness: 1, roughness: 0.02 })), 0, 0, 0.032));
    wallApp(mirror, 'bathroom', 'e', 4.6, 1.6, 'Mirror', APPS.camera);
  }

  return {
    name: 'house',
    css: {
      '--bg': '#1d1a16', '--fg': '#fbf4e8', '--muted': '#c8b8a2', '--accent': '#e8a54b', '--accent-2': '#5aa36a',
      '--panel': 'rgba(40, 32, 26, 0.78)', '--panel-border': 'rgba(232, 165, 75, 0.3)', '--backdrop': 'rgba(20, 16, 12, 0.5)',
      '--font': '"Segoe UI", system-ui, sans-serif', '--radius': '10px',
    },
    terminal: {
      background: '#1f1a15', foreground: '#f3e6d3', cursor: '#e8a54b', selectionBackground: '#4a3a28',
      black: '#2a221b', red: '#e06c5a', green: '#9cc069', yellow: '#e8a54b', blue: '#7aa5c8', magenta: '#c88bb0', cyan: '#7cc3b5', white: '#f3e6d3',
      brightBlack: '#6b5a4a', brightRed: '#f08c7a', brightGreen: '#b8d68a', brightYellow: '#f5c27a', brightBlue: '#9cc0dd', brightMagenta: '#dcaac8', brightCyan: '#9edbcf', brightWhite: '#fffaf2',
    },
    setup,
    createHost: kit.createHost,
    frame: kit.frame,
    navigator: kit.walker,
    home: () => kit.walker.roomPose('hall')!,
    focusDuration: 750,
  };
}
