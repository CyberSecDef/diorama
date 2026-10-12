import type { Theme, ThemeContext } from '../theme';
import { APPS, createKit, city, roomLighting, type Side } from './kit';

/**
 * Corporate HQ: a glass-walled floor high above a city at dusk. Lobby, open
 * office with cubicles, conference, server room, records, mail and break
 * rooms; an atrium staircase climbs to the executive level.
 */
export default function tower(ctx: ThemeContext): Theme {
  const kit = createKit(ctx, 'office');
  const { THREE, b, P, style: S, wallApp, floorApp, workstation } = kit;
  const H = 3.4, UP = 3.6;

  /** Floor-to-ceiling glass along an exterior wall. */
  function curtain(room: string, side: Side) {
    const r = b.rooms.get(room)!.spec;
    const [a0, a1] = side === 'n' || side === 's' ? [r.x0, r.x1] : [r.z0, r.z1];
    b.window(room, side, (a0 + a1) / 2, a1 - a0 - 0.5, 0.08, (r.h ?? 3) - 0.18);
  }

  function logo(text: string, w = 2.4) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1f3a5f'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = '#ffffff'; g.font = `700 110px ${S.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 512, 120);
    g.fillStyle = S.accent2; g.fillRect(312, 200, 400, 10);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w / 4, 0.06), [S.dark, S.dark, S.dark, S.dark, new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }), S.dark]);
    m.position.z = 0.03;
    const grp = new THREE.Group();
    grp.add(m);
    return grp;
  }

  function setup() {
    city(ctx, 0);
    roomLighting(ctx, 0.5);

    // ── Ground floor ─────────────────────────────────────────────────────
    b.room({ id: 'lobby', name: 'Lobby', x0: -5, z0: 4, x1: 5, z1: 12, h: H, floor: S.extra.lobby, spawn: { x: 0, z: 11, yaw: 0 }, light: { intensity: 10 } });
    b.room({ id: 'mail', name: 'Mail Room', x0: -15, z0: 4, x1: -5, z1: 12, h: H, floor: S.extra.concrete, spawn: { x: -6, z: 8, yaw: Math.PI / 2 } });
    b.room({ id: 'break', name: 'Break Room', x0: 5, z0: 4, x1: 15, z1: 12, h: H, floor: S.extra.lobby, spawn: { x: 6, z: 8, yaw: -Math.PI / 2 }, light: { color: '#fff1dc' } });
    b.room({ id: 'open', name: 'Open Office', x0: -15, z0: -4, x1: 10, z1: 4, h: H, spawn: { x: 1, z: 3, yaw: 1.0 }, light: { intensity: 14 } });
    b.room({ id: 'atrium', name: 'Atrium', x0: 10, z0: -4, x1: 15, z1: 4, h: UP + H, floor: S.extra.lobby, spawn: { x: 11.2, z: 3.2, yaw: -0.45 }, light: { intensity: 8 } });
    b.room({ id: 'conference', name: 'Conference Room', x0: -15, z0: -12, x1: -5, z1: -4, h: 3.5, ceiling: false, spawn: { x: -10, z: -5, yaw: 0 } });
    b.room({ id: 'server', name: 'Server Room', x0: -5, z0: -12, x1: 5, z1: -4, h: 3.5, ceiling: false, floor: S.extra.server, wall: S.extra.concrete, spawn: { x: 0, z: -5, yaw: 0 }, light: { color: '#a8d4ff', intensity: 8 } });
    b.room({ id: 'records', name: 'Records', x0: 5, z0: -12, x1: 15, z1: -4, h: 3.5, ceiling: false, spawn: { x: 7.5, z: -5, yaw: 0 } });

    // ── Executive level ─────────────────────────────────────────────────
    b.room({ id: 'exec', name: 'Executive Office', x0: 5, z0: -12, x1: 15, z1: -4, y: UP, h: H, floor: S.extra.exec, spawn: { x: 14, z: -5, yaw: Math.PI / 2 }, light: { color: '#fff0d8' } });
    b.room({ id: 'lounge', name: 'Sky Lounge', x0: -5, z0: -12, x1: 5, z1: -4, y: UP, h: H, floor: S.extra.exec, spawn: { x: 0, z: -5, yaw: 0 }, light: { color: '#ffe0c0' } });
    b.room({ id: 'boardroom', name: 'Boardroom', x0: -15, z0: -12, x1: -5, z1: -4, y: UP, h: H, wall: S.extra.accentWall, spawn: { x: -6, z: -8, yaw: Math.PI / 2 } });

    b.door('lobby', 'open', 0, { width: 2.4, top: 2.5, sign: true });
    b.door('mail', 'open', -10, { width: 1.2, sign: true });
    b.door('break', 'open', 7.5, { width: 1.4, sign: true });
    b.door('lobby', 'mail', 8, { width: 1.1 });
    b.door('lobby', 'break', 8, { width: 1.1 });
    b.door('open', 'atrium', 0, { width: 2.4, top: 2.6, frame: false });
    b.door('open', 'conference', -10, { width: 1.2, sign: true });
    b.door('open', 'server', 0, { width: 1.2, sign: true });
    b.door('open', 'records', 7.5, { width: 1.2, sign: true });
    b.door('atrium', 'exec', 14, { width: 1.5, frame: false });
    b.door('exec', 'lounge', -8, { width: 1.4, sign: true });
    b.door('lounge', 'boardroom', -8, { width: 1.4, sign: true });

    for (const [room, side] of [
      ['mail', 's'], ['break', 's'], ['mail', 'w'], ['open', 'w'], ['conference', 'w'], ['boardroom', 'w'],
      ['break', 'e'], ['atrium', 'e'], ['records', 'e'], ['exec', 'e'],
      ['conference', 'n'], ['records', 'n'], ['boardroom', 'n'], ['lounge', 'n'], ['exec', 'n'],
    ] as [string, Side][]) curtain(room, side);
    b.window('lobby', 's', -2.8, 4.2, 0.08, H - 0.18);
    b.window('lobby', 's', 2.8, 4.2, 0.08, H - 0.18);
    b.build();

    b.stairs({ x0: 13.3, z0: -4, x1: 14.86, z1: 3.6, y0: 0, y1: UP, axis: 'z', up: -1, open: ['x0'], mat: S.metal });
    for (const z of [-2, 1.5]) {
      const l = new THREE.PointLight('#ffffff', 6, 12, 1.2);
      l.position.set(z < 0 ? -9 : 5, H - 0.4, z);
      b.root.add(l);
    }

    // ── Lobby ────────────────────────────────────────────────────────────
    b.onFloor(P.receptionDesk(3.2), 'lobby', 0, 6.8, 0, [3.2, 1.1], 1.1);
    b.onWall(logo('DIORAMA CORP'), 'lobby', 'n', -2.9, 2.3);
    wallApp(P.clock(0.26), 'lobby', 'n', 3.0, 2.4, 'World Clock', APPS.clock);
    b.onFloor(P.plant(1.4), 'lobby', -4.4, 11.3, 0, [0.5, 0.5]);
    b.onFloor(P.plant(1.4), 'lobby', 4.4, 11.3, 0, [0.5, 0.5]);
    b.onFloor(P.sofa(2.0), 'lobby', -3.6, 9.4, Math.PI / 2, [2.0, 0.9], 0.8);
    floorApp(P.waterCooler(), 'lobby', 4.4, 4.7, 0, 'Water Cooler Chat', APPS.remote, { solid: [0.35, 0.35] });
    b.screen('lobby-w', 'lobby', 'w', 5.6, 1.8, 1.7, 1.0);
    b.screen('lobby-e', 'lobby', 'e', 5.6, 1.8, 1.7, 1.0);
    // entrance doors in the glass
    for (const x of [-0.55, 0.55]) b.box(x - 0.5, 0, 11.86, x + 0.5, 2.4, 11.9, S.glass, { collide: false });
    b.box(-1.1, 2.4, 11.84, 1.1, 2.5, 11.92, S.trim, { collide: false });

    // ── Mail room ────────────────────────────────────────────────────────
    wallApp(P.mailbox(), 'mail', 'e', 5.4, 1.4, 'Company Mail', APPS.email, 'mail-n');
    b.onFloor(P.table(2.0, 0.9), 'mail', -10, 8.2, 0, [2.0, 0.9], 0.8);
    floorApp(P.console(0.45, 0.32), 'mail', -10, 8.0, 0, 'Shipping Tracker', APPS.browser, { lift: 0.75, slot: 'mail-n' });
    floorApp(P.crates(), 'mail', -13.6, 10.6, 0, 'Packages', APPS.archive, { solid: [1.6, 1.0] });
    b.screen('mail-n', 'mail', 'n', -13, 1.8, 1.6, 1.0);

    // ── Break room ───────────────────────────────────────────────────────
    b.onFloor(P.counter(3.6), 'break', 11.8, 4.45, 0, [3.6, 0.62], 0.9);
    b.onFloor(P.fridge(), 'break', 14.3, 4.5, 0, [0.75, 0.7], 1.9);
    b.onFloor(P.coffeeMachine(), 'break', 12.6, 4.4, 0).position.y += 0.9;
    for (const [x, z] of [[8.6, 8.4], [11.8, 8.4]]) {
      b.onFloor(P.table(1.0, 1.0, 0.75, true), 'break', x, z, 0, [1.0, 1.0], 0.8);
      for (let i = 0; i < 4; i++) b.onFloor(P.chair('#c94f3a'), 'break', x + Math.sin((i * Math.PI) / 2) * 0.85, z + Math.cos((i * Math.PI) / 2) * 0.85, (i * Math.PI) / 2 + Math.PI);
    }
    floorApp(P.radio(), 'break', 11.8, 8.4, 0.5, 'Break Room Radio', APPS.music, { lift: 0.75 });
    b.onFloor(P.sofa(2.2), 'break', 13.4, 11.2, Math.PI, [2.2, 0.9], 0.8);
    wallApp(P.picture(1.2, 0.8, 0), 'break', 'w', 5.4, 1.7, 'Team Photos', APPS.photos, 'break-tv');
    b.screen('break-tv', 'break', 'w', 10.6, 1.75, 1.9, 1.1);

    // ── Open office ──────────────────────────────────────────────────────
    const cubeX = [-13, -10.9, -8.8, -6.7, -4.6];
    cubeX.forEach((x, i) => {
      for (const row of ['A', 'B'] as const) {
        const rotY = row === 'A' ? 0 : Math.PI;
        const z = row === 'A' ? -1.0 : 1.8;
        b.onFloor(P.cubicle(1.8, 1.6), 'open', x, z, rotY);
        // panels: back + left side
        const s = row === 'A' ? 1 : -1;
        b.collider({ x0: x - 0.9, z0: z - s * 0.8 - 0.05, x1: x + 0.9, z1: z - s * 0.8 + 0.05, y0: 0, y1: 1.3 });
        b.collider({ x0: x - s * 0.9 - 0.05, z0: Math.min(z - s * 0.8, z + s * 0.8), x1: x - s * 0.9 + 0.05, z1: Math.max(z - s * 0.8, z + s * 0.8), y0: 0, y1: 1.3 });
        b.collider({ x0: x - 0.85, z0: Math.min(z - s * 0.8, z - s * 0.06), x1: x + 0.85, z1: Math.max(z - s * 0.8, z - s * 0.06), y0: 0, y1: 0.8 });
        b.freeScreen(`cube-${row}${i + 1}`, 'open', new THREE.Vector3(x + 0.02, 1.16, z - s * 0.6), rotY, 0.85, 0.52);
      }
    });
    wallApp(P.whiteboard(1.6, 0.95), 'open', 'n', -5, 1.55, 'Whiteboard', APPS.editor, 'open-dash');
    wallApp(P.calendar(), 'open', 'n', -2.3, 1.6, 'Team Calendar', APPS.calendar, 'open-dash');
    b.screen('open-dash', 'open', 'n', 3.8, 1.9, 2.2, 1.25);
    floorApp(P.filingCabinet(), 'open', 5.6, -3.55, 0, 'Shared Drive', APPS.files, { solid: [0.5, 0.6] });
    b.onFloor(P.filingCabinet(), 'open', 6.15, -3.55, 0, [0.5, 0.6], 1.4);
    b.onFloor(P.table(1.8, 1.0), 'open', 4.0, 1.0, 0, [1.8, 1.0], 0.8);
    for (const [x, z, r] of [[3.4, 0.2, 0], [4.6, 0.2, 0], [3.4, 1.8, Math.PI], [4.6, 1.8, Math.PI]] as const) b.onFloor(P.chair(), 'open', x, z, r);
    floorApp(P.calculator(), 'open', 4.0, 1.0, 0, 'Desk Calculator', APPS.calculator, { lift: 0.76 });
    b.onFloor(P.plant(1.2), 'open', -14.4, 3.4, 0, [0.5, 0.5]);
    b.onFloor(P.plant(1.2), 'open', 9.4, -3.4, 0, [0.5, 0.5]);
    b.screen('open-s', 'open', 's', -4.8, 1.8, 1.8, 1.05);
    workstation('open-desk', 'open', 7.6, 1.4, 0, { w: 1.4 });

    // ── Conference room ─────────────────────────────────────────────────
    b.onFloor(P.table(4.2, 1.4), 'conference', -10, -8, 0, [4.2, 1.4], 0.8);
    for (let i = 0; i < 3; i++) {
      b.onFloor(P.chair('#2f4a6b'), 'conference', -11.4 + i * 1.4, -9.2, 0);
      b.onFloor(P.chair('#2f4a6b'), 'conference', -11.4 + i * 1.4, -6.8, Math.PI);
    }
    b.screen('conf-e', 'conference', 'e', -8, 1.75, 2.6, 1.5);
    b.screen('conf-s', 'conference', 's', -7, 1.75, 1.5, 0.9);
    wallApp(P.calendar(), 'conference', 's', -13, 1.6, 'Room Schedule', APPS.calendar, 'conf-s');
    wallApp(P.console(0.5, 0.34), 'conference', 'e', -5.4, 1.3, 'Presentation', APPS.slides, 'conf-e');

    // ── Server room ─────────────────────────────────────────────────────
    const racks: [number, string, keyof typeof APPS | null][] = [
      [-3.6, 'Cluster Monitor', 'monitor'], [-2.8, 'Virtualization Host', 'vm'], [-2.0, 'Log Server', 'logs'], [-1.2, '', null],
      [1.2, 'Storage Array', 'diskUsage'], [2.0, 'Network Core', 'network'], [2.8, 'Remote Access', 'remote'], [3.6, '', null],
    ];
    racks.forEach(([x, label, app], i) => {
      if (app) floorApp(P.serverRack(i), 'server', x, -11.3, 0, label, APPS[app], { solid: [0.62, 1.0], slot: 'noc-s' });
      else b.onFloor(P.serverRack(i), 'server', x, -11.3, 0, [0.62, 1.0], 2);
    });
    wallApp(P.console(), 'server', 's', -3, 1.5, 'Admin Console', APPS.terminal, 'noc-s');
    wallApp(P.gauges(), 'server', 'e', -8, 1.6, 'Power & Cooling', APPS.monitor, 'noc-s');
    b.screen('noc-s', 'server', 's', 3, 1.8, 1.8, 1.1);

    // ── Records ─────────────────────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
      const z = -11.4 + i * 0.55;
      if (i === 2) floorApp(P.filingCabinet(), 'records', 5.45, z, Math.PI / 2, 'Archives', APPS.files, { solid: [0.5, 0.6], slot: 'records-s' });
      else b.onFloor(P.filingCabinet(), 'records', 5.45, z, Math.PI / 2, [0.5, 0.6], 1.4);
    }
    floorApp(P.bookshelf(1.6, 2.2), 'records', 9, -11.68, 0, 'Contracts', APPS.docs, { solid: [1.6, 0.4], slot: 'records-s' });
    floorApp(P.crates(), 'records', 13.4, -6.2, 0, 'Old Boxes', APPS.archive, { solid: [1.6, 1.0] });
    b.screen('records-s', 'records', 's', 12.4, 1.75, 1.6, 1.0);

    // ── Executive office ────────────────────────────────────────────────
    workstation('exec-desk', 'exec', 9.5, -9.4, 0, { w: 2.2, screenW: 1.2, screenH: 0.72 });
    floorApp(P.globe(), 'exec', 6.2, -11.2, 0, 'Globe', APPS.browser, { solid: [0.5, 0.5], slot: 'exec-s' });
    floorApp(P.bookshelf(1.6, 2.2), 'exec', 5.45, -10.4, Math.PI / 2, 'Reports', APPS.docs, { solid: [1.6, 0.4], slot: 'exec-s' });
    wallApp(P.calculator(), 'exec', 'w', -5.4, 1.5, 'Calculator', APPS.calculator, 'exec-desk');
    wallApp(P.calendar(), 'exec', 'w', -6.4, 1.6, 'Executive Calendar', APPS.calendar, 'exec-desk');
    wallApp(P.console(0.6, 0.4), 'exec', 's', 9.5, 1.5, 'Financials', APPS.spreadsheet, 'exec-s');
    wallApp(P.picture(1.0, 0.7, 2), 'exec', 's', 6.6, 1.7, 'Founders Portrait', APPS.photos);
    b.onFloor(P.sofa(2.2), 'exec', 13.8, -10.2, -Math.PI / 2, [2.2, 0.9], 0.8);
    b.onFloor(P.rug(3, 2.2, '#3a4a5a'), 'exec', 9.5, -8.4);
    b.onFloor(P.plant(1.3), 'exec', 14.4, -11.4, 0, [0.5, 0.5]);
    b.screen('exec-s', 'exec', 's', 11.6, 1.75, 1.6, 1.0);

    // ── Boardroom ───────────────────────────────────────────────────────
    b.onFloor(P.table(5, 1.6), 'boardroom', -10.5, -8, 0, [5, 1.6], 0.8);
    for (let i = 0; i < 4; i++) {
      b.onFloor(P.chair('#22272e'), 'boardroom', -12.3 + i * 1.2, -9.35, 0);
      b.onFloor(P.chair('#22272e'), 'boardroom', -12.3 + i * 1.2, -6.65, Math.PI);
    }
    b.screen('board-s', 'boardroom', 's', -10.5, 1.75, 2.6, 1.5);
    b.screen('board-s2', 'boardroom', 's', -6.6, 1.75, 1.4, 0.85);
    wallApp(P.console(0.5, 0.34), 'boardroom', 'e', -10.6, 1.3, 'Quarterly Deck', APPS.slides, 'board-s');
    wallApp(P.notepad(), 'boardroom', 'e', -5.6, 1.5, 'Meeting Minutes', APPS.writer, 'board-s2');

    // ── Sky lounge ──────────────────────────────────────────────────────
    b.onFloor(P.sofa(2.4), 'lounge', -2, -9.6, 0, [2.4, 0.9], 0.8);
    b.onFloor(P.sofa(2.4), 'lounge', 2, -9.6, 0, [2.4, 0.9], 0.8);
    b.onFloor(P.table(1.2, 0.7, 0.42), 'lounge', 0, -8, 0, [1.2, 0.7], 0.45);
    floorApp(P.radio(), 'lounge', 0, -8, 0, 'Lounge Music', APPS.music, { lift: 0.42 });
    wallApp(P.console(0.6, 0.4), 'lounge', 's', -2.8, 1.5, 'Media Player', APPS.video, 'lounge-s');
    b.screen('lounge-s', 'lounge', 's', 1.2, 1.75, 2.2, 1.25);
    b.onFloor(P.plant(1.3), 'lounge', -4.4, -11.4, 0, [0.5, 0.5]);
  }

  return {
    name: 'tower',
    css: {
      '--bg': '#121722', '--fg': '#eef3fa', '--muted': '#9aa7b8', '--accent': '#3d8bff', '--accent-2': '#00c2a8',
      '--panel': 'rgba(18, 26, 38, 0.8)', '--panel-border': 'rgba(61, 139, 255, 0.3)', '--backdrop': 'rgba(8, 12, 20, 0.55)',
      '--font': '"Segoe UI", "Helvetica Neue", Arial, sans-serif', '--radius': '8px',
    },
    terminal: {
      background: '#0f1622', foreground: '#e6edf7', cursor: '#3d8bff', selectionBackground: '#22406b',
      black: '#18202c', red: '#ff6b6b', green: '#3ddc97', yellow: '#ffcb47', blue: '#3d8bff', magenta: '#b48cff', cyan: '#00c2a8', white: '#e6edf7',
      brightBlack: '#4a5668', brightRed: '#ff9090', brightGreen: '#76e9b8', brightYellow: '#ffdb80', brightBlue: '#7aaeff', brightMagenta: '#cdb0ff', brightCyan: '#4fe0cb', brightWhite: '#ffffff',
    },
    setup,
    createHost: kit.createHost,
    frame: kit.frame,
    navigator: kit.walker,
    home: () => kit.walker.roomPose('lobby')!,
    focusDuration: 750,
  };
}

