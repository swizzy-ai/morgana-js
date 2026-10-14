import { defineConfig } from 'vitest/config'

// Many suites compile a real project end to end (esbuild, a TypeScript program
// for the action registry). Under a parallel run on a slow disk that clears
// vitest's 5s default only some of the time.
export default defineConfig({
  test: { testTimeout: 20_000 },
})
