import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs'],
    // node:sqlite is stable in Node 24 but still emits an experimental warning.
    silent: false,
  },
})
