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
import { UsageError } from './args.mjs'

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

/**
 * Which port `morgana dev` should listen on, in priority order: `--port`/`-P`,
 * a bare positional (`morgana dev 3000`), `$PORT`, then the default.
 *
 * A bare positional used to fall through silently to 4317, so `morgana dev
 * 3000` looked accepted and then served on the wrong port. Anything present
 * but not a valid TCP port is a UsageError rather than a shrug.
 */
export function resolveDevPort(args, { str, positional }) {
  const raw = str(args, 'port') || positional(args, 0, '') || process.env.PORT || 4317
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UsageError(`bad port "${raw}" — use 1-65535, e.g. morgana dev --port 3000`)
  }
  return port
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

  upgrade: {
    describe: 'move @studiomorgana/* packages to the latest published versions and install',
    usage: 'morgana upgrade [--dir <path>] [--dry-run] [--skip-install]',
    flags: {
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      'dry-run': { type: 'boolean', describe: 'show what would change, write nothing' },
      'skip-install': { type: 'boolean', describe: 'update package.json without running install' },
    },
    async run(args, { str, bool }) {
      const { upgrade } = await import('./commands/upgrade.mjs')
      await upgrade({
        dir: str(args, 'dir') || process.cwd(),
        dryRun: bool(args, 'dry-run'),
        install: !bool(args, 'skip-install'),
      })
    },
  },

  example: {
    describe: 'print an annotated example project as markdown, for agents to copy',
    usage: 'morgana example [name] [--list]',
    flags: { list: { type: 'boolean', describe: 'list the examples' } },
    async run(args, { positional, bool }) {
      const { example } = await import('./commands/example.mjs')
      example({ name: positional(args, 0, ''), list: bool(args, 'list') })
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

  artifacts: {
    describe: "list or export what the project's plugins build (assets, …)",
    usage: 'morgana artifacts <list|dump|push> [name…] [--out <dir>] [--remote] [--rebuild]',
    flags: {
      ...TARGET_FLAGS,
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      remote: { type: 'boolean', describe: 'list: what the live deploy serves, from the worker' },
      out: { type: 'string', short: 'o', describe: 'dump: where to write the files (default ./exported)' },
      rebuild: { type: 'boolean', describe: 'build every artifact again, ignoring the cache' },
    },
    async run(args, { str, bool, positional }) {
      const { artifacts } = await import('./commands/artifacts.mjs')
      await artifacts({
        action: positional(args, 0, ''),
        names: args.positionals.slice(1),
        dir: str(args, 'dir') || process.cwd(),
        out: str(args, 'out'),
        force: bool(args, 'rebuild'),
        remote: bool(args, 'remote'),
        url: str(args, 'url'),
        project: str(args, 'project'),
        env: str(args, 'env'),
        token: str(args, 'token'),
      })
    },
  },

  types: {
    describe: 'generate .morgana/ types for actions and server objects',
    usage: 'morgana types [--dir <path>] [--watch]',
    flags: {
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      watch: { type: 'boolean', short: 'w', describe: 'regenerate on change' },
    },
    async run(args, { str, bool }) {
      const { types } = await import('./commands/types.mjs')
      await types({ dir: str(args, 'dir') || process.cwd(), watch: bool(args, 'watch') })
    },
  },

  docs: {
    describe: "generate the project's docs: storyboard, API, events, objects, data",
    usage: 'morgana docs [--dir <path>] [--out <dir>] [--url <running app>] [--no-shots]',
    flags: {
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      out: { type: 'string', short: 'o', describe: 'where to write (default dist/docs)' },
      url: { type: 'string', describe: 'a running app to photograph the screens from (default: localhost:4317 if it answers)' },
      shots: { type: 'boolean', describe: 'photograph the storyboard (--no-shots to skip)' },
    },
    async run(args, { str, bool }) {
      const { docs } = await import('./commands/docs.mjs')
      await docs({ dir: str(args, 'dir') || process.cwd(), out: str(args, 'out'), url: str(args, 'url'), shots: bool(args, 'shots', true) })
    },
  },

  demo: {
    describe: 'record demo videos of the app for Reels, TikTok and Shorts (morgana.demos.json)',
    usage: 'morgana demo [name…] [--all] [--list] [--skip 2,4] [--only 1-3] [--format 9:16|4:5|1:1|16:9] [--audio <file>] [--no-audio] [--from-storyboard] [--stills] [--url <app>]',
    flags: {
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      all: { type: 'boolean', describe: 'record every demo' },
      list: { type: 'boolean', describe: 'show the scenes, numbered' },
      skip: { type: 'string', describe: 'leave these scenes out: 2,4 or 2-3' },
      only: { type: 'string', describe: 'keep just these scenes' },
      format: { type: 'string', describe: '9:16 (default), 4:5, 1:1 or 16:9' },
      audio: { type: 'string', describe: 'music or a voice-over to lay under it (--no-audio: none)' },
      'from-storyboard': { type: 'boolean', describe: 'one demo of every storyboard screen' },
      stills: { type: 'boolean', describe: 'also write each scene’s last frame' },
      url: { type: 'string', describe: 'the running app (default: localhost:4317 if it answers)' },
      out: { type: 'string', short: 'o', describe: 'where to write (default dist/demos)' },
    },
    async run(args, { str, bool }) {
      const { demo } = await import('./commands/demo.mjs')
      await demo({
        dir: str(args, 'dir') || process.cwd(), names: args.positionals, all: bool(args, 'all'), list: bool(args, 'list'),
        skip: str(args, 'skip'), only: str(args, 'only'), format: str(args, 'format'), audio: str(args, 'audio'),
        noAudio: args.values.audio === false, fromStoryboard: bool(args, 'from-storyboard'), stills: bool(args, 'stills'),
        url: str(args, 'url'), out: str(args, 'out'),
      })
    },
  },

  spec: {
    describe: 'print the API surface — server objects, ctx, ui kinds, events, …',
    usage: 'morgana spec [topic] [--all] [--json]',
    flags: {
      all: { type: 'boolean', describe: 'every topic, one document' },
      json: { type: 'boolean', describe: 'structured output' },
    },
    async run(args, { bool }) {
      const { spec } = await import('./commands/spec.mjs')
      spec({ words: args.positionals, json: bool(args, 'json'), all: bool(args, 'all') })
    },
  },

  dev: {
    describe: 'compile, serve dist/ locally, and recompile on change',
    usage: 'morgana dev [port] [--port <n>] [--no-watch]',
    flags: {
      ...MINIFY_FLAGS,
      port: { type: 'string', short: 'P', describe: 'port (default 4317, or $PORT)' },
      watch: { type: 'boolean', describe: 'recompile on change (--no-watch to disable)' },
    },
    async run(args, { str, bool, positional }) {
      const { dev } = await import('./commands/dev.mjs')
      const { build } = await import('./commands/build.mjs')
      const dir = process.cwd()

      // Compile first so `morgana dev` on a clean checkout does something useful
      // rather than telling the user to go and run build themselves.
      await build({ dir, minify: minifyRequested(args) ?? false })
      const handle = await dev({ dir, port: resolveDevPort(args, { str, positional }) })

      if (!bool(args, 'watch', true)) return handle
      const { watch } = await import('node:fs')
      let timer = null
      // Debounced, because an editor writing one file often emits several events
      // and a compile per event is three builds for one save.
      watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const rel = String(filename).split(/[\\/]/).join('/')
        // Never watch our own output, or every build triggers the next one.
        // `.morgana/` too: every compile refreshes the generated types there.
        // The folder itself counts as well as what's in it — sandboxes write
        // under .data, and some platforms report the folder, not the file.
        if (/^(dist|node_modules|\.data|\.morgana|\.git)(\/|$)/.test(rel)) return
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

  eject: {
    describe: 'eject to a plain React + Express codebase with no framework trace',
    usage: 'morgana eject [--outDir <path>] [--pages a,b] [--port <n>] [--apiPrefix <p>] [--yes]',
    flags: {
      outDir: { type: 'string', describe: 'output directory (default ./ejected-app)' },
      pages: { type: 'string', describe: 'comma-separated page names (default all)' },
      port: { type: 'string', describe: 'Express port (default 3001)' },
      apiPrefix: { type: 'string', describe: 'API prefix (default /api)' },
      yes: { type: 'boolean', describe: 'install @studiomorgana/eject automatically' },
    },
    async run(args, { str, bool }) {
      const { eject } = await import('./commands/eject.mjs')
      const pages = str(args, 'pages') ? str(args, 'pages').split(',').map((s) => s.trim()).filter(Boolean) : undefined
      await eject({
        dir: process.cwd(),
        outDir: str(args, 'outDir') || undefined,
        pages,
        port: str(args, 'port') ? Number(str(args, 'port')) : undefined,
        apiPrefix: str(args, 'apiPrefix') || undefined,
        yes: bool(args, 'yes'),
      })
    },
  },

  package: {
    describe: 'build a shippable package — web dist/ or the desktop installer',
    usage: 'morgana package [web|desktop] [--dir <path>]',
    flags: {
      ...MINIFY_FLAGS,
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      outDir: { type: 'string', describe: 'installer project directory (desktop only)' },
    },
    async run(args, { str, positional }) {
      const { packageTarget } = await import('./commands/package.mjs')
      await packageTarget({
        target: positional(args, 0, 'web'),
        dir: str(args, 'dir') || process.cwd(),
        minify: minifyRequested(args),
        outDir: str(args, 'outDir'),
      })
    },
  },

  desktop: {
    describe: 'run or package the installed desktop app',
    usage: 'morgana desktop [dev|package] [--dir <path>] [--port <n>]',
    flags: {
      ...MINIFY_FLAGS,
      port: { type: 'string', short: 'P', describe: 'port (default 4317, or $PORT)' },
      dir: { type: 'string', short: 'd', describe: 'project directory' },
    },
    async run(args, { str, positional }) {
      const { desktop } = await import('./commands/desktop.mjs')
      await desktop({
        sub: positional(args, 0, 'dev'),
        dir: str(args, 'dir') || process.cwd(),
        port: Number(str(args, 'port') || process.env.PORT || 4317),
        minify: minifyRequested(args),
      })
    },
  },

  // The worker-facing commands (deploy, verify, login, logout, status) live in
  // `worker-commands.mjs` and are merged in by `bin/morgana.mjs`. One table,
  // two files — split for length, not for behaviour.
}
