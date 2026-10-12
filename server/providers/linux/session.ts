import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

/**
 * A private headless X session: Xvfb guarded by an MIT-MAGIC-COOKIE, plus its
 * own D-Bus session bus so single-instance apps (nautilus, gnome-*) launch
 * inside diorama instead of attaching to some other running instance.
 */
export class XSession {
  display = '';
  xauthority = '';
  dbusAddress = '';
  private xvfb?: ChildProcess;
  private dbus?: ChildProcess;
  private dir = '';

  async start(displayNum: number, width: number, height: number) {
    this.dir = mkdtempSync(join(tmpdir(), 'diorama-'));
    const num = displayNum || findFreeDisplay(42);
    this.display = `:${num}`;
    this.xauthority = join(this.dir, 'Xauthority');
    writeFileSync(this.xauthority, xauthEntry(num, randomBytes(16)), { mode: 0o600 });

    this.xvfb = spawn('Xvfb', [
      this.display,
      '-screen', '0', `${width}x${height}x24`,
      '-auth', this.xauthority,
      '-nolisten', 'tcp',
      '-dpi', '96',
      '+extension', 'Composite',
      '+extension', 'DAMAGE',
      '+extension', 'RANDR',
      '-noreset',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let xvfbErr = '';
    this.xvfb.stderr!.on('data', d => { xvfbErr += d; });
    this.xvfb.on('exit', code => {
      if (code !== null && code !== 0) console.error(`[diorama] Xvfb exited (${code}):\n${xvfbErr.slice(-2000)}`);
    });
    await waitFor(() => existsSync(`/tmp/.X11-unix/X${num}`), 10_000, () => `Xvfb failed to start:\n${xvfbErr}`);

    this.dbus = spawn('dbus-daemon', ['--session', '--nofork', '--nopidfile', '--print-address=1'], {
      stdio: ['ignore', 'pipe', process.env.DIORAMA_DEBUG ? 'inherit' : 'ignore'],
      env: this.env(),
    });
    this.dbusAddress = await new Promise<string>((resolve, reject) => {
      const rl = createInterface({ input: this.dbus!.stdout! });
      rl.once('line', line => resolve(line.trim()));
      this.dbus!.once('exit', () => reject(new Error('dbus-daemon exited during startup')));
    });
  }

  /** Environment for anything launched inside the session. */
  env(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DISPLAY: this.display,
      XAUTHORITY: this.xauthority,
      XDG_SESSION_TYPE: 'x11',
      XDG_CURRENT_DESKTOP: 'Diorama',
      GDK_BACKEND: 'x11',
      QT_QPA_PLATFORM: 'xcb',
      MOZ_ENABLE_WAYLAND: '0',
      ELECTRON_OZONE_PLATFORM_HINT: 'x11',
      NO_AT_BRIDGE: '1',
      XCURSOR_SIZE: '24',
    };
    delete env.WAYLAND_DISPLAY;
    if (this.dbusAddress) env.DBUS_SESSION_BUS_ADDRESS = this.dbusAddress;
    return env;
  }

  stop() {
    this.dbus?.kill();
    this.xvfb?.kill();
    if (this.dir) rmSync(this.dir, { recursive: true, force: true });
  }
}

function findFreeDisplay(from: number) {
  for (let n = from; n < from + 100; n++) {
    if (!existsSync(`/tmp/.X${n}-lock`) && !existsSync(`/tmp/.X11-unix/X${n}`)) return n;
  }
  throw new Error('no free X display number');
}

/** Xauthority file format: a FamilyLocal entry for this host plus a FamilyWild fallback. */
function xauthEntry(display: number, cookie: Buffer): Buffer {
  const entry = (family: number, address: string) => {
    const parts: Buffer[] = [];
    const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
    const str = (s: string | Buffer) => { const b = Buffer.isBuffer(s) ? s : Buffer.from(s); parts.push(u16(b.length), b); };
    parts.push(u16(family));
    str(address);
    str(String(display));
    str('MIT-MAGIC-COOKIE-1');
    str(cookie);
    return Buffer.concat(parts);
  };
  return Buffer.concat([entry(256, hostname()), entry(0xffff, '')]);
}

async function waitFor(cond: () => boolean, ms: number, err: () => string) {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error(err());
    await new Promise(r => setTimeout(r, 50));
  }
}
