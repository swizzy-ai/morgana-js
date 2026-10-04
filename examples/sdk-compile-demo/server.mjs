/**
 * Host — serves the compiled dist/ and runs the compiled server actions.
 *
 * This is the reference deployment target: a Node process that owns a SQLite
 * file, serves the static output, dispatches http routes and action invocations
 * from dist/, and gives every action the same ctx surface the SDK describes.
 *
 *   node server.mjs          # PORT=4317 by default
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { StoreEngine } from './lib/store.mjs'
import { makeHostContext } from './lib/host-context.mjs'
import { ChannelHub } from './lib/channels.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(dir, 'dist')
const dataDir = process.env.MORGANA_DATA ?? path.join(dir, '.data')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(dist, rel), 'utf8'))
}

function readJsonSafe(rel, fallback) {
  try {
    return readJson(rel)
  } catch {
    return fallback
  }
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type })
  res.end(body)
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), MIME['.json'])
}

// ── build state ───────────────────────────────────────────────────────────

if (!fs.existsSync(dist)) {
  console.error('dist/ not found — run `node build.mjs` first')
  process.exit(1)
}

const manifest = readJson('manifest.json')
const apis = readJsonSafe('server/apis.json', [])
const triggers = readJsonSafe('server/triggers.json', [])
const stores = readJsonSafe('server/stores.json', [])
// Public vars ship in the manifest; private vars come from this process's env
// (MORGANA_VAR_<NAME>), so a secret never lands in a build artefact.
const config = {
  vars: {
    public: manifest.vars ?? {},
    private: Object.fromEntries(
      Object.entries(process.env)
        .filter(([k]) => k.startsWith('MORGANA_VAR_'))
        .map(([k, v]) => [k.slice('MORGANA_VAR_'.length).toLowerCase(), v]),
    ),
  },
}

fs.mkdirSync(dataDir, { recursive: true })
const store = new StoreEngine({ file: path.join(dataDir, 'morgana.db') })
// Declaring the project's stores reaches storage, so this is async — same rule
// as the `collections` handle itself.
for (const s of stores) {
  if (s && typeof s.name === 'string') await store.create(s.name, s.shape ?? { columns: [] })
}

/** Deployed server action modules, imported once and cached. */
const actionModules = new Map()

async function getAction(name) {
  if (!actionModules.has(name)) {
    const file = path.join(dist, 'server', 'actions', `${name}.js`)
    if (!fs.existsSync(file)) {
      throw Object.assign(new Error(`Action "${name}" is not deployed`), { code: 'ACTION_MISSING' })
    }
    actionModules.set(name, await import(pathToFileURL(file).href))
  }
  return actionModules.get(name)
}

/** Event ring log: client lifecycle posts plus server-side action runs. */
const eventLog = []
function logEvent(entry) {
  eventLog.push({ t: new Date().toISOString(), ...entry })
  while (eventLog.length > 500) eventLog.shift()
}

/**
 * Channels — one hub for the whole host, mirroring the deployed per-channel DO.
 * `ctx.events.publish` writes here and `GET /api/events?channel=…` streams from
 * it, so a channel behaves the same in development as it does deployed.
 */
const channels = new ChannelHub()

/**
 * The grant, for a locally-hosted channel.
 *
 * `rules` is the `channels` map the compiler put in the manifest — the same
 * declaration the worker checks, read from the same build artefact. The worker
 * resolves a session when a rule needs one; this host has no session store, so
 * a rule that requires a user is refused here with the same status the worker
 * would use. That is a real difference, and it is the safe direction: a local
 * host cannot grant `member` access it has no way to verify, so it refuses
 * rather than pretending.
 *
 * Returns null when access is allowed.
 */
function channelRefusal(rules, channel, req) {
  const declared = rules?.[channel]
  // Undeclared, or declared with neither field: open to the project. That is
  // what keeps a channel created at runtime usable, and it is why the smoke test's
  // `lobby` check is a 200 rather than a refusal.
  if (!declared) return null
  if (!declared.access?.action && !(Array.isArray(declared.members) && declared.members.length)) {
    return null
  }

  const hasSession = Boolean(req.headers['authorization'])
  const notResolved = {
    // Stated rather than left implicit: a 401 here is not a bug, it is a local
    // host with nowhere to resolve the caller against.
    note: 'the local host cannot resolve a session, so this channel is refused here',
  }

  if (Array.isArray(declared.members) && declared.members.length) {
    // The caller would have to be identified to be compared against the list, and
    // this host cannot identify anyone — so a named-members channel is closed
    // here and open only where a session exists.
    return {
      status: 401,
      body: {
        success: false,
        message: `channel "${channel}" is for named members`,
        channel,
        ...notResolved,
      },
    }
  }

  // A permission function is a deployed action; this host runs actions but has no
  // membership store to answer "is this person on the support team", so it cannot
  // produce the verdict. Refusing is the safe direction — opening a channel whose
  // check nobody ran is the failure that matters.
  return {
    status: 401,
    body: {
      success: false,
      message: `channel "${channel}" is gated by an access rule this host cannot evaluate`,
      channel,
      decidedBy: 'action',
      ...notResolved,
    },
  }
}

const enabledActions = (manifest.actions ?? []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)

/**
 * Run a deployed action. `params` becomes ctx.args, exactly as the browser's
 * `ctx.actions.run` and the http routes deliver it.
 */
async function runAction(name, params) {
  const mod = await getAction(name)
  const { ctx, logs } = await makeHostContext({
    store,
    filesDir: path.join(dataDir, 'files'),
    args: params ?? {},
    config,
    declaredStores: stores.map((s) => s.name),
    enabledActions,
    runAction,
    base: '',
    // The same hub the SSE route reads, so a publish from an action reaches
    // the pages holding that channel open.
    channels,
  })
  const t0 = Date.now()
  logEvent({ lane: 'server-action', name: 'action:start', origin: name })
  try {
    const result = mod.handle
      ? await mod.handle(ctx)
      : await mod.run({ ctx, args: params ?? {} })
    logEvent({ lane: 'server-action', name: 'action:success', origin: name, duration: Date.now() - t0 })
    for (const line of logs) logEvent({ lane: 'server-log', origin: name, message: line })
    return result
  } catch (err) {
    logEvent({ lane: 'server-action', name: 'action:error', origin: name, error: String(err?.message ?? err) })
    throw err
  }
}

async function readBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/** Coerce an http route's path pattern into a matcher with :params. */
function matchRoute(pattern, pathname) {
  const p = pattern.split('/').filter(Boolean)
  const a = pathname.split('/').filter(Boolean)
  if (p.length !== a.length) return null
  const params = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return params
}

// ── server ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local')
  const pathname = url.pathname

  // 1. http routes declared in morgana.config.ts, from dist/server/apis.json
  if (
    !pathname.startsWith('/assets/') &&
    !pathname.startsWith('/pages/') &&
    pathname !== '/' &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/apps/')
  ) {
    for (const route of apis) {
      if (route.method !== req.method) continue
      const params = matchRoute(route.path, pathname)
      if (!params) continue
      try {
        const body = await readBody(req)
        for (const [k, v] of url.searchParams) if (!(k in body)) body[k] = v
        const result = await runAction(route.action, { ...body, ...params })
        return sendJson(res, 200, { success: true, data: { result } })
      } catch (err) {
        return sendJson(res, 500, { success: false, message: String(err?.message ?? err) })
      }
    }
  }

  // 2. action invocation — the surface ctx.actions.run targets
  const runMatch = /^\/api\/actions\/([^/]+)\/run$/.exec(pathname)
  if (runMatch && req.method === 'POST') {
    const name = decodeURIComponent(runMatch[1])
    try {
      const body = await readBody(req)
      const params = body && typeof body === 'object' && 'params' in body ? body.params : body
      const result = await runAction(name, params ?? {})
      return sendJson(res, 200, { success: true, data: { result } })
    } catch (err) {
      const missing = err?.code === 'ACTION_MISSING' || String(err?.message).includes('Cannot find module')
      return sendJson(res, missing ? 404 : 500, {
        success: false,
        message: `Action "${name}" failed: ${String(err?.message ?? err)}`,
      })
    }
  }

  // 3. channels — the same surface the deployed host serves, so `ctx.events`
  //    means the same thing in development as it does deployed.
  //
  //    Ordering matters: `/api/events/log` is matched first because it is a
  //    literal path, and a `/api/events` prefix match would otherwise swallow
  //    it and answer the wrong thing to a page posting its error log.
  if (pathname === '/api/events/log') {
    if (req.method === 'POST') {
      const entry = await readBody(req)
      if (entry && typeof entry === 'object') logEvent(entry)
      return sendJson(res, 200, { success: true })
    }
    return sendJson(res, 200, eventLog)
  }

  // 3a. GET /api/events?channel=<name> — SSE, held open.
  //
  //     This is what makes a channel multi-client locally. The compiled client
  //     reads the stream with `fetch`, not `EventSource`, so it can send the
  //     runtime key in a header; the local host does not require one, but it
  //     accepts and ignores one so the same code path runs either way.
  if (pathname === '/api/events' && req.method === 'GET') {
    const channel = url.searchParams.get('channel')
    if (channel) {
      // The grant, from the rule the build declared. A lookup, not a call into
      // an action — and a channel with no declared rule stays open to the
      // project, which is what lets a runtime-created channel work.
      const refusal = channelRefusal(manifest.channels, channel, req)
      if (refusal) return sendJson(res, refusal.status, refusal.body)
      if (!channels.subscribe(channel, req, res)) {
        return sendJson(res, 404, { success: false, message: 'Invalid channel name' })
      }
      // Held open deliberately — the response ends when the client goes away.
      return undefined
    }
    // No channel: the project-wide stream. Only the `connected` frame is
    // emitted, because this host does not fan store/world events to pages —
    // claiming it did would be a stream that looks live and never says anything.
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('event: connected\ndata: {}\n\n')
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n')
      } catch {
        clearInterval(keepAlive)
      }
    }, 15000)
    req.on('close', () => clearInterval(keepAlive))
    req.on('error', () => clearInterval(keepAlive))
    return undefined
  }

  // 3b. POST /api/events — publish. `channel:<name>` goes to that channel;
  //     anything else is recorded in the event log, which is what the page
  //     clients post their lifecycle entries to.
  if (pathname === '/api/events' && req.method === 'POST') {
    const body = (await readBody(req)) || {}
    const type = typeof body.type === 'string' ? body.type : ''
    if (type.startsWith('channel:')) {
      const name = type.slice('channel:'.length)
      const ok = channels.publish(name, body.payload ?? {})
      return sendJson(res, ok ? 200 : 404, { success: ok, event: type })
    }
    if (type) logEvent({ event: type, ...(body.payload ?? {}), ts: Date.now() })
    return sendJson(res, 200, { success: true, event: type })
  }

  // 3c. /api/channels — list and create, matching the deployed shape.
  if (pathname === '/api/channels' && req.method === 'GET') {
    return sendJson(res, 200, { success: true, channels: channels.list() })
  }
  if (pathname === '/api/channels' && req.method === 'POST') {
    const body = (await readBody(req)) || {}
    const name = typeof body.name === 'string' ? body.name : ''
    const c = channels.channel(name, typeof body.scope === 'string' ? body.scope : 'public')
    if (!c) return sendJson(res, 400, { success: false, message: 'Invalid channel name' })
    return sendJson(res, 200, { success: true, channel: { name: c.name, scope: c.scope, subscribers: 0 } })
  }
  if (pathname === '/api/channels/history' && req.method === 'POST') {
    const body = (await readBody(req)) || {}
    const name = typeof body.name === 'string' ? body.name : ''
    return sendJson(res, 200, { success: true, history: channels.history(name, Number(body.limit) || 0) })
  }

  // 4. inspection: triggers, stores, records
  if (pathname === '/api/triggers') return sendJson(res, 200, triggers)
  if (pathname === '/api/stores') return sendJson(res, 200, await store.dump())
  if (pathname === '/api/records') {
    const name = url.searchParams.get('store')
    if (!name) return sendJson(res, 400, { success: false, message: '?store= is required' })
    try {
      return sendJson(res, 200, { success: true, data: { result: await store.get(name) } })
    } catch (err) {
      return sendJson(res, 404, { success: false, message: String(err?.message ?? err) })
    }
  }

  // 5. the entry page
  if (pathname === '/') {
    const entry = typeof manifest.entry === 'string' && manifest.entry ? manifest.entry : 'home'
    try {
      return send(res, 200, fs.readFileSync(path.join(dist, 'pages', `${entry}.html`), 'utf8'), MIME['.html'])
    } catch {
      return send(res, 404, 'no entry page — run `node build.mjs` first')
    }
  }

  // 6. static output, with traversal refused
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  const full = path.join(dist, rel)
  if (!path.resolve(full).startsWith(path.resolve(dist)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(res, 404, 'not found')
  }
  return send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] ?? 'application/octet-stream')
})

const port = Number(process.env.PORT || 4317)
server.listen(port, () => {
  console.log(`morgana host on http://localhost:${port}/  (entry: ${manifest.entry ?? 'home'})`)
  console.log(`  pages:   ${(manifest.pages ?? []).map((p) => p.name).join(', ') || '(none)'}`)
  console.log(`  actions: ${enabledActions.join(', ') || '(none)'}`)
  console.log(`  routes:  ${apis.map((a) => `${a.method} ${a.path}`).join(', ') || '(none)'}`)
  console.log(`  stores:  ${stores.map((s) => s.name).join(', ') || '(none)'}`)
})

// A channel stream is a long-lived response, so without this the process
// refuses to exit with one open — and a shutdown that hangs is worse than a
// clean one, because the next run silently attaches to the old process.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    channels.closeAll()
    server.close(() => process.exit(0))
    // Do not wait forever on a socket that is not closing politely.
    setTimeout(() => process.exit(0), 500).unref()
  })
}
