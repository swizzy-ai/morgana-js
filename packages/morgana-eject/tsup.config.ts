import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: true,
  // @studiomorgana/sdk-compile stays external (like the CLI does): the eject tool
  // runs on a dev machine where the workspace is installed, and bundling the
  // whole compiler into this dist would freeze its version at build time.
  external: ['typescript', '@studiomorgana/sdk', '@studiomorgana/sdk-compile'],
})
