import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // Worker-safe request-time rendering for `render: 'server'` pages.
    // Separate entry so the cloud worker imports ONLY the render closure
    // (recorder + templates + page graph) — never the compiler (esbuild,
    // extract, bundle) which cannot run on the edge. Verified post-build:
    // dist/server-render.js must not require('esbuild') or any node: module.
    'server-render': 'src/server-render.ts',
    // Host capabilities both servers share (email, …). Same rule: worker-safe.
    'server-host': 'src/server-host/index.ts',
  },
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: true,
  external: ['typescript', '@studiomorgana/sdk'],
})
