/**
 * The command table — the whole CLI surface.
 *
 * Kept apart from `bin/morgana.mjs` so a test can import it without executing a
 * process. Every command declares its `flags`, and that declaration is used both
 * for parsing and for the generated help — so the help screen cannot drift from
 * the parser, which is the failure mode that makes `--help` a lie.
 *
 * Adding a command means adding a row here and a module under `src/commands/`.
 * Nothing registers at runtime.
 */

/** Flags shared by every command that talks to the worker. */
export const TARGET_FLAGS = {
  url: { type: 'string', describe: 'the worker, e.g. https://morgana-server.example.workers.dev' },
  project: { type: 'string', short: 'p', describe: 'project id (default __default)' },
  env: { type: 'string', short: 'e', describe: 'deployment env (default production)' },
  token: { type: 'string', short: 't', describe: 'deploy token (or MORGANA_TOKEN)' },
}

/**
 * `minify` is a boolean rather than a bare `--no-minify` so both spellings work.
 * The compiler distinguishes "unset" (fall back to morgana.config.ts) from
 * "explicitly false", and a flag that cannot express three states cannot say that.
 */
export const MINIFY_FLAGS = {
  minify: { type: 'boolean', describe: 'force minification on (--no-minify to force off)' },
}

/** The resolved minify request, or `undefined` to mean "whatever the config says". */
export function minifyRequested(args) {
  return args.values.minify === undefined ? undefined : args.values.minify === true
}

export const COMMANDS = {
  init: {
    describe: 'scaffold a new project',
    usage: 'morgana init [name]',
    flags: { force: { type: 'boolean', describe: 'write into a non-empty directory' } },
    async run(args, { positional, bool }) {
      const { init } = await import('./commands/init.mjs')
      init({ name: positional(args, 0, 'my-morgana-app'), force: bool(args, 'force') })
    },
  },

  build: {
    describe: 'compile the project to dist/',
    usage: 'morgana build [--dir <path>] [--no-minify]',
    flags: { ...MINIFY_FLAGS, dir: { type: 'string', short: 'd', describe: 'project directory' } },
    async run(args, { str }) {
      const { build } = await import('./commands/build.mjs')
      await build({ dir: str(args, 'dir') || process.cwd(), minify: minifyRequested(args) })
    },
  },

  dev: {
    describe: 'compile, serve dist/ locally, and recompile on change',
    usage: 'morgana dev [--port <n>] [--no-watch]',
    flags: {
      ...MINIFY_FLAGS,
      port: { type: 'string', short: 'P', describe: 'port (default 4317, or $PORT)' },
      watch: { type: 'boolean', describe: 'recompile on change (--no-watch to disable)' },
    },
    async run(args, { str, bool }) {
      const { dev } = await import('./commands/dev.mjs')
      const { build } = await import('./commands/build.mjs')
      const dir = process.cwd()

      // Compile first so `morgana dev` on a clean checkout does something useful
      // rather than telling the user to go and run build themselves.
      await build({ dir, minify: minifyRequested(args) ?? false })
      const handle = await dev({ dir, port: Number(str(args, 'port') || process.env.PORT || 4317) })

      if (!bool(args, 'watch', true)) return handle
      const { watch } = await import('node:fs')
      let timer = null
      // Debounced, because an editor writing one file often emits several events
      // and a compile per event is three builds for one save.
      watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const rel = String(filename).split(/[\\/]/).join('/')
        // Never watch our own output, or every build triggers the next one.
        if (rel.startsWith('dist/') || rel.startsWith('node_modules/') || rel.startsWith('.data/')) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(async () => {
          timer = null
          try {
            console.log(`\nchanged: ${rel} — recompiling`)
            await build({ dir, minify: minifyRequested(args) ?? false })
            console.log('recompiled — reload the page')
          } catch (err) {
            // A compile failure must not take the server down: the dev server is
            // the tool you use to fix the thing that just broke.
            console.error(`compile failed: ${err?.message ?? err}`)
          }
        }, 120)
      })
      console.log('watching for changes — Ctrl-C to stop')
      return handle
    },
  },

  // The worker-facing commands (deploy, verify, login, logout, status) live in
  // `worker-commands.mjs` and are merged in by `bin/morgana.mjs`. One table,
  // two files — split for length, not for behaviour.
}
