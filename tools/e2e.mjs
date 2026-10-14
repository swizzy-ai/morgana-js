#!/usr/bin/env node
/**
 * Host parity suite — one list of full-stack scenarios, run against
 * `morgana dev` and against a real worker, so "works locally" and "works
 * deployed" are the same claim.
 *
 *   node tools/e2e.mjs                       # morgana dev (builds the fixture)
 *   node tools/e2e.mjs --worker http://127.0.0.1:8787 --token <t> --project <id>
 *                                            # deploy the fixture to a worker
 *                                            # and run through its project host
 *   --browser <chrome.exe>                   # also drive the client ctx.auth in a real browser
 *
 * The worker run needs APPS_DOMAIN set on the worker (the project host is
 * where sessions live) and SECRETS_KEY (the email scenario sets secrets).
 * `wrangler dev --var APPS_DOMAIN:apps.test --var SECRETS_KEY:dev` works.
 *
 * Every scenario here exists because the two hosts once disagreed on it.
 */
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = path.join(root, 'examples', 'fullstack-e2e')
const cli = path.join(root, 'packages', 'morgana-cli', 'bin', 'morgana.mjs')

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const workerUrl = flag('worker')
const browserPath = flag('browser')

const morgana = (args, opts = {}) =>
  execFileSync(process.execPath, [cli, ...args], { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })

// ── HTTP with a Host header and a cookie jar ────────────────────────────────

function client(base, hostHeader) {
  const jar = new Map()
  let runtimeKey = ''
  const request = (method, p, { body, headers = {}, raw = false } = {}) =>
    new Promise((resolve, reject) => {
      const url = new URL(p, base)
      const lib = url.protocol === 'https:' ? https : http
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
      const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
      const req = lib.request(
        url,
        {
          method,
          headers: {
            ...(hostHeader ? { host: hostHeader } : {}),
            ...(cookie ? { cookie } : {}),
            ...(runtimeKey ? { 'x-morgana-runtime': runtimeKey } : {}),
            ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
        },
        (res) => {
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            for (const sc of res.headers['set-cookie'] ?? []) {
              const [pair, ...attrs] = sc.split(';')
              const eq = pair.indexOf('=')
              const name = pair.slice(0, eq).trim()
              const value = pair.slice(eq + 1).trim()
              if (attrs.some((a) => /max-age=0\b/i.test(a.trim())) || !value) jar.delete(name)
              else jar.set(name, value)
            }
            let json
            if (!raw) {
              try {
                json = JSON.parse(data)
              } catch {}
            }
            resolve({ status: res.statusCode, headers: res.headers, text: data, json })
          })
        },
      )
      req.on('error', reject)
      if (payload !== undefined) req.write(payload)
      req.end()
    })
  return {
    jar,
    request,
    get: (p) => request('GET', p, { raw: true }),
    /** GET (or POST with `opts.body`) recording when the first body chunk arrived. */
    timed: (p, opts = {}) =>
      new Promise((resolve, reject) => {
        const url = new URL(p, base)
        const lib = url.protocol === 'https:' ? https : http
        const t0 = Date.now()
        let first = -1
        let text = ''
        const payload = opts.body === undefined ? null : JSON.stringify(opts.body)
        const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
        const headers = {
          ...(hostHeader ? { host: hostHeader } : {}),
          'accept-encoding': 'identity',
          ...(cookie ? { cookie } : {}),
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        }
        const req = lib.request(url, { method: payload ? 'POST' : 'GET', headers }, (res) => {
          res.setEncoding('utf8')
          res.on('data', (d) => {
            if (first < 0) first = Date.now() - t0
            text += d
          })
          res.on('end', () => resolve({ status: res.statusCode, text, firstChunkMs: first, totalMs: Date.now() - t0 }))
        })
        req.on('error', reject)
        req.end(payload ?? undefined)
      }),
    post: (p, body) => request('POST', p, { body: body ?? {} }),
    run: (action, params = {}) => request('POST', `/api/actions/${action}/run`, { body: { params } }),
    async loadRuntimeKey() {
      const home = await request('GET', '/', { raw: true })
      runtimeKey = /name="morgana-runtime-key" content="([^"]*)"/.exec(home.text)?.[1] ?? ''
    },
  }
}

// ── Scenarios ───────────────────────────────────────────────────────────────

const results = []
async function check(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ok    ${name}`)
  } catch (err) {
    results.push({ name, ok: false, err })
    console.log(`  FAIL  ${name}\n        ${err?.message ?? err}`)
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function scenarios(c, label) {
  console.log(`\n${label}`)
  await c.loadRuntimeKey()
  const email = `e2e-${Date.now()}@x.com`
  const password = 'e2e-password-1'

  await check('home page serves', async () => {
    const r = await c.get('/')
    expect(r.status === 200 && r.text.includes('public home'), `status ${r.status}`)
  })
  await check('gated page redirects a signed-out visitor with next=', async () => {
    const r = await c.get('/dashboard/')
    expect(r.status === 302, `status ${r.status}`)
    expect(String(r.headers.location).endsWith('/login/?next=%2Fdashboard%2F'), `location ${r.headers.location}`)
  })
  await check('gated page html is not reachable through the alias', async () => {
    const r = await c.get('/pages/dashboard.html')
    expect(r.status !== 200 || !r.text.includes('SECRET DASHBOARD'), 'alias served the gated page')
  })
  await check('ctx.auth.require() refuses with 401', async () => {
    const r = await c.run('whoami')
    expect(r.status === 401, `status ${r.status}`)
  })
  await check('sign up sets an HttpOnly session cookie', async () => {
    const r = await c.post('/api/session/signup', { email, password })
    expect(r.status === 200, `status ${r.status} ${r.text}`)
    const sc = (r.headers['set-cookie'] ?? []).join(';')
    expect(/mg_session=/.test(sc) && /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), `set-cookie ${sc}`)
  })
  await check('the session names the user', async () => {
    const r = await c.request('GET', '/api/session')
    expect(r.json?.data?.user?.email === email, r.text)
  })
  await check('server actions see the signed-in user', async () => {
    const r = await c.run('whoami')
    expect(r.json?.data?.result?.email === email, r.text)
  })
  await check('gated page serves once signed in', async () => {
    const r = await c.get('/dashboard/')
    expect(r.status === 200 && r.text.includes('SECRET DASHBOARD'), `status ${r.status}`)
  })
  await check('role-gated page: 403, then 200 after the role is granted', async () => {
    const before = await c.get('/admin/')
    expect(before.status === 403, `before ${before.status}`)
    await c.run('promote')
    const after = await c.get('/admin/')
    expect(after.status === 200 && after.text.includes('ADMIN ONLY'), `after ${after.status}`)
  })
  await check('ctx.server.email sends with secrets from ctx.vars', async () => {
    const r = await c.run('welcome')
    const res = r.json?.data?.result
    expect(res?.sent?.provider === 'console' && res?.from === 'E2E <e2e@test.dev>', r.text)
  })
  await check('ctx.server.files write/read/list, traversal refused', async () => {
    const r = await c.run('filesdemo')
    const res = r.json?.data?.result
    expect(res?.text === 'hello r2', r.text)
    expect(Array.isArray(res?.names) && res.names.includes('reports/a.txt'), r.text)
    expect(/illegal|escapes/.test(String(res?.traversal)), `traversal: ${res?.traversal}`)
  })
  await check('collections: set/get by id upserts, undeclared columns refused', async () => {
    const r = await c.run('notesRoundTrip')
    const res = r.json?.data?.result
    expect(res?.text === 'first, edited', r.text)
    expect(JSON.stringify(res?.tags) === '["a"]', `tags ${JSON.stringify(res?.tags)}`)
    expect(res?.count >= 2, `count ${res?.count} — a set() must never wipe the collection`)
    expect(/colour/.test(String(res?.undeclared)), `undeclared: ${res?.undeclared}`)
  })
  await check('password reset: one-time token, null for unknown email', async () => {
    const r = await c.run('resetDemo')
    const res = r.json?.data?.result
    expect(res?.verified === true && res?.missing === null, r.text)
    expect(/invalid or has expired/.test(String(res?.reused)), `reused: ${res?.reused}`)
  })
  await check('ctx.server.respond shapes the HTTP response', async () => {
    const r = await c.request('POST', '/hooks/test', { body: {}, raw: true })
    expect(r.status === 202 && r.text === 'accepted', `status ${r.status} body ${JSON.stringify(r.text)}`)
    expect(String(r.headers['content-type']).startsWith('text/plain'), `content-type ${r.headers['content-type']}`)
  })
  await check('ctx.server.response.stream sends chunks as they are produced', async () => {
    const r = await c.timed('/stream/demo')
    expect(r.status === 200, `status ${r.status}`)
    expect(r.text === 'one\n{"n":2}\nthree\n', `body ${JSON.stringify(r.text)}`)
    expect(r.firstChunkMs < r.totalMs - 500, `first chunk at ${r.firstChunkMs}ms of ${r.totalMs}ms — buffered, not streamed`)
  })
  await check('param page: /products/42/', async () => {
    const r = await c.get('/products/42/')
    expect(r.status === 200 && r.text.includes('PRODUCT TEMPLATE'), `status ${r.status}`)
  })
  await check('literal page beats param page', async () => {
    const r = await c.get('/products/new/')
    expect(r.text.includes('NEW PRODUCT FORM'), 'products/new served the param page')
  })
  await check('param page without trailing slash redirects', async () => {
    const r = await c.get('/products/42')
    expect(r.status === 301 && String(r.headers.location).endsWith('/products/42/'), `${r.status} ${r.headers.location}`)
  })
  await check('server-rendered param page gets params and the user', async () => {
    const r = await c.get('/orders/7/')
    expect(r.status === 200 && r.text.includes(`ORDER 7 for ${email}`), `status ${r.status}`)
  })
  // ── server objects ────────────────────────────────────────────────────────
  const room = `room-${Date.now()}`
  const obj = (p = '') => `/api/objects/chat-room${p}`
  await check('objects: create by name; a second create is refused', async () => {
    const a = await c.request('POST', obj(), { body: { name: room, init: { title: 'E2E' } } })
    expect(a.status === 200, a.text)
    const b = await c.request('POST', obj(), { body: { name: room, init: {} } })
    expect(b.status === 409, `duplicate create: ${b.status}`)
  })
  await check('objects: state plus computed, as committed', async () => {
    const r = await c.request('GET', obj(`/${room}`))
    expect(r.json?.data?.state?.title === 'E2E' && r.json?.data?.computed?.label === 'E2E (0)', r.text)
  })
  await check('objects: 50 concurrent calls on one instance lose no update', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => c.request('POST', obj(`/${room}/call/bump`), { body: {} })))
    expect(results.every((r) => r.status === 200), `statuses ${[...new Set(results.map((r) => r.status))]}`)
    const seen = results.map((r) => r.json?.data?.result).sort((x, y) => x - y)
    expect(seen.join() === Array.from({ length: 50 }, (_, i) => i + 1).join(), `results ${seen.join()}`)
    const r = await c.request('GET', obj(`/${room}`))
    expect(r.json?.data?.state?.count === 50, `count ${r.json?.data?.state?.count}`)
  })
  await check('objects: access — sign-in, role and server-only methods refused from the browser', async () => {
    const jar = new Map(c.jar)
    c.jar.clear()
    const anon = await c.request('POST', obj(`/${room}/call/post`), { body: { params: { text: 'x' } } })
    expect(anon.status === 401, `anon post ${anon.status}`)
    const serverOnly = await c.request('POST', obj(`/${room}/call/remindSoon`), { body: { params: { ms: 10 } } })
    expect(serverOnly.status === 403, `server-only ${serverOnly.status}`)
    for (const [k, v] of jar) c.jar.set(k, v)
    const member = await c.request('POST', obj(`/${room}/call/post`), { body: { params: { text: 'member says hi' } } })
    expect(member.status === 200 && member.json?.data?.result?.text === 'member says hi', member.text)
  })
  await check('objects: a streaming method streams, then commits its result', async () => {
    const r = await c.timed(obj(`/${room}/call/answer`), { body: { params: { prompt: 'e2e' } } })
    const lines = r.text.trim().split('\n').map((l) => JSON.parse(l))
    const chunks = lines.filter((l) => 'chunk' in l).map((l) => l.chunk).join('')
    expect(chunks === 'you asked: e2e ', `chunks ${JSON.stringify(chunks)}`)
    expect(lines.at(-1)?.result?.saved, `final ${JSON.stringify(lines.at(-1))}`)
    expect(r.firstChunkMs < r.totalMs - 200, `first chunk ${r.firstChunkMs}ms of ${r.totalMs}ms — buffered`)
    const h = await c.request('POST', obj(`/${room}/call/history`), { body: {} })
    expect((h.json?.data?.result ?? []).some((m) => m.user === 'ai'), 'answer not saved')
  })
  await check('objects: server code is trusted and fully featured (ctx.objects)', async () => {
    const r = await c.run('objectsDemo', { room: `srv-${room}` })
    const res = r.json?.data?.result
    expect(res?.msg === 'from an action' && res?.chunks === 4 && res?.saved && res?.count === 2 && res?.listed, r.text)
  })
  await check('objects: alarms run a method later', async () => {
    await c.run('objectsDemo', { room: `alarm-${room}`, op: 'remind', ms: 300 })
    await new Promise((r) => setTimeout(r, 2500))
    const s = await c.run('objectsDemo', { room: `alarm-${room}`, op: 'state' })
    expect(s.json?.data?.result?.reminders === 1, s.text)
  })
  await check('objects: background jobs run after commit and change state through methods', async () => {
    await c.run('objectsDemo', { room: `job-${room}`, op: 'summarize' })
    await new Promise((r) => setTimeout(r, 1500))
    const s = await c.run('objectsDemo', { room: `job-${room}`, op: 'state' })
    expect(s.json?.data?.result?.summaries === 1, s.text)
  })
  await check('objects: list and remove', async () => {
    const l = await c.request('GET', obj())
    expect((l.json?.data?.items ?? []).some((i) => i.name === room), l.text)
    const missing = await c.request('GET', obj('/no-such-room'))
    expect(missing.status === 404, `missing ${missing.status}`)
  })

  await check('unknown path is a 404', async () => {
    const r = await c.get('/nothing/here/')
    expect(r.status === 404, `status ${r.status}`)
  })
  await check('sign out clears the cookie and closes gated pages', async () => {
    await c.post('/api/session/signout')
    const r = await c.get('/dashboard/')
    expect(r.status === 302, `status ${r.status}`)
  })
}

async function browserScenario(base, hostRule) {
  if (!browserPath) return
  console.log('\nbrowser')
  const require = createRequire(path.join(root, 'package.json'))
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({
    executablePath: browserPath,
    args: hostRule ? [`--host-resolver-rules=${hostRule}`] : [],
  })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await check('client ctx.auth.signUp → server sees the same user', async () => {
      await page.goto(base + '/')
      await page.click('[data-entity="signup-btn"]')
      await page.waitForFunction(() => document.querySelector('[data-entity="who"]')?.textContent?.includes('server sees'), null, { timeout: 15000 })
      const who = await page.textContent('[data-entity="who"]')
      expect(/signed in as (\S+) \/ server sees \1/.test(who ?? ''), who ?? '')
    })
    await check('the session cookie is invisible to page script', async () => {
      expect(!(await page.evaluate(() => document.cookie.includes('mg_session'))), 'document.cookie exposes the session')
    })
    await check('objects in the browser: bound state, method call, streamed answer, live events', async () => {
      await page.goto(base + '/room/')
      await page.waitForFunction(() => document.querySelector('[data-entity="room-title"]')?.textContent === 'Lobby', null, { timeout: 15000 })
      const before = (await page.textContent('[data-entity="room-label"]')) ?? ''
      const n = Number(/\((\d+)\)/.exec(before)?.[1] ?? -1)
      await page.click('[data-entity="room-bump"]')
      // The binding follows the object's live state over its WebSocket.
      await page.waitForFunction((want) => document.querySelector('[data-entity="room-label"]')?.textContent === `Lobby (${want})`, n + 1, { timeout: 15000 })
      await page.click('[data-entity="room-ask"]')
      await page.waitForFunction(() => (document.querySelector('[data-entity="room-answer"]')?.textContent ?? '').endsWith('|done'), null, { timeout: 15000 })
      const answer = await page.textContent('[data-entity="room-answer"]')
      expect(answer === 'you asked: browser |done', `answer ${answer}`)
      // The method emitted 'message'; the page's on('message') received it.
      await page.waitForFunction(() => (document.querySelector('[data-entity="room-events"]')?.textContent ?? '').includes('[you asked: browser]'), null, { timeout: 15000 })
    })
    await check('no page errors', async () => expect(!errors.length, errors.join('; ')))
  } finally {
    await browser.close()
  }
}

// ── Hosts ───────────────────────────────────────────────────────────────────

async function runDev() {
  morgana(['build'])
  morgana(['secrets', 'set', 'EMAIL_PROVIDER', 'console', '--local'])
  morgana(['secrets', 'set', 'EMAIL_FROM', 'E2E <e2e@test.dev>', '--local'])
  const port = 4300 + Math.floor(Math.random() * 600)
  const child = spawn(process.execPath, [cli, 'dev', '--port', String(port)], {
    cwd: fixture,
    env: { ...process.env, MORGANA_DATA: path.join(fixture, '.data', `run-${Date.now()}`) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', (d) => (out += d))
  child.stderr.on('data', (d) => (out += d))
  const base = `http://localhost:${port}`
  try {
    for (let i = 0; i < 60; i++) {
      const up = await new Promise((r) => http.get(base + '/', (res) => (res.resume(), r(true))).on('error', () => r(false)))
      if (up) break
      await new Promise((r) => setTimeout(r, 500))
    }
    await scenarios(client(base), `morgana dev — ${base}`)
    await browserScenario(base)
  } finally {
    child.kill()
    if (results.some((r) => !r.ok)) console.log(`\n--- dev host output ---\n${out.slice(-3000)}`)
  }
}

async function runWorker() {
  const token = flag('token')
  const project = flag('project')
  if (!token || !project) throw new Error('--worker needs --token and --project')
  const target = ['--url', workerUrl, '--project', project, '--token', token]
  morgana(['secrets', 'set', 'EMAIL_PROVIDER', 'console', ...target])
  morgana(['secrets', 'set', 'EMAIL_FROM', 'E2E <e2e@test.dev>', ...target])
  const deployOut = morgana(['deploy', ...target, '--no-login'])
  // The project's own URL is printed on its own line after "deployed <id>".
  const hostUrl = deployOut
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^https?:\/\/\S+\/$/.test(l) && !l.includes('/apps/'))
  if (!hostUrl || hostUrl.includes('/apps/')) throw new Error(`no project host in deploy output — is APPS_DOMAIN set?\n${deployOut}`)
  const hostname = new URL(hostUrl).host
  // Give the worker's per-isolate route-table cache time to see the new deploy.
  await new Promise((r) => setTimeout(r, 16000))
  await scenarios(client(workerUrl, hostname), `worker — ${workerUrl} as ${hostname}`)
  const w = new URL(workerUrl)
  await browserScenario(`http://${hostname}:${w.port || 80}`, `MAP ${hostname} ${w.hostname}`)
}

try {
  if (workerUrl) await runWorker()
  else await runDev()
} catch (err) {
  console.error(err?.stderr?.toString?.() || err?.message || err)
  process.exitCode = 1
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
