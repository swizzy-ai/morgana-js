import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: false,
  dts: true,
  treeshake: true,
  minify: false,
  external: ['electron', 'electron-builder', '@studiomorgana/cli', '@studiomorgana/sdk'],
})
