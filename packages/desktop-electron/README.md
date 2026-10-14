# @studiomorgana/desktop-electron

The desktop backend for Morgana. Boots a compiled project's `dist/desktop/`
inside Electron: the app window on the loopback host, `ctx.desktop.os`
capabilities, the local object runtime, declarative cron, and the installer
project (Windows nsis first).

```
morgana desktop dev       # compile, boot the host, open the app window
morgana desktop package   # compile, scaffold + build the installer
```

Package scripts: `build` (tsup), `typecheck` (`tsc --noEmit`), `test`
(vitest). Unit tests never import Electron — capability gating, the object
runtime and the pack scaffolder are pure modules with injected backends.

Launching the app needs the real Electron binary: allow its postinstall
once with `pnpm approve-builds` (or add it under `allowBuilds` in
pnpm-workspace.yaml). Build, typecheck and tests never need it.
