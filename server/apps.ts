import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import type { AppEntry } from './protocol.js';

interface DesktopEntry extends AppEntry {
  exec: string[];
  icon?: string;
}

const dataDirs = () => [
  join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share')),
  ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':'),
  '/var/lib/snapd/desktop',
  '/var/lib/flatpak/exports/share',
  join(homedir(), '.local/share/flatpak/exports/share'),
];

/** Installed applications, from freedesktop .desktop files. Earlier dirs shadow later ones. */
export class AppCatalog {
  private entries = new Map<string, DesktopEntry>();
  private iconCache = new Map<string, string | null>();
  private loadedAt = 0;

  list(): AppEntry[] {
    this.refresh();
    return [...this.entries.values()]
      .map(({ exec: _e, icon, ...pub }) => ({ ...pub, hasIcon: !!icon }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): DesktopEntry | undefined {
    this.refresh();
    return this.entries.get(id);
  }

  private refresh() {
    if (Date.now() - this.loadedAt < 30_000) return;
    this.loadedAt = Date.now();
    this.entries.clear();
    for (const dir of dataDirs()) {
      const appDir = join(dir, 'applications');
      for (const file of walk(appDir)) {
        const id = file.slice(appDir.length + 1).replaceAll('/', '-').replace(/\.desktop$/, '');
        if (this.entries.has(id)) continue;
        const e = parseDesktop(id, file);
        if (e) this.entries.set(id, e);
      }
    }
  }

  /** Absolute path of the best icon file for an app, or null. */
  iconPath(id: string): string | null {
    const icon = this.get(id)?.icon;
    if (!icon) return null;
    if (this.iconCache.has(icon)) return this.iconCache.get(icon)!;
    const found = resolveIcon(icon);
    this.iconCache.set(icon, found);
    return found;
  }
}

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      if (statSync(p).isDirectory()) yield* walk(p);
      else if (name.endsWith('.desktop')) yield p;
    } catch { /* dangling symlink */ }
  }
}

function parseDesktop(id: string, file: string): DesktopEntry | null {
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  const kv: Record<string, string> = {};
  let inMain = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) { inMain = line === '[Desktop Entry]'; continue; }
    if (!inMain || !line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (kv.Type !== 'Application' || kv.NoDisplay === 'true' || kv.Hidden === 'true' || !kv.Exec || !kv.Name) return null;
  const desktops = (s?: string) => (s ? s.split(';').filter(Boolean) : null);
  const only = desktops(kv.OnlyShowIn);
  if (only && !only.includes('Diorama')) return null;
  if (kv.TryExec && !onPath(kv.TryExec)) return null;
  const lang = (process.env.LANG || '').split('.')[0];
  return {
    id,
    name: kv[`Name[${lang}]`] || kv.Name,
    comment: kv[`Comment[${lang}]`] || kv.Comment || kv.GenericName,
    categories: desktops(kv.Categories) ?? [],
    terminal: kv.Terminal === 'true',
    hasIcon: !!kv.Icon,
    icon: kv.Icon,
    exec: parseExec(kv.Exec, kv.Icon, kv.Name, file),
  };
}

function onPath(cmd: string) {
  if (cmd.startsWith('/')) return existsSync(cmd);
  return (process.env.PATH || '').split(':').some(d => existsSync(join(d, cmd)));
}

/** Desktop Entry spec Exec tokenizer, with field codes expanded/dropped (we never pass files). */
export function parseExec(exec: string, icon?: string, name?: string, file?: string): string[] {
  const args: string[] = [];
  let cur = '', inQuote = false, has = false;
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i];
    if (inQuote) {
      if (c === '\\' && i + 1 < exec.length) { cur += exec[++i]; continue; }
      if (c === '"') { inQuote = false; continue; }
      cur += c;
    } else if (c === '"') { inQuote = true; has = true; }
    else if (c === ' ' || c === '\t') { if (has || cur) args.push(cur); cur = ''; has = false; }
    else cur += c;
  }
  if (has || cur) args.push(cur);
  const out: string[] = [];
  for (const a of args) {
    if (a === '%i') { if (icon) out.push('--icon', icon); continue; }
    if (/^%[fFuUdDnNvm]$/.test(a)) continue;
    out.push(a.replace(/%c/g, name ?? '').replace(/%k/g, file ?? '').replace(/%%/g, '%').replace(/%[fFuUdDnNvm]/g, ''));
  }
  return out.filter(a => a !== '');
}

const ICON_SIZES = ['scalable', '256x256', '128x128', '96x96', '64x64', '48x48', '32x32'];
const ICON_CATEGORIES = ['apps', 'applications', 'categories', 'places', 'devices', 'mimetypes'];

function iconThemes(): string[] {
  const themes = ['hicolor'];
  try {
    const gtk = readFileSync(join(homedir(), '.config/gtk-3.0/settings.ini'), 'utf8').match(/gtk-icon-theme-name\s*=\s*(.+)/);
    if (gtk) themes.unshift(gtk[1].trim());
  } catch { /* none */ }
  themes.push('Yaru', 'Adwaita', 'breeze', 'Papirus');
  return [...new Set(themes)];
}

function resolveIcon(icon: string): string | null {
  if (icon.startsWith('/')) return existsSync(icon) ? icon : null;
  const bases = [join(homedir(), '.icons'), ...dataDirs().map(d => join(d, 'icons'))];
  for (const theme of iconThemes()) {
    for (const base of bases) {
      const themeDir = join(base, theme);
      if (!existsSync(themeDir)) continue;
      for (const size of ICON_SIZES) {
        for (const cat of ICON_CATEGORIES) {
          for (const layout of [join(themeDir, size, cat), join(themeDir, cat, size)]) {
            for (const ext of ['.svg', '.png']) {
              const p = join(layout, icon + ext);
              if (existsSync(p)) return p;
            }
          }
        }
      }
    }
  }
  for (const ext of ['.svg', '.png', '.xpm']) {
    const p = join('/usr/share/pixmaps', extname(icon) ? icon : icon + ext);
    if (existsSync(p)) return p;
  }
  return null;
}
