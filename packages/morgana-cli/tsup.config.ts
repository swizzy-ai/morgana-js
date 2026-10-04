import { defineConfig } from 'tsup'

/**
 * Bundle the CLI to one file.
 *
 * `bin/morgana.mjs` is the entry; the commands under `src/` become internal
 * chunks of that one file rather than the 20-odd separate modules that used to
 * ship.
 *
 * Two things must not be inlined, and both are load-bearing:
 *
 *   `@morgana/sdk-compile` — it finds `@morgana/sdk/src` and its own
 *   `client/runtime.ts` on disk at *runtime*, via `import.meta.url`,
 *   `createRequire` and `fs.existsSync` path candidates. Bundling rewrites
 *   `import.meta.url` and those probes resolve to nothing, so the compiler dies
 *   on its own "cannot locate the SDK source entry" error while reading a
 *   package that is plainly installed. tsup externalises `dependencies` for us;
 *   naming them here makes that a decision rather than a default that a future
 *   dependency bump could quietly remove.
 *
 *   `@morgana/agents` — `src/lib/ai.mjs` imports it at module scope, so it is on
 *   the startup path of every command that reaches a host context, `dev` among
 *   them. Keeping it a real dependency means Node resolves its own `dist` rather
 *   than an inlined copy, which also keeps a broken agents build a visible
 *   resolution failure instead of a silently stale bundle.
 *
 * `noExternal` is deliberately empty. The only third-party code the CLI runs is
 * in those two packages.
 *
 * There is deliberately no `esbuildPlugins` entry for Node's `node:` built-ins.
 * One was tried and does not work: tsup never hands a built-in import to a user
 * resolver, so an `onResolve` hook that would restore the prefix never fires,
 * and the specifier reaches the output bare. `src/lib/store.mjs` loads
 * `node:sqlite` through `createRequire` instead, which keeps the specifier a
 * runtime string the bundler cannot normalise. See the comment there.
 */
export default defineConfig({
  entry: { morgana: 'bin/morgana.mjs' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: false,
  dts: false,
  treeshake: true,
  minify: false,
  external: ['@morgana/sdk', '@morgana/sdk-compile', '@morgana/agents'],
  // No banner for the shebang: esbuild hoists the entry's own `#!/usr/bin/env
  // node` to the top of the output by itself. Adding one as a banner as well
  // emits it twice, and the file then fails to parse.
})