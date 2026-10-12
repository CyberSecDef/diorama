import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const COOKIE = 'diorama_session';

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(pw, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

/** Stateless session token: `<expiryMs>.<hmac>`. Rotating sessionSecret logs everyone out. */
export function issueToken(secret: string, hours: number): string {
  const exp = Date.now() + hours * 3600_000;
  return `${exp}.${sign(secret, String(exp))}`;
}

export function checkToken(secret: string, token: string | undefined): boolean {
  if (!token) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(secret, exp));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

function sign(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
}

/** Per-IP exponential backoff on failed logins. Good enough for a single-user box. */
export class LoginThrottle {
  private fails = new Map<string, { count: number; until: number }>();

  retryAfterMs(ip: string): number {
    const f = this.fails.get(ip);
    return f ? Math.max(0, f.until - Date.now()) : 0;
  }

  failed(ip: string) {
    const f = this.fails.get(ip) ?? { count: 0, until: 0 };
    f.count++;
    f.until = Date.now() + Math.min(60_000, 250 * 2 ** f.count);
    this.fails.set(ip, f);
  }

  succeeded(ip: string) {
    this.fails.delete(ip);
  }
}
