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
    usage: 'morgana deploy [--url <worker>] [--no-minify] [--no-secrets] [--dry-run]',
    flags: {
      ...TARGET_FLAGS,
      ...MINIFY_FLAGS,
      // Exists for machines with no browser and no token. Without it, a CI job
      // that lost its MORGANA_TOKEN would sit waiting on a consent window that
      // can never appear — five minutes, then a message about the wrong thing.
      login: { type: 'boolean', describe: 'sign in in the browser when there is no token (--no-login to fail instead)' },
      // Secrets from morgana.secrets.json go up with every deploy, so the worker
      // holds the values this project's code reads. --no-secrets skips them.
      secrets: { type: 'boolean', describe: 'send morgana.secrets.json to the worker first (--no-secrets to skip)' },
      'dry-run': { type: 'boolean', describe: 'build and show what would upload, without uploading or publishing' },
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
        noSecrets: args.values.secrets === false,
        dryRun: args.values['dry-run'] === true,
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

  secrets: {
    describe: 'set, list or remove the secrets server actions read via ctx.vars',
    usage: 'morgana secrets <set|list|remove> [NAME] [VALUE] [--local]',
    flags: {
      ...TARGET_FLAGS,
      local: { type: 'boolean', describe: 'use .morgana/secrets.json (morgana dev) instead of the worker' },
    },
    async run(args, { str, bool, positional }) {
      const { secrets } = await import('./commands/secrets.mjs')
      await secrets({
        action: positional(args, 0, ''),
        name: positional(args, 1, ''),
        value: positional(args, 2, ''),
        local: bool(args, 'local'),
        url: str(args, 'url'),
        project: str(args, 'project'),
        env: str(args, 'env'),
        token: str(args, 'token'),
      })
    },
  },

  domains: {
    describe: 'serve the project at a hostname you own (DNS-verified)',
    usage: 'morgana domains <add|verify|list|remove> [hostname]',
    flags: TARGET_FLAGS,
    async run(args, { str, positional }) {
      const { domains } = await import('./commands/domains.mjs')
      await domains({
        action: positional(args, 0, ''),
        hostname: positional(args, 1, ''),
        url: str(args, 'url'),
        project: str(args, 'project'),
        env: str(args, 'env'),
        token: str(args, 'token'),
      })
    },
  },

  data: {
    describe: "read the deployed project's stores: list them, query rows, show one",
    usage: 'morgana data [store] [id] [--where field=value,…] [--search text] [--fields a,b] [--limit 20] [--sort field] [--asc] [--json|--csv]',
    flags: {
      ...TARGET_FLAGS,
      where: { type: 'string', describe: 'only rows whose fields equal these values: source=image,stance=supported' },
      search: { type: 'string', describe: 'only rows whose text contains this' },
      fields: { type: 'string', describe: 'the columns to show, comma-separated' },
      limit: { type: 'string', describe: 'how many rows (default 20)' },
      sort: { type: 'string', describe: 'the field to sort by (default createdAt, newest first)' },
      asc: { type: 'boolean', describe: 'oldest first' },
      json: { type: 'boolean', describe: 'print JSON' },
      csv: { type: 'boolean', describe: 'print CSV' },
    },
    async run(args, { str, bool, positional }) {
      const { data } = await import('./commands/data.mjs')
      await data({
        store: positional(args, 0, ''),
        id: positional(args, 1, ''),
        where: str(args, 'where'),
        search: str(args, 'search'),
        fields: str(args, 'fields', ''),
        limit: Number(str(args, 'limit', '20')),
        sort: str(args, 'sort'),
        asc: bool(args, 'asc'),
        json: bool(args, 'json'),
        asCsv: bool(args, 'csv'),
        url: str(args, 'url'),
        project: str(args, 'project'),
        env: str(args, 'env'),
        token: str(args, 'token'),
      })
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
