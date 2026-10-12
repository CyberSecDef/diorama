import type { Theme, ThemeContext } from '../theme';
import { APPS, createKit, roomLighting, space } from './kit';

/**
 * Starship: walk the decks of a ship in orbit. A central corridor connects
 * the bridge, engineering, science, medical, crew quarters and an
 * observation lounge. Windows look out on the same space as Orbit.
 */
export default function starship(ctx: ThemeContext): Theme {
  const kit = createKit(ctx, 'scifi');
  const { THREE, b, P, style: S, wallApp, floorApp, workstation } = kit;
  let sky: { update(dt: number): void };

  function setup() {
    sky = space(ctx);
    roomLighting(ctx, 0.35);
    ctx.scene.add(new THREE.HemisphereLight('#b8d4ff', '#202838', 0.5));

    // ── Rooms ────────────────────────────────────────────────────────────
    b.room({ id: 'corridor', name: 'Main Corridor', x0: -1.5, z0: -4, x1: 1.5, z1: 22, h: 3.0, spawn: { x: 0, z: 18, yaw: 0 }, light: { intensity: 8 } });
    b.room({ id: 'bridge', name: 'Bridge', x0: -7, z0: -16, x1: 7, z1: -4, h: 4.2, spawn: { x: 1.2, z: -5.2, yaw: 0.12 }, light: { intensity: 10, color: '#d8ecff' } });
    b.room({ id: 'engineering', name: 'Engineering', x0: 1.5, z0: 0, x1: 12, z1: 9, h: 4.4, wall: S.extra.engineering, spawn: { x: 3, z: 4.5, yaw: -Math.PI / 2 }, light: { color: '#ffd9a0', intensity: 7 } });
    b.room({ id: 'science', name: 'Science Lab', x0: -12, z0: 0, x1: -1.5, z1: 9, h: 3.4, wall: S.extra.science, spawn: { x: -3, z: 4.5, yaw: Math.PI / 2 }, light: { color: '#e6dcff', intensity: 9 } });
    b.room({ id: 'medical', name: 'Medical Bay', x0: 1.5, z0: 9, x1: 12, z1: 17, h: 3.2, wall: S.extra.medical, spawn: { x: 3, z: 13, yaw: -Math.PI / 2 }, light: { color: '#e8fff6', intensity: 9 } });
    b.room({ id: 'quarters', name: 'Crew Quarters', x0: -12, z0: 9, x1: -1.5, z1: 17, h: 3.0, wall: S.extra.quartersWall, floor: S.extra.quarters, spawn: { x: -3, z: 13, yaw: Math.PI / 2 }, light: { color: '#ffd7a8', intensity: 6 } });
    b.room({ id: 'lounge', name: 'Observation Lounge', x0: -7, z0: 22, x1: 7, z1: 30, h: 3.6, spawn: { x: 0, z: 23.5, yaw: Math.PI }, light: { color: '#cfe0ff', intensity: 6 } });

    b.door('corridor', 'bridge', 0, { width: 2.2, top: 2.6, sign: true });
    b.door('corridor', 'engineering', 4.5, { width: 1.6, sign: true });
    b.door('corridor', 'science', 4.5, { width: 1.6, sign: true });
    b.door('corridor', 'medical', 13, { width: 1.6, sign: true });
    b.door('corridor', 'quarters', 13, { width: 1.6, sign: true });
    b.door('corridor', 'lounge', 0, { width: 2.2, top: 2.6, sign: true });

    b.window('bridge', 'n', 0, 12.4, 0.9, 3.8);
    b.window('bridge', 'w', -10, 5, 1.1, 3.2);
    b.window('bridge', 'e', -10, 5, 1.1, 3.2);
    b.window('lounge', 's', 0, 12.4, 0.5, 3.2);
    b.window('lounge', 'w', 26, 6, 0.5, 3.2);
    b.window('lounge', 'e', 26, 6, 0.5, 3.2);
    b.window('quarters', 'w', 13, 3.2, 1.0, 2.2);
    b.window('science', 'w', 4.5, 4, 1.2, 2.6);
    b.window('medical', 'e', 13, 3, 1.1, 2.4);
    b.build();

    // corridor lights + floor guide strips
    for (let z = -2; z < 22; z += 6) {
      const l = new THREE.PointLight('#cfe6ff', 4, 8, 1.2);
      l.position.set(0, 2.7, z);
      b.root.add(l);
    }
    for (const x of [-1.25, 1.25]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 25.6), S.glow);
      strip.position.set(x, 0.006, 9);
      strip.userData.noPick = true;
      b.root.add(strip);
    }

    // ── Bridge ───────────────────────────────────────────────────────────
    b.onFloor(P.captainChair(), 'bridge', 0, -10.4, Math.PI, [0.8, 0.8]);
    b.onFloor(P.stationConsole(1.6), 'bridge', -3.6, -12.3, 0, [1.6, 0.7]);
    b.onFloor(P.stationConsole(1.6), 'bridge', 3.6, -12.3, 0, [1.6, 0.7]);
    b.onFloor(P.stationConsole(2.2), 'bridge', 0, -14.6, 0, [2.2, 0.7]);
    floorApp(P.holoTable(), 'bridge', -4.6, -6.6, 0, 'Star Chart', APPS.browser, { solid: [1.3, 1.3], slot: 'bridge-w2' });
    b.screen('bridge-w1', 'bridge', 'w', -14.6, 2.1, 1.9, 1.15);
    b.screen('bridge-w2', 'bridge', 'w', -5.6, 2.1, 1.9, 1.15);
    b.screen('bridge-e1', 'bridge', 'e', -14.6, 2.1, 1.9, 1.15);
    b.screen('bridge-e2', 'bridge', 'e', -5.6, 2.1, 1.9, 1.15);
    b.screen('bridge-s1', 'bridge', 's', -4.6, 2.0, 1.8, 1.1);
    b.screen('bridge-s2', 'bridge', 's', 4.6, 2.0, 1.8, 1.1);
    wallApp(P.clock(0.24), 'bridge', 's', 0, 3.35, "Ship's Chronometer", APPS.clock);
    wallApp(P.mailbox(), 'bridge', 's', -2.2, 1.5, 'Comms Relay', APPS.email, 'bridge-s1');
    wallApp(P.calendar(), 'bridge', 's', 2.2, 1.6, 'Mission Calendar', APPS.calendar, 'bridge-s2');
    floorApp(P.console(0.5, 0.34), 'bridge', 3.6, -12.05, 0, 'Helm Terminal', APPS.terminal, { lift: 0.75, slot: 'bridge-e1' });

    // ── Engineering ──────────────────────────────────────────────────────
    b.onFloor(P.reactor(), 'engineering', 8, 4.5, 0, [2.8, 2.8], 4.4);
    floorApp(P.serverRack(1), 'engineering', 10.2, 0.7, 0, 'Ship Logs', APPS.logs, { solid: [0.62, 1.0] });
    floorApp(P.serverRack(2), 'engineering', 11.0, 0.7, 0, 'Virtual Systems', APPS.vm, { solid: [0.62, 1.0] });
    wallApp(P.gauges(), 'engineering', 'n', 5, 1.7, 'Reactor Telemetry', APPS.monitor, 'eng-n');
    wallApp(P.console(), 'engineering', 's', 5, 1.5, 'Engineering Terminal', APPS.terminal, 'eng-e2');
    floorApp(P.crates(), 'engineering', 10.6, 7.9, 0, 'Cargo Manifest', APPS.diskUsage, { solid: [1.6, 1.0] });
    const pipes = P.pipes(8);
    b.onWall(pipes, 'engineering', 'n', 7.5, 2.9);
    b.screen('eng-n', 'engineering', 'n', 2.9, 1.8, 1.4, 0.9);
    b.screen('eng-e1', 'engineering', 'e', 2.4, 2.0, 1.9, 1.15);
    b.screen('eng-e2', 'engineering', 'e', 6.6, 2.0, 1.9, 1.15);

    // ── Science ──────────────────────────────────────────────────────────
    b.onFloor(P.labBench(2.4), 'science', -7, 8.1, Math.PI, [2.4, 0.8], 1.0);
    floorApp(P.microscope(), 'science', -7.6, 8.0, Math.PI, 'Microscope', APPS.images, { lift: 0.94, slot: 'sci-s' });
    wallApp(P.calculator(), 'science', 'n', -4, 1.5, 'Computation Unit', APPS.calculator, 'sci-n');
    wallApp(P.notepad(), 'science', 'n', -5.2, 1.5, 'Research Notes', APPS.editor, 'sci-n');
    floorApp(P.bookshelf(1.4, 2.2), 'science', -10.4, 8.66, Math.PI, 'Data Archive', APPS.docs, { solid: [1.4, 0.4] });
    floorApp(P.camera(), 'science', -2.6, 7.9, Math.PI * 1.2, 'Imaging Array', APPS.camera, { solid: [0.5, 0.5] });
    wallApp(P.console(0.6, 0.4), 'science', 'n', -10, 1.5, 'Analysis Console', APPS.spreadsheet, 'sci-n2');
    wallApp(P.picture(0.9, 0.6, 2), 'science', 's', -3.2, 1.7, 'Specimen Gallery', APPS.photos);
    b.screen('sci-n', 'science', 'n', -7.4, 1.8, 1.8, 1.1);
    b.screen('sci-n2', 'science', 'w', 1.3, 1.9, 1.5, 0.95);
    b.screen('sci-s', 'science', 's', -5.6, 1.9, 1.6, 1.0);

    // ── Medical ──────────────────────────────────────────────────────────
    b.onFloor(P.medBed(), 'medical', 6.5, 12.6, 0, [0.9, 2.0], 0.8);
    b.onFloor(P.medBed(), 'medical', 9.5, 12.6, 0, [0.9, 2.0], 0.8);
    wallApp(P.gauges(), 'medical', 'n', 6.5, 1.8, 'Vitals Monitor', APPS.monitor, 'med-e1');
    wallApp(P.notepad(), 'medical', 's', 4, 1.5, 'Patient Records', APPS.docs, 'med-e2');
    floorApp(P.filingCabinet(), 'medical', 11.5, 16.4, -Math.PI / 2, 'Pharmacy Stores', APPS.files, { solid: [0.5, 0.6] });
    floorApp(P.camera(), 'medical', 3.0, 16.2, Math.PI, 'Bio-Scanner', APPS.camera, { solid: [0.5, 0.5] });
    b.onFloor(P.plant(), 'medical', 11.4, 9.6, 0, [0.4, 0.4]);
    b.screen('med-e1', 'medical', 'e', 10.5, 1.8, 1.4, 0.9);
    b.screen('med-e2', 'medical', 'e', 15.6, 1.8, 1.4, 0.9);
    b.screen('med-s', 'medical', 's', 8, 1.8, 1.8, 1.1);

    // ── Crew quarters (bedroom) ──────────────────────────────────────────
    b.onFloor(P.bed(1.6, 2.1), 'quarters', -4.4, 15.6, Math.PI, [1.6, 2.1], 0.9);
    b.onFloor(P.nightstand(), 'quarters', -2.9, 16.5, Math.PI, [0.45, 0.4], 0.6);
    b.onFloor(P.wardrobe(), 'quarters', -11.6, 10.2, Math.PI / 2, [1.2, 0.6], 2);
    b.onFloor(P.rug(2.4, 1.6, '#3d5a73'), 'quarters', -7, 13);
    workstation('quarters-desk', 'quarters', -8, 9.6, 0, { w: 1.6 });
    wallApp(P.calendar(), 'quarters', 'n', -5.4, 1.6, 'Calendar', APPS.calendar, 'quarters-desk');
    wallApp(P.clock(), 'quarters', 'n', -3.6, 2.1, 'Clock', APPS.clock);
    wallApp(P.picture(0.9, 0.6, 0), 'quarters', 's', -7.6, 1.7, 'Photos from Home', APPS.photos, 'quarters-s');
    wallApp(P.notepad(), 'quarters', 'e', 10.6, 1.5, 'Personal Journal', APPS.editor, 'quarters-s');
    b.onFloor(P.table(0.6, 0.6, 0.7, true), 'quarters', -10.6, 16.2, 0, [0.6, 0.6], 0.7);
    floorApp(P.radio(), 'quarters', -10.6, 16.2, 0.4, 'Music', APPS.music, { lift: 0.7 });
    floorApp(P.filingCabinet(), 'quarters', -11.6, 15.3, Math.PI / 2, 'Locker', APPS.files, { solid: [0.5, 0.6] });
    b.screen('quarters-s', 'quarters', 's', -10.0, 1.7, 1.3, 0.8);

    // ── Observation lounge ───────────────────────────────────────────────
    b.onFloor(P.sofa(2.4), 'lounge', -3, 27.2, 0, [2.4, 0.9], 0.8);
    b.onFloor(P.sofa(2.4), 'lounge', 3, 27.2, 0, [2.4, 0.9], 0.8);
    b.onFloor(P.table(1.0, 1.0, 0.45, true), 'lounge', 0, 26, 0, [1, 1], 0.5);
    floorApp(P.globe(), 'lounge', 5.8, 23.2, 0, 'Star Atlas', APPS.browser, { solid: [0.5, 0.5] });
    floorApp(P.coffeeMachine(), 'lounge', -5.9, 22.8, 0, 'Galley Replicator', APPS.characters, { lift: 0.75 });
    b.onFloor(P.table(0.8, 0.6, 0.75), 'lounge', -5.9, 22.8, 0, [0.8, 0.6], 0.8);
    b.onFloor(P.plant(1.2), 'lounge', -6.3, 29.3, 0, [0.5, 0.5]);
    b.onFloor(P.plant(1.2), 'lounge', 6.3, 29.3, 0, [0.5, 0.5]);
    b.screen('lounge-n1', 'lounge', 'n', -3.8, 1.9, 2.2, 1.3);
    b.screen('lounge-n2', 'lounge', 'n', 3.8, 1.9, 2.2, 1.3);

    kit.walker.sync();
  }

  return {
    name: 'starship',
    css: {
      '--bg': '#03050c', '--fg': '#e3f2ff', '--muted': '#8aa4bf', '--accent': '#5cc8ff', '--accent-2': '#ff9a3c',
      '--panel': 'rgba(8, 16, 28, 0.78)', '--panel-border': 'rgba(92, 200, 255, 0.28)', '--backdrop': 'rgba(2, 4, 10, 0.55)',
      '--font': '"Segoe UI", system-ui, sans-serif', '--radius': '6px',
    },
    terminal: {
      background: '#06101a', foreground: '#d6f1ff', cursor: '#5cc8ff', selectionBackground: '#1b3d5a',
      black: '#0b1824', red: '#ff6b6b', green: '#5cffb0', yellow: '#ffc857', blue: '#5cc8ff', magenta: '#c49bff', cyan: '#6ef2ff', white: '#d6f1ff',
      brightBlack: '#3c5670', brightRed: '#ff9090', brightGreen: '#8dffc9', brightYellow: '#ffdb8a', brightBlue: '#8edbff', brightMagenta: '#d9bfff', brightCyan: '#a3f7ff', brightWhite: '#ffffff',
    },
    setup,
    createHost: kit.createHost,
    frame(dt, t) { kit.frame(dt, t); sky?.update(dt); },
    navigator: kit.walker,
    home: () => kit.walker.roomPose('bridge')!,
    focusDuration: 750,
  };
}
