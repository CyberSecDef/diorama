import { createServer as createHttps } from 'node:https';
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import sharp from 'sharp';
import { checkToken, COOKIE, issueToken, LoginThrottle, readCookie, verifyPassword } from './auth.js';
import { themesDir, type Config } from './config.js';
import type { AppCatalog } from './apps.js';
import type { Hub } from './hub.js';
import { loadTls } from './tls.js';

const clientDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../client');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2', '.hdr': 'application/octet-stream', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.xpm': 'image/x-xpixmap',
};

export async function startHttp(cfg: Config, hub: Hub, apps: AppCatalog) {
  const throttle = new LoginThrottle();
  const authed = (req: IncomingMessage) => checkToken(cfg.sessionSecret, readCookie(req, COOKIE));

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = decodeURIComponent(url.pathname);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (path === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress ?? '?';
      const wait = throttle.retryAfterMs(ip);
      if (wait > 0) return json(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.` });
      const body = await readBody(req, 4096);
      let password = '';
      try { password = JSON.parse(body).password ?? ''; } catch { /* empty */ }
      if (!cfg.passwordHash || !(await verifyPassword(password, cfg.passwordHash))) {
        throttle.failed(ip);
        return json(res, 401, { error: 'Wrong password.' });
      }
      throttle.succeeded(ip);
      const secure = cfg.tls ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${COOKIE}=${issueToken(cfg.sessionSecret, cfg.sessionHours)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cfg.sessionHours * 3600}${secure}`);
      return json(res, 200, { ok: true });
    }
    if (path === '/api/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      return json(res, 200, { ok: true });
    }

    // Public: the login page and the bundled assets (no user data in either).
    if (path === '/login') return sendFile(res, join(clientDir, 'login.html'));
    if (path.startsWith('/assets/') || path === '/favicon.svg') return sendStatic(res, clientDir, path);

    if (!authed(req)) {
      if (path.startsWith('/api/') || path.startsWith('/themes/')) return json(res, 401, { error: 'login required' });
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }

    if (path === '/' || path === '/index.html') {
      const html = readFileSync(join(clientDir, 'index.html'), 'utf8')
        .replace('data-theme="orbit"', `data-theme="${cfg.theme.replace(/[^\w.-]/g, '')}"`);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return res.end(html);
    }
    if (path === '/api/apps') return json(res, 200, apps.list());
    if (path.startsWith('/api/icon/')) return sendIcon(res, apps.iconPath(path.slice('/api/icon/'.length)));
    if (path === '/api/themes') return json(res, 200, listUserThemes());
    if (path.startsWith('/themes/')) return sendStatic(res, themesDir, path.slice('/themes'.length));
    res.writeHead(404).end();
  };

  const server = cfg.tls ? createHttps(await loadTls(cfg), handler) : createHttp(handler);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    // Cookie auth + same-origin check: a page on another site can't open this
    // socket with the user's cookie (cross-site WebSocket hijacking).
    const origin = req.headers.origin;
    const sameOrigin = !origin || new URL(origin).host === req.headers.host;
    if (url.pathname !== '/ws' || !authed(req) || !sameOrigin) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, ws => hub.attach(ws));
  });

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(cfg.port, cfg.host, ok);
  });
  return server;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((ok, fail) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > limit) { req.destroy(); fail(new Error('body too large')); } });
    req.on('end', () => ok(data));
    req.on('error', fail);
  });
}

function sendStatic(res: ServerResponse, root: string, rel: string) {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root + sep)) return res.writeHead(403).end();
  sendFile(res, p, rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
}

function sendFile(res: ServerResponse, p: string, cache = 'no-cache') {
  if (!existsSync(p) || !statSync(p).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': cache });
  createReadStream(p).pipe(res);
}

const iconPngCache = new Map<string, Buffer>();

/** App icons as 128px PNGs: SVG/XPM icons render inconsistently as WebGL textures. */
async function sendIcon(res: ServerResponse, p: string | null) {
  if (!p) return res.writeHead(404).end();
  try {
    let png = iconPngCache.get(p);
    if (!png) {
      png = await sharp(p, { density: 384 })
        .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
      iconPngCache.set(p, png);
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
    res.end(png);
  } catch {
    res.writeHead(404).end();
  }
}

function listUserThemes(): string[] {
  if (!existsSync(themesDir)) return [];
  return readdirSync(themesDir).filter(d => existsSync(join(themesDir, d, 'index.js')));
}
