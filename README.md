# diorama

Your desktop as a themeable 3D world in a full-screen browser. Every window lives
on an object in the scene; focusing one flies the camera in and swaps the 3D
screen for a pixel-exact, fully interactive 2D view.

```
npm install && npm run build
node dist/server/cli.js            # or: npm link && diorama
```

First start asks for a password (or generates one when not on a TTY), then serves
`https://<every-interface>:7443/`. The certificate is self-signed; accept it once.
Click ⛶ for full screen. That also turns on Keyboard Lock, so chords like
Ctrl+W reach your apps instead of the browser.

| Key / action | Does |
|---|---|
| click a window in the world, or its taskbar entry | focus it |
| `Ctrl+Alt+Space` | back to the world (or open the launcher when already there) |
| start typing in the world | app search; Enter launches |
| click the dimmed backdrop | back to the world |
| ⤢ / ✕ in the top bar | resize the native window to fill the view / close it |

## How it works

```
browser (three.js world + 2D focus overlay)
   │  wss: JSON control + binary JPEG tiles
server (node)
   ├── LinuxProvider ── private Xvfb (cookie-auth) + private D-Bus
   │     we are the window manager: windows are laid out non-overlapping
   │     on a big virtual screen, captured per-window via Composite+Damage,
   │     input injected with XTest in root coordinates
   ├── Terminals ────── node-pty, survive browser reloads (backlog replay)
   ├── Notifications ── org.freedesktop.Notifications on the private bus
   └── AppCatalog ───── .desktop files + icon themes
```

* Only damaged regions are re-encoded. The focused window streams at 30 fps, the rest at 4 fps.
* App, menu, and dialog windows are separate surfaces. Menus and dialogs draw over their parent in the focus view.
* Keys are sent as physical key codes (`KeyboardEvent.code` → evdev), so XKB in the session handles layouts. X does its own autorepeat.
* The X bell, terminal bells, and desktop notifications sound in the browser. App audio stays on the server.
* `WindowProvider` (`server/providers/types.ts`) is the seam for a Windows backend.

## Themes

Built-in: `orbit` (default) and `workshop`. Pick one with `--theme`, `"theme"` in
`~/.config/diorama/config.json`, or try one live with `?theme=workshop`.

A theme is an ES module whose default export is `(ctx) => Theme`. See
`client/src/theme.ts` for the full contract. Put user themes in
`~/.config/diorama/themes/<name>/index.js`; their assets are served next to them
(`ctx.asset('model.glb')`). Use `ctx.THREE` rather than importing three.

```js
export default function myTheme({ THREE, scene }) {
  return {
    name: 'mine',
    css: { '--accent': '#00ffa3' },
    setup() { scene.background = new THREE.Color('#001b12'); },
    createHost(win) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: win.texture }));
      return {
        object: screen, screen,
        update(w) {
          screen.material.map = w.texture;
          screen.material.needsUpdate = true;
          screen.scale.set(w.width / 600, w.height / 600, 1);
        },
      };
    },
    layout(list) { list.forEach(({ host }, i) => host.object.position.set((i - list.length / 2) * 3, 1.6, 0)); },
  };
}
```

A theme controls the world, which object hosts each window, layout, per-frame
animation and entities, the chrome's CSS variables, terminal colours, and the
focus camera pose, duration, and easing.

## Config (`~/.config/diorama/config.json`)

`host`, `port`, `tls`, `certFile`/`keyFile`, `theme`, `display`,
`screen` (virtual X screen size), `capture.{focusedFps,backgroundFps,jpegQuality}`,
`sessionHours`. Change the password with `diorama passwd`.
`DIORAMA_DEBUG=1` logs X errors and D-Bus output.

## Security

Anyone who logs in gets a shell as the user running diorama. The login is a
scrypt-hashed password, an HMAC-signed `HttpOnly; Secure; SameSite=Strict`
cookie, per-IP backoff on failures, and a same-origin check on the WebSocket.
Xvfb listens on a unix socket only and requires a magic cookie. Bind to a
specific interface or put it behind a VPN if 0.0.0.0 is broader than you want.

## Not done yet

* Clipboard sync between the browser and X selections
* Windows provider (Windows.Graphics.Capture + SendInput via a napi-rs addon)
* HiDPI: X pixels map 1:1 to CSS pixels
* Dragging a window edge to resize (use ⤢ or the app's maximize button)
* Terminals don't survive a server restart; X apps die with the server
