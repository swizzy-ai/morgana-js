import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    plugin: 'src/plugin.ts',
  },
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: true,
  external: ['@studiomorgana/sdk'],
})
