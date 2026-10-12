#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from './auth.js';
import { configFile, loadConfig, saveConfig, type Config } from './config.js';
import { AppCatalog } from './apps.js';
import { Hub } from './hub.js';
import { startHttp } from './http.js';
import { NotificationDaemon } from './notifications.js';
import { LinuxProvider } from './providers/linux/provider.js';
import type { WindowProvider } from './providers/types.js';
import { Terminals } from './terminals.js';

const HELP = `diorama — your desktop as a themeable 3D world in the browser

Usage:
  diorama [start] [options]   start the server (default)
  diorama passwd              set the login password

Options:
  --host <addr>      bind address (default 0.0.0.0)
  --port <n>         port (default 7443)
  --theme <name>     theme to use (built-in: orbit, or a dir in ~/.config/diorama/themes)
  --no-tls           serve plain HTTP (only behind a TLS reverse proxy)
  -h, --help

Config: ${configFile}
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      host: { type: 'string' },
      port: { type: 'string' },
      theme: { type: 'string' },
      'no-tls': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return void process.stdout.write(HELP);

  const cfg = loadConfig();
  const cmd = positionals[0] ?? 'start';
  if (cmd === 'passwd') {
    await setPassword(cfg);
    return;
  }
  if (cmd !== 'start') {
    process.stderr.write(HELP);
    process.exit(2);
  }

  if (values.host) cfg.host = values.host;
  if (values.port) cfg.port = Number(values.port);
  if (values.theme) cfg.theme = values.theme;
  if (values['no-tls']) cfg.tls = false;

  if (!cfg.passwordHash) {
    if (process.stdin.isTTY) {
      console.log('No password set yet.');
      await setPassword(cfg);
    } else {
      const pw = randomBytes(12).toString('base64url');
      cfg.passwordHash = await hashPassword(pw);
      saveConfig(cfg);
      console.log(`No password was set; generated one: ${pw}\nChange it with: diorama passwd`);
    }
  }

  if (process.platform !== 'linux') {
    console.error(`diorama: no window provider for ${process.platform} yet (Linux only for now).`);
    process.exit(1);
  }
  const provider: WindowProvider = new LinuxProvider(cfg);
  await provider.start();

  const apps = new AppCatalog();
  const terms = new Terminals(() => provider.env());
  const notes = new NotificationDaemon();
  try {
    await notes.start(provider.env().DBUS_SESSION_BUS_ADDRESS!);
  } catch (err) {
    console.warn('[diorama] notification daemon unavailable:', (err as Error).message);
  }
  const hub = new Hub(cfg, provider, terms, notes, apps);
  await startHttp(cfg, hub, apps);

  const scheme = cfg.tls ? 'https' : 'http';
  const addrs = cfg.host === '0.0.0.0'
    ? Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4').map(i => i!.address)
    : [cfg.host];
  console.log(`diorama is up (X display ${provider.env().DISPLAY})`);
  for (const a of addrs) console.log(`  ${scheme}://${a}:${cfg.port}/`);

  // Every step guarded: one failure must not leave Xvfb or dbus orphaned.
  const shutdown = () => {
    for (const step of [() => terms.killAll(), () => notes.stop(), () => provider.stop()]) {
      try { step(); } catch (err) { console.error('[diorama] shutdown:', (err as Error).message); }
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function setPassword(cfg: Config) {
  const a = await prompt('New password: ');
  const b = await prompt('Repeat: ');
  if (!a || a !== b) {
    console.error(a ? 'Passwords did not match.' : 'Empty password not allowed.');
    process.exit(1);
  }
  cfg.passwordHash = await hashPassword(a);
  saveConfig(cfg);
  console.log('Password saved.');
}

function prompt(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({ write(chunk, _enc, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    muted = true;
  });
}

main().catch(err => {
  console.error('diorama:', err instanceof Error ? err.message : err);
  process.exit(1);
});
