import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { generate } from 'selfsigned';
import { configDir, type Config } from './config.js';

export async function loadTls(cfg: Config): Promise<{ cert: string; key: string }> {
  if (cfg.certFile && cfg.keyFile) {
    return { cert: readFileSync(cfg.certFile, 'utf8'), key: readFileSync(cfg.keyFile, 'utf8') };
  }
  const certPath = join(configDir, 'selfsigned.crt');
  const keyPath = join(configDir, 'selfsigned.key');
  if (existsSync(certPath) && existsSync(keyPath)) {
    return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
  }

  // SANs for every name/IP this box is likely reached by, so the one-time
  // browser exception sticks no matter which address you use.
  const ips = Object.values(networkInterfaces()).flat().filter(Boolean).map(i => i!.address);
  const altNames = [
    { type: 2 as const, value: 'localhost' },
    { type: 2 as const, value: hostname() },
    ...ips.map(ip => ({ type: 7 as const, ip })),
  ];
  const pems = await generate([{ name: 'commonName', value: hostname() }], {
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 825 * 86400_000),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  } as any);
  writeFileSync(certPath, pems.cert, { mode: 0o644 });
  writeFileSync(keyPath, pems.private, { mode: 0o600 });
  return { cert: pems.cert, key: pems.private };
}
