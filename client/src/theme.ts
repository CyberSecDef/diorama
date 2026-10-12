import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Theme API.
 *
 * A theme module's default export is a factory `(ctx: ThemeContext) => Theme`.
 * Built-in themes live in client/src/themes/. User themes are plain ES modules
 * at ~/.config/diorama/themes/<name>/index.js and receive THREE through the
 * context (so they share the app's copy instead of bundling their own).
 */
export interface ThemeContext {
  THREE: typeof THREE;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** World-view camera controls; themes may set target/limits or disable them. */
  controls: OrbitControls;
  /** Resolve a file shipped next to the theme module. */
  asset(path: string): string;
  /** Pixel ratio between X pixels and world units most themes want to use. */
  pxToWorld: number;
}

/** What a theme knows about one window. Read-only; fields update in place. */
export interface WindowHandle {
  readonly key: string;
  readonly kind: 'native' | 'terminal';
  readonly title: string;
  readonly appClass: string;
  /** Live contents. Its image size equals width x height. */
  readonly texture: THREE.Texture;
  readonly width: number;
  readonly height: number;
  readonly iconUrl?: string;
  readonly createdAt: number;
}

/** A place in the world that displays one window. */
export interface Host {
  /** Root object. diorama adds it to the scene; the theme positions it in layout(). */
  object: THREE.Object3D;
  /**
   * The mesh the window is shown on. Used for picking and for the focus
   * fly-in: the camera ends up looking at its local +Z face, framed so the
   * mesh's bounding box exactly covers the on-screen window.
   */
  screen: THREE.Mesh;
  /** Title, size or icon changed. Re-fit the screen to the new aspect here. */
  update?(win: WindowHandle): void;
  setHover?(on: boolean): void;
  setFocused?(on: boolean): void;
  bell?(): void;
  dispose?(): void;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface Theme {
  name: string;
  /** CSS custom properties for the 2D chrome: --accent, --bg, --fg, --panel, --font ... */
  css?: Record<string, string>;
  /** xterm.js ITheme colours */
  terminal?: Record<string, string>;
  /** Build the world. Await asset loading here. */
  setup(): void | Promise<void>;
  createHost(win: WindowHandle): Host;
  /** Arrange hosts; called whenever the set of windows changes. Order = creation order. */
  layout(hosts: { host: Host; win: WindowHandle }[]): void;
  /** Per-frame hook for animation and entities. */
  frame?(dt: number, elapsed: number): void;
  /** Camera pose for the world overview (where "back" returns to). */
  home?(): CameraPose;
  /** Override the camera pose used for focusing a host (default: head-on framing). */
  focusPose?(host: Host, framed: CameraPose): CameraPose;
  /** Fly-in/out duration in ms (default 650). */
  focusDuration?: number;
  /** Easing for camera moves, t in [0,1]. */
  ease?(t: number): number;
  dispose?(): void;
}

export type ThemeFactory = (ctx: ThemeContext) => Theme | Promise<Theme>;

const builtins: Record<string, () => Promise<{ default: ThemeFactory }>> = {
  orbit: () => import('./themes/orbit'),
  workshop: () => import('./themes/workshop'),
};

export async function loadTheme(name: string, ctx: Omit<ThemeContext, 'asset'>): Promise<Theme> {
  let factory: ThemeFactory;
  let base = '';
  if (builtins[name]) {
    factory = (await builtins[name]()).default;
  } else {
    base = `/themes/${encodeURIComponent(name)}/`;
    try {
      factory = (await import(/* @vite-ignore */ `${base}index.js`)).default;
    } catch (err) {
      console.error(`theme "${name}" failed to load, falling back to orbit`, err);
      factory = (await builtins.orbit()).default;
    }
  }
  return factory({ ...ctx, asset: p => base + p });
}
