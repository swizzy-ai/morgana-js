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
  external: ['typescript', '@morgana/sdk'],
})
