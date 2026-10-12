import type { EventEmitter } from 'node:events';
import type { SurfaceInfo } from '../protocol.js';

/**
 * A window provider owns native application windows on one OS and turns them
 * into surfaces: pixels out (JPEG tiles), input in (root-space coordinates).
 * Linux is implemented by LinuxProvider; a Windows provider plugs in here later.
 *
 * Events:
 *   'surface'      (info: SurfaceInfo)                created or changed
 *   'surface-gone' (id: number)
 *   'frame'        (frame: Buffer)                    complete binary message, see protocol.ts
 *   'bell'         (id: number | null, percent: number)
 *   'activate'     (id: number)                       an app asked to be focused
 *   'cursor'       (c: { url: string; hx: number; hy: number })
 */
export interface WindowProvider extends EventEmitter {
  readonly screen: { w: number; h: number };
  start(): Promise<void>;
  stop(): void;
  surfaces(): SurfaceInfo[];
  /** Environment for processes launched into this session (terminals, apps). */
  env(): NodeJS.ProcessEnv;

  setViewport(w: number, h: number): void;
  focus(id: number | null): void;
  /** Surfaces somebody is looking at closely; they get the high frame rate. */
  setPriority(ids: Set<number>): void;
  /** Re-send whole surfaces (new viewer, or a viewer dropped frames). */
  requestFull(id?: number): void;

  pointer(x: number, y: number): void;
  button(b: number, down: boolean): void;
  key(code: string, down: boolean): void;
  releaseAll(): void;

  close(id: number): void;
  resize(id: number, w: number, h: number): void;
}
