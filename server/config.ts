import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface Config {
  host: string;
  port: number;
  /** false = plain HTTP (only sensible behind a TLS-terminating reverse proxy) */
  tls: boolean;
  /** PEM paths; when unset a self-signed pair is generated into the config dir */
  certFile?: string;
  keyFile?: string;
  /** scrypt hash, see auth.ts. Unset until `diorama passwd` or first start. */
  passwordHash?: string;
  sessionSecret: string;
  sessionHours: number;
  theme: string;
  /** X display number for the private Xvfb; 0 = pick the first free one from 42 */
  display: number;
  /** Size of the virtual X screen windows are laid out on (not what you see). */
  screen: { width: number; height: number };
  capture: {
    focusedFps: number;
    backgroundFps: number;
    jpegQuality: number;
  };
}

const DEFAULTS: Omit<Config, 'sessionSecret'> = {
  host: '0.0.0.0',
  port: 7443,
  tls: true,
  sessionHours: 24 * 7,
  theme: 'orbit',
  display: 0,
  screen: { width: 7680, height: 4320 },
  capture: { focusedFps: 30, backgroundFps: 4, jpegQuality: 80 },
};

export const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'diorama');
export const configFile = join(configDir, 'config.json');
export const themesDir = join(configDir, 'themes');

export function loadConfig(): Config {
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  mkdirSync(themesDir, { recursive: true });
  let stored: Partial<Config> = {};
  if (existsSync(configFile)) stored = JSON.parse(readFileSync(configFile, 'utf8'));
  const cfg: Config = {
    ...DEFAULTS,
    ...stored,
    screen: { ...DEFAULTS.screen, ...stored.screen },
    capture: { ...DEFAULTS.capture, ...stored.capture },
    sessionSecret: stored.sessionSecret || randomBytes(32).toString('hex'),
  };
  if (!stored.sessionSecret) saveConfig(cfg);
  return cfg;
}

export function saveConfig(cfg: Config) {
  writeFileSync(configFile, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  chmodSync(configFile, 0o600);
}
