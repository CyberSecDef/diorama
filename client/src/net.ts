import type { ClientMsg, ServerMsg } from '../../server/protocol';
import { FRAME_HEADER, FRAME_JPEG } from '../../server/protocol';

export interface Tile {
  id: number;
  x: number; y: number; w: number; h: number;
  surfW: number; surfH: number;
  jpeg: Uint8Array;
}

type Handler = (msg: ServerMsg) => void;

/** One WebSocket to the server, reconnecting with backoff. */
export class Net {
  private ws?: WebSocket;
  private handlers: Handler[] = [];
  private tileHandlers: ((t: Tile) => void)[] = [];
  private retry = 500;
  onStatus: (up: boolean) => void = () => {};

  constructor(private hello: () => ClientMsg) {}

  connect() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 500;
      this.onStatus(true);
      this.send(this.hello());
    };
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') {
        const msg = JSON.parse(ev.data) as ServerMsg;
        for (const h of this.handlers) h(msg);
      } else {
        const buf = ev.data as ArrayBuffer;
        const dv = new DataView(buf);
        if (dv.getUint8(0) !== FRAME_JPEG) return;
        const tile: Tile = {
          id: dv.getUint32(1, true),
          x: dv.getUint16(5, true), y: dv.getUint16(7, true),
          w: dv.getUint16(9, true), h: dv.getUint16(11, true),
          surfW: dv.getUint16(13, true), surfH: dv.getUint16(15, true),
          jpeg: new Uint8Array(buf, FRAME_HEADER),
        };
        for (const h of this.tileHandlers) h(tile);
      }
    };
    ws.onclose = async () => {
      this.onStatus(false);
      // Expired session -> back to the login page rather than looping forever.
      const probe = await fetch('/api/apps', { cache: 'no-store' }).catch(() => null);
      if (probe?.status === 401) return void (location.href = '/login');
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 8000);
    };
  }

  on(h: Handler) {
    this.handlers.push(h);
  }

  onTile(h: (t: Tile) => void) {
    this.tileHandlers.push(h);
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
