/**
 * The worker-facing half of the command table.
 *
 * Split from `commands.mjs` purely for file length — these four all talk to a
 * deployed worker over HTTP, so they sit together. They are attached to
 * `COMMANDS` by `bin/morgana.mjs` at import time rather than being a second
 * registry, so there is still exactly one place a command is registered and
 * `--help` can enumerate the whole surface.
 */
import { TARGET_FLAGS, MINIFY_FLAGS, minifyRequested } from './commands.mjs'

export const WORKER_COMMANDS = {
  deploy: {
    describe: 'build and publish the project to a worker',
    usage: 'morgana deploy [--url <worker>] [--no-minify]',
    flags: {
      ...TARGET_FLAGS,
      ...MINIFY_FLAGS,
      // Exists for machines with no browser and no token. Without it, a CI job
      // that lost its MORGANA_TOKEN would sit waiting on a consent window that
      // can never appear — five minutes, then a message about the wrong thing.
      login: { type: 'boolean', describe: 'sign in in the browser when there is no token (--no-login to fail instead)' },
    },
    async run(args, { str }) {
      const path = await import('node:path')
      const { build } = await import('./commands/build.mjs')
      const { deploy } = await import('./commands/deploy.mjs')
      const dir = process.cwd()
      // The plan is explicit that deploy builds first. --no-minify is honoured so
      // a debug deploy does not silently publish minified code.
      await build({ dir, minify: minifyRequested(args) })
      await deploy({
        url: str(args, 'url'),
        project: str(args, 'project'),
        env: str(args, 'env'),
        token: str(args, 'token'),
        distDir: path.join(dir, 'dist'),
        noLogin: args.values.login === false,
      })
    },
  },

  login: {
    describe: 'sign in to a worker in your browser and store a token',
    usage: 'morgana login --url <worker> [--scope "read write deploy"]',
    flags: {
      ...TARGET_FLAGS,
      // Identity is typed into the worker's consent screen, not passed here, so
      // there is no --email to offer. `--scope` is the one thing worth choosing
      // locally: the screen will ask for permission and a person should be able
      // to see the request narrow itself.
      scope: { type: 'string', describe: 'scopes to request (default "read write deploy")' },
      timeout: { type: 'string', describe: 'ms to wait for sign-in (default 300000)' },
    },
    async run(args, { str }) {
      const { login } = await import('./commands/login.mjs')
      await login({
        url: str(args, 'url'),
        scope: str(args, 'scope') || undefined,
        timeout: Number(str(args, 'timeout', '300000')),
        env: str(args, 'env', 'production'),
      })
    },
  },

  logout: {
    describe: 'forget the stored token for this worker',
    usage: 'morgana logout --url <worker>',
    flags: { url: TARGET_FLAGS.url },
    async run(args, { str }) {
      const { logout } = await import('./commands/login.mjs')
      logout({ url: str(args, 'url') })
    },
  },

  status: {
    describe: 'what the worker currently holds for this project',
    usage: 'morgana status --url <worker>',
    flags: TARGET_FLAGS,
    async run(args, { str }) {
      const { status } = await import('./commands/status.mjs')
      await status({
        url: str(args, 'url'),
        project: str(args, 'project'),
        env: str(args, 'env'),
        token: str(args, 'token'),
      })
    },
  },
}
