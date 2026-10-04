/**
 * Deploy — publish a compiled dist/ to the Morgana worker.
 *
 * The compiler emits what the worker understands, in two uploads:
 *
 *   dist/server/actions/*.js   →  POST /api/actions/deploy   [{name, code}]
 *   pages + server/{apis,triggers,stores}.json + manifest.json
 *                             →  POST /api/deploy           {apps, stores, triggers, apis, manifest, assets}
 *
 * Every file under `dist/assets` rides in the deploy payload keyed
 * `assets/<path>`. Page HTML references `/assets/<path>`, and the worker
 * rewrites those to its env-scoped deployed-asset route at serve time, so this
 * single payload is the complete asset delivery path.
 *
 * Trigger specs are adapted, not passed through: the compiler emits
 * `{name, run, cron}` and the worker wants `{name, source, namespace, cron,
 * operations:[{type:'run', target}]}`. Keeping the adapter here means the
 * compiler's output stays a clean description of the project.
 *
 * Usage:
 *   morgana deploy --url https://morgana-server.<sub>.workers.dev [--project demo] [--env production]
 *
 * The entry point is an exported `deploy()` that throws, so the CLI owns the
 * exit path.
 *
 * There is no browser check here. Driving a real Chrome meant every user needed
 * one installed, and `deploy` refused to finish without it — so the check that
 * exists to catch a page answering 200 while completely inert made the command
 * unusable for most of its audience. It runs in CI instead, where a browser is
 * installed on purpose. `morgana deploy` verifies that the page and every asset
 * it references serve; CI verifies that the page works.
 */
import fs from 'node:fs'
import path from 'node:path'

import { say, warn, row, bold, dim } from '../ui.mjs'

/**
 * A deploy that landed but is not usable, so publishing stops here.
 *
 * Thrown rather than `process.exit(1)` at each site, for two reasons: one exit
 * path instead of seven, and because a hard exit with an HTTP keep-alive socket
 * still open makes Node abort inside libuv — replacing the real diagnosis with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. The CLI's handler
 * sets `process.exitCode` and lets the loop drain.
 */
export class DeployFailed extends Error {}

/**
 * The Morgana cloud — where a project goes when nobody says otherwise.
 *
 * Compiled in so that `morgana deploy` works with no arguments, which is the
 * point of shipping a CLI at all: a person who has just run `morgana init`
 * should not have to know a hostname. Anyone can point somewhere else with
 * `--url` or `MORGANA_URL`, so this is a default and not a commitment — a
 * self-hosted worker is a supported destination, it just has to be named.
 *
 * Kept as one named constant rather than inlined at the use site because
 * `login`, `status` and `logout` all resolve their target through here, and a
 * second copy of the hostname is how one command ends up signing in to a
 * different worker than another one deploys to.
 */
export const DEFAULT_BACKEND = 'https://morgana-server.hello-ad4.workers.dev'

/**
 * Resolve a command's target: which worker, which project, which environment.
 *
 * `--flag` beats the environment variable, the environment variable beats the
 * default, in that order — so a shell export overrides the default without the
 * flag having to be repeated on every invocation.
 *
 * `||`, not `??`, and the difference is load-bearing. The command table reads
 * absent string flags through `str(args, name)`, which answers `''` rather than
 * `undefined`. `??` only falls through on null and undefined, so `url ?? …`
 * would hand back the empty string and the default would never apply — which is
 * exactly what happened when this was first written, and it presents as
 * "no credentials for " with nothing after it.
 *
 * Shared with `status` and `login` so all three agree on what "the current
 * target" means. A second copy of these four lines is how `status` ends up
 * reading a different project than `deploy` just wrote.
 */
export function resolveTarget({ url, project, env } = {}) {
  return {
    base: String(url || process.env.MORGANA_URL || DEFAULT_BACKEND).replace(/\/+$/, ''),
    projectId: project || process.env.MORGANA_PROJECT || '__default',
    envName: env || process.env.MORGANA_ENV || 'production',
  }
}

/**
 * The credential this deploy will publish with, signing in if there isn't one.
 *
 * Four sources, in order, and the first that exists wins:
 *
 *   1. `--token`         an explicit choice for this invocation
 *   2. `MORGANA_TOKEN`   a shell export, which is how CI runs unattended
 *   3. the stored token  what `morgana login` wrote, so signing in once is
 *                        enough and every later deploy is silent
 *   4. `morgana login`   run here, in the browser, when there is nothing else
 *
 * (3) is the one that was missing, and it is why `login` followed by `deploy`
 * did not work: deploy read `--token` and the environment and nothing else, so
 * it ignored the token that had just been minted, sent no credential, and the
 * worker answered 401.
 *
 * (4) is a dynamic import because `login` imports `resolveTarget` from this
 * file. A static import in both directions would be a cycle; deferring it keeps
 * the two modules ordinary.
 */
export async function resolveCredential({ base, token, allowLogin = true }) {
  const explicit = token || process.env.MORGANA_TOKEN || ''
  if (explicit) return { bearer: explicit, source: token ? '--token' : 'MORGANA_TOKEN' }

  const { readCredentials, login } = await import('./login.mjs')

  const stored = readCredentials()[base]?.token
  if (stored) return { bearer: stored, source: 'stored' }

  if (!allowLogin) {
    throw new Error(
      `no credentials for ${base}, and --no-login was passed.\n` +
        '  Run `morgana login` to sign in, or set MORGANA_TOKEN.',
    )
  }

  say()
  say(`${bold('morgana')} ${dim('·')} no credentials for ${base} — signing you in`)
  const result = await login({ url: base })
  say()
  return { bearer: result.token, source: 'login' }
}

/**
 * Deploy a compiled `dist/`.
 *
 * `distDir` defaults to `process.cwd()/dist`. The original derived it from
 * `import.meta.url`, which only worked because the script sat next to its own
 * output; a CLI is invoked from the project it is deploying.
 */
export async function deploy({
  url,
  project,
  env,
  token,
  distDir,
  noLogin = false,
} = {}) {
  const { base, projectId, envName } = resolveTarget({ url, project, env })
  const dist = distDir || path.join(process.cwd(), 'dist')

  if (!fs.existsSync(dist)) {
    throw new Error('dist/ not found — run `morgana build` first')
  }

  // Resolved before anything is uploaded. A deploy that fails authentication
  // after writing pages and stores leaves a half-published project, and the
  // worker's own write path is not transactional across those two requests.
  const { bearer, source } = await resolveCredential({ base, token, allowLogin: !noLogin })
  if (source === 'stored') {
    say(row('auth', `using the token stored for ${base}`))
  }

const readJson = (dist, rel, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dist, rel), 'utf8'))
  } catch {
    return fallback
  }
}

function authHeaders(bearer, extra = {}) {
  return {
    'content-type': 'application/json',
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    ...extra,
  }
}

async function post(base, bearer, path_, body, extraHeaders) {
  const res = await fetch(`${base}${path_}`, {
    method: 'POST',
    headers: authHeaders(bearer, extraHeaders),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { success: res.ok, message: text.slice(0, 400) }
  }
  if (res.status === 401 || res.status === 403) {
    // The worker guards the deploy + code-upload surface. Say exactly what to do
    // rather than surfacing a bare 401 — and do not point at a shared key, which
    // is not an option and never should have been.
    throw new Error(
      `${path_} → ${res.status} ${parsed?.message ?? ''}\n` +
        '  A deploy uploads code that then runs on the worker, so it needs a\n' +
        '  credential scoped to this project. There is no shared deploy key.\n' +
        '    morgana login --url <worker>   sign in once\n' +
        '    morgana deploy --token <token> an existing token\n' +
        "  A token for one project cannot deploy to another.",
    )
  }
  if (!res.ok) {
    throw new Error(`${path_} → ${res.status} ${parsed?.message ?? text.slice(0, 200)}`)
  }
  return parsed
}

/**
 * Verify the publish the way a visitor would see it.
 *
 * A deploy that returns 200 can still serve a page whose stylesheet and client
 * runtime 404 — which is exactly what a broken asset route looks like from the
 * outside. So: fetch the page, then fetch every asset the served HTML actually
 * references, and fail the command if any of them does not come back 200.
 */
async function verifyLive(base, url) {
  const page = await fetch(url)
  if (!page.ok) throw new Error(`deployed page did not load: ${page.status} ${url}`)
  const html = await page.text()

  const refs = [...new Set([...html.matchAll(/(?:href|src)="(\/mt\/[^"]+)"/g)].map((m) => m[1]))]
  if (!refs.length) throw new Error(`deployed page references no assets — refusing to call this a success: ${url}`)

  const bad = []
  for (const ref of refs) {
    const asset = await fetch(new URL(ref, base))
    if (!asset.ok) bad.push(`${ref} → ${asset.status}`)
    else await asset.arrayBuffer()
  }
  return { pages: 1, assets: refs.length, bad }
}

/** The compiler's flat trigger → the worker's operation list. */
function adaptTrigger(t) {
  const out = { name: t.name, operations: [{ type: 'run', target: t.run, params: t.when }] }
  if (t.cron) {
    out.cron = t.cron
    out.namespace = 'action'
    out.source = t.run
    // No `event` here. A cron trigger is not an event trigger, and the worker
    // refuses one that claims to be both.
  } else {
    out.namespace = guessNamespace(t.event)
    out.source = guessSource(t.event)
    out.event = normalizeEvent(t.event)
  }
  if (t.enabled === false) out.enabled = false
  return out
}

function guessNamespace(event) {
  const e = String(event ?? '')
  if (e.startsWith('channel:')) return 'channel'
  if (e.startsWith('action:')) return 'action'
  // Without this an agent event landed in 'store', where a trigger on
  // `agent:task:completed` could never match — the same dead binding the
  // compiler refuses to emit for a typo.
  if (e.startsWith('agent:')) return 'agent'
  return 'store'
}

function guessSource(event) {
  const e = String(event ?? '')
  if (e.startsWith('channel:')) return e.slice('channel:'.length)
  if (e.startsWith('action:')) return e.slice('action:'.length)
  if (e.startsWith('agent:')) return e.slice('agent:'.length)
  // "store.orders.created" → "orders"
  const parts = e.split('.')
  return parts.length >= 2 ? parts[1] : e
}

function normalizeEvent(event) {
  const e = String(event ?? '')
  if (e.startsWith('store.') && e.endsWith('.created')) return 'created'
  if (e.startsWith('store.') && e.endsWith('.updated')) return 'updated'
  if (e.startsWith('store.') && e.endsWith('.deleted')) return 'deleted'
  return e
}

async function main({ base, projectId, envName, bearer, dist }) {
  const manifest = readJson(dist, 'manifest.json', null)
  if (!manifest) {
    throw new DeployFailed('dist/manifest.json missing — the build did not finish')
  }
  const apis = readJson(dist, 'server/apis.json', [])
  const stores = readJson(dist, 'server/stores.json', [])
  const triggers = readJson(dist, 'server/triggers.json', []).map(adaptTrigger)

  // 1. action code
  const actionDir = path.join(dist, 'server', 'actions')
  const actions = fs.existsSync(actionDir)
    ? fs
        .readdirSync(actionDir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => ({ name: f.replace(/\.js$/, ''), code: fs.readFileSync(path.join(actionDir, f), 'utf8') }))
    : []

  const actionRes = await post(base, bearer, '/api/actions/deploy', { projectId, env: envName, actions })
  // The worker answers with `actions`, not `results`.
  const actionRows = actionRes.actions ?? actionRes.results ?? []
  const deployed = actionRows.filter((r) => r.deployed).map((r) => r.name)
  const unchanged = actionRows.filter((r) => r.unchanged).map((r) => r.name)
  const failed = actionRows.filter((r) => r.error)
  if (failed.length) {
    throw new DeployFailed(
      `some actions failed to deploy — not publishing the project:\n` +
        failed.map((f) => `    ${f.name}: ${f.error}`).join('\n'),
    )
  }
  say(`actions  ${actionRes.success ? 'ok' : 'FAILED'}`)
  say(`  deployed  ${deployed.join(', ') || '(none)'}`)
  if (unchanged.length) say(`  unchanged ${unchanged.join(', ')}`)
  for (const f of failed) say(`  FAILED ${f.name}: ${f.error}`)

  // 2. project deploy: pages, stores, triggers, routes
  const pages = (manifest.pages ?? []).map((p) => ({
    name: p.name,
    address: p.address,
    html: safeRead(path.join(dist, 'pages', `${p.name}.html`)),
    clientJs: safeRead(path.join(dist, 'assets', 'client.js')),
    css: safeRead(path.join(dist, 'assets', 'style.css')),
  }))
  const apps = [
    {
      name: 'main',
      displayName: (manifest.apps ?? [])[0]?.displayName ?? 'App',
      pages: pages.map((p) => ({ name: p.name, address: p.address, html: p.html })),
    },
  ]

  const deployRes = await post(base, bearer, '/api/deploy', {
    projectId,
    env: envName,
    apps,
    stores,
    triggers,
    apis,
    manifest,
    assets: collectAssets(dist),
  })
  say(`deploy   ${deployRes.success ? 'ok' : 'FAILED'}`)
  const revision = deployRes.revision ?? deployRes.deployed?.[0]?.revision
  if (revision !== undefined) say(`  revision ${revision}`)

  // Assets ship in the deploy payload, keyed `assets/<path>`. The page HTML
  // references `/assets/<path>` and the worker rewrites those to the
  // env-scoped deployed-asset route at serve time — so a single payload is the
  // whole delivery path. Rejected assets are reported, never dropped silently.
  const assetCount = collectAssets(dist).length
  say(`assets   ${deployRes.assets ?? 0}/${assetCount} stored`)
  for (const r of deployRes.rejectedAssets ?? []) say(`  REJECTED ${r}`)

  // Housekeeping the worker could not finish, plus any trigger the worker
  // refused — stale-asset pruning today, dropped triggers always. The deploy
  // itself landed, so this is printed, not fatal; but it must not pass
  // unmentioned either.
  for (const w of deployRes.warnings ?? []) say(`  WARNING ${w}`)

  // A trigger the worker refused is a declared behaviour that will not happen —
  // a cron that never fires, a store hook that never runs. Failing is the point:
  // this exact class of silent drop is how every trigger in this project was
  // rejected for weeks while the deploy reported success.
  const skippedTriggers = deployRes.skippedTriggers ?? []
  if (skippedTriggers.length) {
    throw new DeployFailed(
      `${skippedTriggers.length} declared trigger(s) were not deployed:\n` +
        skippedTriggers.map((s) => `    ${s}`).join('\n'),
    )
  }
  const declaredTriggers = triggers.length
  if (declaredTriggers && !(deployRes.triggers >= declaredTriggers)) {
    throw new DeployFailed(
      `declared ${declaredTriggers} trigger(s), worker stored ${deployRes.triggers} — not publishing.`,
    )
  }
  say(`triggers ${deployRes.triggers ?? 0} deployed${declaredTriggers ? ` (of ${declaredTriggers} declared)` : ''}`)

  if (!deployRes.success) {
    throw new DeployFailed('deploy reported rejected assets — not publishing')
  }

  // 3. verify it the way a visitor sees it
  const liveUrl = `${base}/apps/${envName}/${projectId}/main/${manifest.entry ?? 'home'}`
  const check = await verifyLive(base, liveUrl)
  if (check.bad.length) {
    throw new DeployFailed(
      `the page is live but ${check.bad.length} asset(s) do not serve:\n` +
        check.bad.map((b) => `    ${b}`).join('\n'),
    )
  }
  say(`verify   ok — page loads, ${check.assets} referenced asset(s) all 200`)

  say(`\ndeployed ${projectId} (${envName})`)
  say(`  ${liveUrl}`)
  return { liveUrl, revision, deployRes }
}

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.css': 'text/css',
  '.js': 'text/javascript',
}

function walk(dir_, baseDir, out = []) {
  if (!fs.existsSync(dir_)) return out
  for (const entry of fs.readdirSync(dir_, { withFileTypes: true })) {
    const full = path.join(dir_, entry.name)
    if (entry.isDirectory()) walk(full, baseDir, out)
    else {
      const rel = path.relative(baseDir, full).split(path.sep).join('/')
      out.push({
        path: rel,
        data: fs.readFileSync(full).toString('base64'),
        contentType: MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
        size: fs.statSync(full).size,
      })
    }
  }
  return out
}

/**
 * Every file the compiled `dist/assets` tree ships, keyed `assets/<path>`.
 *
 * This includes client.js and style.css: they are referenced by every page as
 * `/assets/client.js` and `/assets/style.css`, and the worker rewrites those to
 * its env-scoped deployed-asset route, so they have to travel in this payload.
 * Image/font assets the project references the same way.
 *
 * Text is sent as text and only genuinely binary files (fonts, raster images)
 * are base64'd, flagged with `encoding: 'base64'`. Base64 for everything would
 * mean the worker stores and serves that base64 STRING as the file body, so a
 * browser receives `PHN2ZyB4bWxucz0…` where the stylesheet should be. Text
 * assets are ~33% smaller on the wire too.
 */
function collectAssets(dist) {
  const src = path.join(dist, 'assets')
  return walk(src, src).map((a) => {
    const ext = path.extname(a.path).toLowerCase()
    const text = TEXT_ASSETS.has(ext)
    return {
      key: `assets/${a.path}`,
      content: text ? fs.readFileSync(path.join(src, a.path), 'utf8') : a.data,
      ...(text ? {} : { encoding: 'base64' }),
      contentType: a.contentType,
      size: a.size,
    }
  })
}

/** Extensions that are safe to send as UTF-8 text. Everything else is binary. */
const TEXT_ASSETS = new Set([
  '.css', '.js', '.mjs', '.json', '.map', '.html', '.txt', '.md', '.svg', '.vtt', '.webmanifest',
])

// `main()` is the ported body. It stays a named function so the diff against the
// example script is readable — the port is "same code, different entry point",
// and collapsing it into the exported function would hide that.
//
// The keep-alive note from the original is preserved here rather than at each
// `process.exit`: every request this command makes leaves a socket behind, and
// hard-exiting with one open makes Node abort inside libuv ("Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)"), which replaces the real diagnosis with
// a crash. Setting `process.exitCode` drains the loop and still exits non-zero.
return main({ base, projectId, envName, bearer, dist })
}
