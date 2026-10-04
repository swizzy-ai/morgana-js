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
 *   node deploy.mjs --url https://morgana-server.<sub>.workers.dev [--project demo] [--env production]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(dir, 'dist')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const base = (arg('url', process.env.MORGANA_URL ?? '')).replace(/\/+$/, '')
// The compiled client calls `/api/actions/<name>/run` with no project query, and
// the worker resolves a missing projectId to __default — so that is where a
// static build has to land.
const projectId = arg('project', process.env.MORGANA_PROJECT ?? '__default')
const envName = arg('env', process.env.MORGANA_ENV ?? 'production')
const token = arg('token', process.env.MORGANA_TOKEN ?? '')

if (!base) {
  console.error('missing --url (or MORGANA_URL) — e.g. https://morgana-server.example.workers.dev')
  process.exit(1)
}
if (!fs.existsSync(dist)) {
  console.error('dist/ not found — run `node build.mjs` first')
  process.exit(1)
}

const readJson = (rel, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dist, rel), 'utf8'))
  } catch {
    return fallback
  }
}

/**
 * A deploy that landed but is not usable, so publishing stops here.
 *
 * Thrown rather than `process.exit(1)` at each site, for two reasons: one exit
 * path instead of seven, and because a hard exit with an HTTP keep-alive socket
 * still open makes Node abort inside libuv — replacing the real diagnosis with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. The handler at the
 * bottom sets `process.exitCode` and lets the loop drain.
 */
class DeployFailed extends Error {}

function authHeaders(extra = {}) {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function post(path_, body, extraHeaders) {
  const res = await fetch(`${base}${path_}`, {
    method: 'POST',
    headers: authHeaders(extraHeaders),
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
    // rather than surfacing a bare 401.
    throw new Error(
      `${path_} → ${res.status} ${parsed?.message ?? ''}\n` +
        '  A deploy uploads code that then runs on the worker, so it needs a\n' +
        '  credential scoped to this project. There is no shared deploy key.\n' +
        '    morgana login --url <worker>   sign in once\n' +
        '    morgana deploy --token <token> an existing token\n' +
        '  Mint one without a browser:\n' +
        '    node tools/mint-token.mjs <worker>',
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
async function verifyLive(url) {
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
  return 'store'
}

function guessSource(event) {
  const e = String(event ?? '')
  if (e.startsWith('channel:')) return e.slice('channel:'.length)
  if (e.startsWith('action:')) return e.slice('action:'.length)
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

async function main() {
  const manifest = readJson('manifest.json', null)
  if (!manifest) {
    throw new DeployFailed('dist/manifest.json missing — the build did not finish')
  }
  const apis = readJson('server/apis.json', [])
  const stores = readJson('server/stores.json', [])
  const triggers = readJson('server/triggers.json', []).map(adaptTrigger)

  // 1. action code
  const actionDir = path.join(dist, 'server', 'actions')
  const actions = fs.existsSync(actionDir)
    ? fs
        .readdirSync(actionDir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => ({ name: f.replace(/\.js$/, ''), code: fs.readFileSync(path.join(actionDir, f), 'utf8') }))
    : []

  const actionRes = await post('/api/actions/deploy', { projectId, env: envName, actions })
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
  console.log(`actions  ${actionRes.success ? 'ok' : 'FAILED'}`)
  console.log(`  deployed  ${deployed.join(', ') || '(none)'}`)
  if (unchanged.length) console.log(`  unchanged ${unchanged.join(', ')}`)
  for (const f of failed) console.log(`  FAILED ${f.name}: ${f.error}`)

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

  const deployRes = await post('/api/deploy', {
    projectId,
    env: envName,
    apps,
    stores,
    triggers,
    apis,
    manifest,
    assets: collectAssets(),
  })
  console.log(`deploy   ${deployRes.success ? 'ok' : 'FAILED'}`)
  const revision = deployRes.revision ?? deployRes.deployed?.[0]?.revision
  if (revision !== undefined) console.log(`  revision ${revision}`)

  // Assets ship in the deploy payload, keyed `assets/<path>`. The page HTML
  // references `/assets/<path>` and the worker rewrites those to the
  // env-scoped deployed-asset route at serve time — so a single payload is the
  // whole delivery path. Rejected assets are reported, never dropped silently.
  const assetCount = collectAssets().length
  console.log(`assets   ${deployRes.assets ?? 0}/${assetCount} stored`)
  for (const r of deployRes.rejectedAssets ?? []) console.log(`  REJECTED ${r}`)

  // Housekeeping the worker could not finish, plus any trigger the worker
  // refused — stale-asset pruning today, dropped triggers always. The deploy
  // itself landed, so this is printed, not fatal; but it must not pass
  // unmentioned either.
  for (const w of deployRes.warnings ?? []) console.log(`  WARNING ${w}`)

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
  console.log(`triggers ${deployRes.triggers ?? 0} deployed${declaredTriggers ? ` (of ${declaredTriggers} declared)` : ''}`)

  if (!deployRes.success) {
    throw new DeployFailed('deploy reported rejected assets — not publishing')
  }

  // 3. verify it the way a visitor sees it
  const liveUrl = `${base}/apps/${envName}/${projectId}/main/${manifest.entry ?? 'home'}`
  const check = await verifyLive(liveUrl)
  if (check.bad.length) {
    throw new DeployFailed(
      `the page is live but ${check.bad.length} asset(s) do not serve:\n` +
        check.bad.map((b) => `    ${b}`).join('\n'),
    )
  }
  console.log(`verify   ok — page loads, ${check.assets} referenced asset(s) all 200`)

  // 4. drive it in a real browser. Status codes cannot tell an unstyled, inert
  // page from a working one, and that is precisely the failure this pipeline
  // reported as success before. `--no-browser` exists for a machine with no
  // browser, and says out loud that it is checking less.
  if (process.argv.includes('--no-browser')) {
    console.log('browser  SKIPPED (--no-browser) — stylesheet, console and runtime are unverified')
  } else {
    const browserCheck = await runBrowserVerify(liveUrl)
    if (browserCheck.failed) {
      throw new DeployFailed(
        'the deploy is live but the page is not usable:\n' +
          browserCheck.lines.map((l) => `    ${l}`).join('\n'),
      )
    }
    console.log(`browser  ok — ${browserCheck.summary}`)
  }

  console.log(`\ndeployed ${projectId} (${envName})`)
  console.log(`  ${liveUrl}`)
}

/**
 * Run `verify.mjs` as a child process and relay its verdict.
 *
 * A child process rather than an import because `verify.mjs` exits non-zero on
 * failure, and a deploy pipeline that reads a non-zero exit is the whole point;
 * swallowing that into a return value is how a failure becomes a warning.
 */
async function runBrowserVerify(liveUrl) {
  const res = spawnSync(process.execPath, [path.join(dir, 'verify.mjs'), '--url', liveUrl], {
    cwd: dir,
    encoding: 'utf8',
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd();
  // `verify.mjs` ends with one `result  …` line, so the verdict is read from
  // there rather than inferred from the exit code or the last line printed.
  const verdict = out.split('\n').find((l) => l.startsWith('result  '));
  if (res.status === 0) {
    return { failed: false, lines: [], summary: (verdict ?? 'result  ok').replace(/^result\s+/, '') };
  }
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    // Keep the failures and the reason; the per-check "ok" lines are noise here.
    .filter((l) => l.startsWith('FAIL') || l.startsWith('uncaught:') || l.startsWith('console:') || l.startsWith('network:') || l.startsWith('screenshot:'));
  return { failed: true, lines: lines.length ? lines : [out.slice(-400) || `verify.mjs exited ${res.status}`] };
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
 * are base64'd, flagged with `encoding: 'base64'`. Sending base64 for everything
 * would mean the worker stores and serves that base64 STRING as the file body,
 * so a browser receives `PHN2ZyB4bWxucz0…` where the stylesheet should be. Text assets are ~33% smaller on the wire too.
 */
function collectAssets() {
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

// `process.exitCode` rather than `process.exit()`: every request this command
// makes leaves a keep-alive socket behind, and hard-exiting with one open makes
// Node abort inside libuv ("Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)") — which replaces the real diagnosis with a crash. Draining
// the loop reports the actual failure and still exits non-zero.
main().catch((err) => {
  console.error(`\ndeploy   FAILED — ${err.message ?? err}`)
  process.exitCode = 1
})
