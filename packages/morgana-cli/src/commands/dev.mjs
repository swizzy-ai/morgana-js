/**
 * Host — serves the compiled dist/ and runs the compiled server actions.
 *
 * This is the reference deployment target: a Node process that owns a SQLite
 * file, serves the static output, dispatches http routes and action invocations
 * from dist/, and gives every action the same ctx surface the SDK describes.
 *
 *   node server.mjs          # PORT=4317 by default
 *
 * Vendored into the CLI unchanged, as a vendored file
 * until it has tests" — it is ~400 lines of hand-written Node HTTP that has no
 * tests, so porting it would mean porting it blind. Only the entry point changed:
 * `dir` is a parameter rather than `import.meta.url`'s folder, and `dev()` throws
 * instead of exiting, so the CLI owns the exit path. Watch/recompile is added by
 * `morgana dev` in the bin wrapper rather than here.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { StoreEngine } from '../lib/store.mjs'
import { makeHostContext } from '../lib/host-context.mjs'
import { ChannelHub } from '../lib/channels.mjs'
import { localPrivateVars } from '../lib/secrets.mjs'
import { createLocalAppAuth, pageGate, tokenOf } from '../lib/app-auth.mjs'
import { handleSessionRoute, serializeSessionCookie, clearSessionCookie, findPageByPath, isParamAddress } from '@morgana/sdk-compile/server-host'
import { isPageResult } from '@morgana/sdk-compile'
import { say, warn } from '../ui.mjs'

/**
 * Serve a compiled `dist/` and run its compiled server actions.
 *
 * Returns the running server so the caller can shut it down; this never returns
 * on its own, because a dev server that exits is not a dev server.
 */
export async function dev({ dir = process.cwd(), port = Number(process.env.PORT ?? 4317), desktop } = {}) {
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
  // A dev server must never serve stale bytes: every rebuild changes dist/,
  // and a cached page or client.js means testing yesterday's build. Production
  // caching belongs to the deployed worker, not here.
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), MIME['.json'])
}

// ── build state ───────────────────────────────────────────────────────────

if (!fs.existsSync(dist)) {
  throw new Error('dist/ not found — run `morgana build` first')
}

const manifest = readJson('manifest.json')
const serverApis = readJsonSafe('server/apis.json', [])
// Desktop http routes live in their own partition so the cloud never sees
// them, but this host serves both — the installed app is a full host.
const desktopApis = readJsonSafe('desktop/apis.json', [])
const apis = [...serverApis, ...desktopApis]
const triggers = readJsonSafe('server/triggers.json', [])
const stores = readJsonSafe('server/stores.json', [])
// Public vars ship in the manifest; private vars (secrets) come from
// .morgana/secrets.json and MORGANA_VAR_<NAME>, so a secret never lands in a
// build artefact. Read per invocation so `morgana secrets set --local` takes
// effect without a restart.
const config = {
  vars: {
    public: manifest.vars ?? {},
    get private() {
      return localPrivateVars(dir)
    },
  },
}

fs.mkdirSync(dataDir, { recursive: true })
const store = new StoreEngine({ file: path.join(dataDir, 'morgana.db') })
// Declaring the project's stores reaches storage, so this is async — same rule
// as the `collections` handle itself.
for (const s of stores) {
  if (s && typeof s.name === 'string') await store.create(s.name, s.shape ?? { columns: [] })
}

// App end-users: the shared auth core over this SQLite file. The dev host is
// plain http, so the cookie drops `Secure` (and with it the `__Host-` prefix).
const appAuth = createLocalAppAuth(store)
const SECURE = false

/** Deployed server action modules, imported once and cached. */
const actionModules = new Map()

async function getAction(name) {
  if (!actionModules.has(name)) {
    // Server first, desktop second: a server module and a desktop module may
    // never share a name (the compiler rejects the collision), so order is
    // a fallback, not a shadow.
    const file = [
      path.join(dist, 'server', 'actions', `${name}.js`),
      path.join(dist, 'desktop', 'actions', `${name}.js`),
    ].find((f) => fs.existsSync(f))
    if (!file) {
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

const enabledActions = [...(manifest.actions ?? []), ...(manifest.desktopActions ?? [])].map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)

// Parsed server page graphs, shared across invocations. The JSON is immutable
// in practice (rewritten only by rebuilds); hydration clones per request.
const graphCache = new Map()

/**
 * Run a deployed action. `params` becomes ctx.args, exactly as the browser's
 * `ctx.actions.run` and the http routes deliver it.
 */
async function runAction(name, params, reqCtx = {}) {
  const mod = await getAction(name)
  const { ctx, logs } = await makeHostContext({
    store,
    filesDir: path.join(dataDir, 'files'),
    args: params ?? {},
    config,
    declaredStores: stores.map((s) => s.name),
    enabledActions,
    // Action → action stays inside this request: same user, same cookie sink.
    runAction: (n, p) => runAction(n, p, reqCtx),
    auth: appAuth,
    session: reqCtx.session,
    onSession: reqCtx.onSession,
    request: reqCtx.request,
    response: reqCtx.response,
    // Opaque — built by the backend package, carried verbatim (see host-context).
    desktop,
    base: '',
    // Request-time rendering reads here. Parsed graphs are cached per process;
    // each invocation hydrates its own IR, so concurrent requests stay isolated.
    dist,
    graphCache,
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

/**
 * Per-request auth state: the session the request carried, and a sink that
 * turns an action's signIn/signOut into the Set-Cookie on this response.
 */
async function requestContext(req, url, body, params = {}) {
  const token = tokenOf(req)
  const user = token ? await appAuth.resolve(token) : null
  const cookies = []
  return {
    cookies,
    response: {},
    session: { token, user },
    onSession: (s) =>
      cookies.push(
        s
          ? serializeSessionCookie(s.token, { secure: SECURE, maxAgeSeconds: (s.expiresAt - Date.now()) / 1000 })
          : clearSessionCookie(SECURE),
      ),
    request: {
      method: req.method,
      url: req.url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: { ...req.headers },
      body,
      params,
      user,
      ip: req.socket?.remoteAddress,
    },
  }
}

/**
 * Answer with what the action set through ctx.server.respond — the worker's
 * rules: status/headers/content type as given; a string body is sent as-is,
 * anything else as JSON (the default envelope when no body was set).
 */
function sendCaptured(res, captured, result) {
  const status = captured.status ?? 200
  const headers = { 'cache-control': 'no-store', ...(captured.headers ?? {}) }
  const body = captured.body !== undefined ? captured.body : { success: true, data: { result } }
  if (typeof body === 'string') {
    headers['content-type'] = captured.contentType ?? headers['content-type'] ?? 'text/plain; charset=utf-8'
    res.writeHead(status, headers)
    return res.end(body)
  }
  headers['content-type'] = captured.contentType ?? headers['content-type'] ?? MIME['.json']
  res.writeHead(status, headers)
  return res.end(JSON.stringify(body))
}

/** An auth refusal thrown by an action (ctx.auth.require) keeps its status. */
function errorStatus(err, fallback = 500) {
  const s = Number(err?.status)
  return s >= 400 && s < 500 ? s : fallback
}

// Gated pages, by every path their HTML can be fetched from: the address, the
// `/pages/<name>.html` alias, and the raw file under dist/.
const gatedPages = (manifest.pages ?? []).filter((p) => p && p.access)
const bareAddress = (a) => (a === '/' ? '' : String(a ?? '').replace(/^\/+|\/+$/g, '').toLowerCase())
const gatedFiles = new Map()
for (const p of gatedPages) {
  const addr = bareAddress(p.address)
  gatedFiles.set(`pages/${p.name}.html`.toLowerCase(), p)
  gatedFiles.set(addr ? `${addr}/index.html` : 'index.html', p)
}
// Param addresses (`products/:id`) match by pattern, literal pages first.
const gatedPageAt = (pathname) => {
  const hit = findPageByPath(manifest.pages ?? [], pathname)
  return hit?.page?.access ? hit.page : undefined
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
  const refuse = (r) => {
    if (r.location) {
      res.writeHead(r.status, { location: r.location, 'cache-control': 'no-store' })
      return res.end()
    }
    return send(res, r.status, r.body)
  }

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
      // A server page's owning route is gated like the page, before the action
      // runs — the render must not happen for a visitor who may not see it.
      if (req.method === 'GET') {
        const owned = gatedPageAt(pathname)
        const refused = owned ? await pageGate(appAuth, owned, req) : null
        if (refused) return refuse(refused)
      }
      try {
        const body = await readBody(req)
        for (const [k, v] of url.searchParams) if (!(k in body)) body[k] = v
        const rc = await requestContext(req, url, body, params)
        const result = await runAction(route.action, { ...body, ...params }, rc)
        if (rc.cookies.length) res.setHeader('set-cookie', rc.cookies)
        if (rc.response.set) return sendCaptured(res, rc.response, result)
        // An action returning a rendered page answers with the page itself —
        // this is the action-as-router path. Everything else keeps the JSON
        // envelope.
        if (isPageResult(result)) return send(res, 200, result.html, MIME['.html'])
        return sendJson(res, 200, { success: true, data: { result } })
      } catch (err) {
        return sendJson(res, errorStatus(err), { success: false, message: String(err?.message ?? err) })
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
      const rc = await requestContext(req, url, params ?? {})
      const result = await runAction(name, params ?? {}, rc)
      if (rc.cookies.length) res.setHeader('set-cookie', rc.cookies)
      if (rc.response.set) return sendCaptured(res, rc.response, result)
      return sendJson(res, 200, { success: true, data: { result } })
    } catch (err) {
      const missing = err?.code === 'ACTION_MISSING' || String(err?.message).includes('Cannot find module')
      return sendJson(res, missing ? 404 : errorStatus(err), {
        success: false,
        message: `Action "${name}" failed: ${String(err?.message ?? err)}`,
      })
    }
  }

  // 2a. the page's session — sign up / in / out, and who is signed in. The
  //     same handler the worker answers with, so the client runtime has one
  //     code path.
  if (pathname === '/api/session' || pathname.startsWith('/api/session/')) {
    const body = req.method === 'POST' ? await readBody(req) : {}
    const out = await handleSessionRoute(appAuth, {
      method: req.method,
      path: pathname,
      token: tokenOf(req),
      body,
      secure: SECURE,
    }, {
      // Public var or local secret — the same lookup ctx.vars makes.
      googleClientId: config.vars.private.GOOGLE_CLIENT_ID ?? config.vars.public.GOOGLE_CLIENT_ID,
    })
    if (!out) return sendJson(res, 404, { success: false, message: 'Not found' })
    if (out.setCookie) res.setHeader('set-cookie', out.setCookie)
    return sendJson(res, out.status, out.body)
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

  // 5. page addresses — the address is the URL. The canonical form has the
  // trailing slash; the bare form redirects to it; /pages/<name>.html keeps
  // serving via static output below as a permanent alias.
  const pageRoutes = new Map()
  for (const p of manifest.pages ?? []) {
    if (!p || typeof p.name !== 'string') continue
    const raw = typeof p.address === 'string' && p.address !== '' ? p.address : `/${p.name}`
    const norm = raw === '/' ? '/' : raw.replace(/^\/+|\/+$/g, '')
    pageRoutes.set(norm === '/' ? '/' : norm.toLowerCase(), { name: p.name, address: norm, render: p.render ?? 'static' })
  }
  const redirect = (target) => {
    res.writeHead(301, { location: target, 'cache-control': 'no-store' })
    return res.end()
  }
  const serveFile = (rel) => {
    const full = path.join(dist, rel)
    if (!path.resolve(full).startsWith(path.resolve(dist)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      return false
    }
    send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] ?? 'application/octet-stream')
    return true
  }
  const entryName = typeof manifest.entry === 'string' && manifest.entry ? manifest.entry : 'home'
  if (pathname === '/') {
    const entry = [...pageRoutes.values()].find((r) => r.name === entryName) ?? pageRoutes.get('/')
    if (!entry) return send(res, 404, 'no entry page — run `morgana build` first')
    if (entry.address !== '/') return redirect(`/${entry.address}/`)
    const refused = await pageGate(appAuth, gatedPageAt('/'), req)
    if (refused) return refuse(refused)
    if (serveFile('index.html')) return
    return send(res, 404, 'no entry page — run `morgana build` first')
  }
  const bare = pathname.replace(/^\/+|\/+$/g, '')
  let hit = bare === '' ? undefined : pageRoutes.get(bare.toLowerCase())
  if (!hit && bare !== '') {
    // A param page: `/products/42/` → page `products/:id`, served from its
    // `pages/<name>.html` (a param address has no file of its own).
    const found = findPageByPath((manifest.pages ?? []).filter((p) => isParamAddress(p.address)), bare)
    if (found) {
      if (!pathname.endsWith('/')) return redirect(`${pathname}/`)
      const refused = await pageGate(appAuth, found.page.access ? found.page : undefined, req)
      if (refused) return refuse(refused)
      if (serveFile(path.join('pages', `${found.page.name}.html`))) return
    }
  }
  if (hit && hit.address !== '/') {
    if (!pathname.endsWith('/')) return redirect(`/${hit.address}/`)
    const refused = await pageGate(appAuth, gatedPageAt(hit.address), req)
    if (refused) return refuse(refused)
    // A render:'server' page owned by an http route never reaches here — step 1
    // runs the action and answers with the rendered page. Reaching here means
    // no action claimed the address, so the prerender serves as the fallback.
    if (serveFile(path.join(hit.address, 'index.html'))) return
  }

  // 6. static output, with traversal refused. A gated page's HTML is reachable
  //    here too, so the same gate applies — otherwise the alias bypasses it.
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  const gatedFile = gatedFiles.get(rel.toLowerCase())
  if (gatedFile) {
    const refused = await pageGate(appAuth, gatedFile, req)
    if (refused) return refuse(refused)
  }
  const full = path.join(dist, rel)
  if (!path.resolve(full).startsWith(path.resolve(dist)) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(res, 404, 'not found')
  }
  return send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] ?? 'application/octet-stream')
})

// The requested port is a wish, not a promise: a stale instance (or anything
// else on the box) holding it used to kill the boot with EADDRINUSE and leave
// the user staring at a dead terminal. Walk upward from the request instead,
// so `morgana dev` always lands somewhere usable and says where.
const MAX_PORT_TRIES = 10
let listenPort = port
for (let attempt = 0; ; attempt++) {
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(listenPort, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    break
  } catch (err) {
    if (err?.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES - 1) {
      warn(`port ${listenPort} is busy — trying ${listenPort + 1}`)
      listenPort += 1
      continue
    }
    throw err
  }
}
if (listenPort !== port) {
  say(`morgana host on http://localhost:${listenPort}/  (wanted ${port}, entry: ${manifest.entry ?? 'home'})`)
} else {
  say(`morgana host on http://localhost:${listenPort}/  (entry: ${manifest.entry ?? 'home'})`)
}
say(`  pages:   ${(manifest.pages ?? []).map((p) => p.name).join(', ') || '(none)'}`)
say(`  actions: ${enabledActions.join(', ') || '(none)'}`)
say(`  routes:  ${apis.map((a) => `${a.method} ${a.path}`).join(', ') || '(none)'}`)
say(`  stores:  ${stores.map((s) => s.name).join(', ') || '(none)'}`)

// A channel stream is a long-lived response, so without this the process
// refuses to exit with one open — and a shutdown that hangs is worse than a
// clean one, because the next run silently attaches to the old process.
const shutdown = () => {
  channels.closeAll()
  server.close(() => process.exit(0))
  // Do not wait forever on a socket that is not closing politely.
  setTimeout(() => process.exit(0), 500).unref()
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, shutdown)
}

return { server, shutdown, runAction, port: listenPort }
}
