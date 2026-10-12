// Wire protocol between server and browser. JSON text messages for control,
// binary messages for window pixels. Imported (types only) by the client too.

export type SurfaceKind = 'window' | 'dialog' | 'popup';

export interface SurfaceInfo {
  id: number;
  kind: SurfaceKind;
  /** Top-level surface this one is drawn on top of (dialogs, menus, tooltips). */
  parent: number | null;
  /** Position in X root coordinates. Input is always sent in root coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  appClass: string;
  /** PNG data URL from _NET_WM_ICON, if the app provided one */
  icon?: string;
  fullscreen?: boolean;
}

export interface AppEntry {
  id: string;
  name: string;
  comment?: string;
  categories: string[];
  terminal: boolean;
  hasIcon: boolean;
}

export interface Notification {
  id: number;
  app: string;
  summary: string;
  body: string;
  icon?: string;
  urgency: 0 | 1 | 2;
  /** ms; 0 = sticky, -1 = server default */
  timeout: number;
  actions: { key: string; label: string }[];
}

export interface TerminalInfo {
  id: number;
  title: string;
  /** replay of recent output so a reloaded browser catches up */
  backlog?: string;
}

export type ServerMsg =
  | { t: 'hello'; theme: string; screen: { w: number; h: number }; user: string; host: string }
  | { t: 'surface'; s: SurfaceInfo }
  | { t: 'surface-gone'; id: number }
  | { t: 'activate'; id: number }
  | { t: 'bell'; id: number | null; percent: number }
  | { t: 'cursor'; url: string; hx: number; hy: number }
  | { t: 'notify'; n: Notification }
  | { t: 'notify-close'; id: number }
  | { t: 'term'; term: TerminalInfo }
  | { t: 'term-data'; id: number; data: string }
  | { t: 'term-title'; id: number; title: string }
  | { t: 'term-exit'; id: number }
  | { t: 'error'; message: string };

export type ClientMsg =
  | { t: 'hello'; viewport: { w: number; h: number } }
  | { t: 'viewport'; w: number; h: number }
  | { t: 'focus'; id: number | null }
  | { t: 'ptr'; x: number; y: number }
  | { t: 'btn'; b: number; down: boolean; x: number; y: number }
  | { t: 'wheel'; dx: number; dy: number; x: number; y: number }
  | { t: 'key'; code: string; down: boolean }
  | { t: 'release-all' }
  | { t: 'close'; id: number }
  | { t: 'resize'; id: number; w: number; h: number }
  | { t: 'launch'; app: string }
  | { t: 'term-open'; cols: number; rows: number; cmd?: string }
  | { t: 'term-in'; id: number; data: string }
  | { t: 'term-resize'; id: number; cols: number; rows: number }
  | { t: 'term-close'; id: number }
  | { t: 'notify-action'; id: number; key: string }
  | { t: 'notify-dismiss'; id: number };

/**
 * Binary frame layout (little endian):
 *   u8  type (1 = jpeg tile)
 *   u32 surface id
 *   u16 x, u16 y, u16 w, u16 h    tile rect within the surface
 *   u16 surfaceW, u16 surfaceH    full surface size the tile belongs to
 *   ...  JPEG bytes
 */
export const FRAME_HEADER = 17;
export const FRAME_JPEG = 1;
