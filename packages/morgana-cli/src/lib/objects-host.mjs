/**
 * Server objects under `morgana dev` — the same model the cloud runs, in
 * process:
 *
 *   one SQLite file per instance      (the cloud: one Durable Object each)
 *   one call at a time per instance  (SerialQueue — the DO's single thread)
 *   alarms on timers, jobs after commit, events to WebSocket subscribers
 *
 * Every rule about what a call means lives in the shared kernel
 * (@morgana/sdk-compile/server-host); this file supplies storage, timers and
 * wiring.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import {
  accessRefusal,
  assertInstanceName,
  callMethod,
  claimJob,
  createInstance,
  dueJobs,
  failJob,
  finishJob,
  destroyInstance,
  ensureSchema,
  Journal,
  makeObjectsApi,
  makeSelfHost,
  matchTriggers,
  parseObjectSelector,
  TRIGGER_JOB_PREFIX,
  triggerPayload,
  nextScheduledAt,
  readInstance,
  readSnapshot,
  RUN_MEMBER_SRC,
  SELF_BUILDER_SRC,
  SerialQueue,
  takeDue,
} from '@morgana/sdk-compile/server-host'

// Not `import … from 'node:sqlite'`: the bundler strips the scheme and the CLI
// dies on `from 'sqlite'`. See the note in store.mjs.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const { __mgSelf, __mgRun } = new Function(`${SELF_BUILDER_SRC}\n${RUN_MEMBER_SRC}\nreturn { __mgSelf, __mgRun }`)()

const camel = (s) => s.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase())

function sqliteAdapter(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  return {
    db,
    exec(sql, ...params) {
      const st = db.prepare(sql)
      return /^\s*(SELECT|WITH)/i.test(sql) ? st.all(...params) : (st.run(...params), [])
    },
    transaction(fn) {
      db.exec('BEGIN')
      try {
        fn()
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}

class HttpError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/**
 * @param {object} opts
 * @param {string} opts.dist
 * @param {string} opts.dataDir
 * @param {(caller: unknown) => Promise<Record<string, unknown>>} opts.makeCtx  the server ctx an object method sees
 * @param {(action: string, params: unknown, caller: unknown) => Promise<unknown>} [opts.runAction]  runs a triggered action
 */
export async function createObjectsHost({ dist, dataDir, makeCtx, runAction }) {
  let metas = []
  try {
    metas = JSON.parse(fs.readFileSync(path.join(dist, 'server', 'objects.json'), 'utf8'))
  } catch {
    metas = []
  }
  // `on: 'object:<type>[/<name>].<event>'` server triggers, from the build.
  let triggers = []
  try {
    triggers = JSON.parse(fs.readFileSync(path.join(dist, 'server', 'triggers.json'), 'utf8'))
      .filter((t) => typeof t.event === 'string' && t.event.startsWith('object:') && t.enabled !== false)
      .map((t) => ({ ...parseObjectSelector(t.event), action: t.run }))
      .filter((t) => t.type)
  } catch {
    triggers = []
  }
  const callOpts = (type) => ({ triggers: triggers.filter((t) => t.type === type) })
  const byType = new Map()
  for (const meta of metas) {
    const mod = await import(`${pathToFileURL(path.join(dist, 'server', 'objects', `${meta.name}.js`)).href}?t=${Date.now()}`)
    byType.set(meta.name, { meta, def: mod.default })
  }
  const root = path.join(dataDir, 'objects')
  const index = sqliteAdapter(path.join(root, '__index.db'))
  index.exec('CREATE TABLE IF NOT EXISTS instances (type TEXT NOT NULL, name TEXT NOT NULL, createdAt INTEGER NOT NULL, PRIMARY KEY (type, name))')

  const open = new Map()
  const queue = new SerialQueue()
  const timers = new Map()
  const subscribers = new Map()
  const key = (type, name) => `${type}\u0000${name}`

  function typeOf(type) {
    const t = byType.get(type)
    if (!t) throw new HttpError(`no server object "${type}"`, 404)
    return t
  }
  function storage(type, name) {
    const k = key(type, name)
    let s = open.get(k)
    if (!s) {
      s = sqliteAdapter(path.join(root, type, `${encodeURIComponent(name).replace(/\*/g, '%2A')}.db`))
      ensureSchema(s, typeOf(type).meta)
      open.set(k, s)
    }
    return s
  }

  const invokeFor = (type, caller) => async ({ kind, name, params, host }) => {
    const { meta, def } = typeOf(type)
    const ctx = await makeCtx(caller)
    return __mgRun(def, kind, name, params, __mgSelf(host, meta, ctx, 'method'))
  }

  function publish(type, name, event, data) {
    const set = subscribers.get(key(type, name))
    if (!set) return
    const frame = JSON.stringify({ event, data })
    for (const ws of set) ws.send(frame)
  }

  function arm(type, name) {
    const k = key(type, name)
    clearTimeout(timers.get(k))
    timers.delete(k)
    const at = nextScheduledAt(storage(type, name))
    if (at === null) return
    // setTimeout caps at ~24.8 days; re-arm in steps for anything later.
    const delay = Math.min(Math.max(0, at - Date.now()), 2 ** 31 - 1)
    timers.set(
      k,
      setTimeout(() => {
        void sweep(type, name).finally(() => arm(type, name))
      }, delay),
    )
  }

  /** Due schedules run as methods (in the queue); due jobs run beside it. */
  async function sweep(type, name) {
    const k = key(type, name)
    await queue
      .run(k, async () => {
        for (const due of takeDue(storage(type, name))) {
          await settle(type, name, await callMethod(storage(type, name), typeOf(type).meta, name, due.method, due.params, null, invokeFor(type, null), undefined, callOpts(type)), null)
        }
      })
      .catch((err) => console.error(`[morgana] ${type} "${name}" scheduled run failed:`, err?.message ?? err))
    const sql = storage(type, name)
    await Promise.all(
      dueJobs(sql).map(async (j) => {
        claimJob(sql, j.id)
        try {
          if (j.job.startsWith(TRIGGER_JOB_PREFIX)) {
            // A trigger queued by a commit: the bound action, as its caller.
            if (runAction) await runAction(j.job.slice(TRIGGER_JOB_PREFIX.length), j.params, j.caller)
          } else await runJob(type, name, j.job, j.params, j.caller)
          finishJob(sql, j.id)
        } catch (err) {
          const dropped = failJob(sql, j.id)
          console.error(`[morgana] job ${type}.${j.job} failed${dropped ? ' — giving up' : ', will retry'}:`, err?.message ?? err)
        }
      }),
    )
  }

  /** A job: reads a snapshot, does slow work, changes state only via self.call. */
  async function runJob(type, name, job, params, caller) {
    const { meta, def } = typeOf(type)
    const sql = storage(type, name)
    const inst = readInstance(sql)
    if (!inst) return
    const journal = new Journal(sql, meta, inst.state)
    const host = makeSelfHost(journal, name, caller, (m, p) => call(type, name, m, p, caller))
    const self = __mgSelf(host, meta, await makeCtx(caller), 'job')
    await def.jobs[job](self, params)
  }

  /** After a commit: events, live state, then wake the sweeper for jobs/alarms. */
  async function settle(type, name, out) {
    for (const e of out.events) publish(type, name, e.event, e.data)
    if (out.stateChanged) publish(type, name, '__state', { state: out.state, computed: out.computed })
    if (out.scheduled || out.jobs.length || out.triggers) arm(type, name)
    return out
  }

  async function create(type, name, init, ifMissing, caller) {
    assertInstanceName(name)
    const { meta } = typeOf(type)
    return queue.run(key(type, name), async () => {
      const sql = storage(type, name)
      if (readInstance(sql)) {
        if (ifMissing) return
        throw new HttpError(`${type} "${name}" already exists`, 409)
      }
      const out = await createInstance(sql, meta, name, init ?? {}, caller, invokeFor(type, caller), callOpts(type))
      index.exec('INSERT OR REPLACE INTO instances (type, name, createdAt) VALUES (?, ?, ?)', type, name, Date.now())
      await settle(type, name, out, caller)
      publish(type, name, 'created', out.state)
      // Subscribers may have connected before the instance existed: give
      // them its first state.
      if (!out.stateChanged) publish(type, name, '__state', readSnapshot(sql, meta))
    })
  }

  async function call(type, name, method, params, caller, onChunk) {
    const { meta } = typeOf(type)
    return queue.run(key(type, name), async () => {
      const out = await callMethod(storage(type, name), meta, name, method, params ?? {}, caller, invokeFor(type, caller), onChunk, callOpts(type))
      await settle(type, name, out, caller)
      return out.result
    })
  }

  async function remove(type, name) {
    const { meta } = typeOf(type)
    return queue.run(key(type, name), async () => {
      const existed = destroyInstance(storage(type, name), meta)
      index.exec('DELETE FROM instances WHERE type = ? AND name = ?', type, name)
      clearTimeout(timers.get(key(type, name)))
      publish(type, name, 'removed', {})
      // The instance's queue is gone with it, so `removed` triggers go now.
      for (const t of matchTriggers(triggers, type, name, 'removed')) {
        if (runAction) {
          void runAction(t.action, { event: triggerPayload(type, name, 'removed', null) }, null).catch((err) =>
            console.error(`[morgana] trigger ${t.action} failed:`, err?.message ?? err),
          )
        }
      }
      return existed
    })
  }

  function list(type, { page = 1, pageSize = 50 } = {}) {
    typeOf(type)
    const size = Math.min(500, Math.max(1, Number(pageSize) || 50))
    const p = Math.max(1, Number(page) || 1)
    const total = Number(index.exec('SELECT COUNT(*) AS n FROM instances WHERE type = ?', type)[0]?.n ?? 0)
    const items = index.exec('SELECT name, createdAt FROM instances WHERE type = ? ORDER BY createdAt, name LIMIT ? OFFSET ?', type, size, (p - 1) * size)
    return { items: items.map((r) => ({ name: r.name, createdAt: Number(r.createdAt) })), total }
  }

  function read(type, name) {
    typeOf(type)
    if (!fs.existsSync(path.join(root, type, `${encodeURIComponent(name).replace(/\*/g, '%2A')}.db`)) && !open.has(key(type, name))) return null
    return readSnapshot(storage(type, name), typeOf(type).meta)
  }

  /** Trusted transport: server actions, methods and jobs (no access checks). */
  function serverTransport(caller) {
    return {
      create: (type, name, init, ifMissing) => create(type, name, init, ifMissing, caller),
      read: async (type, name) => read(type, name),
      call: (type, name, method, params) => call(type, name, method, params, caller),
      stream: (type, name, method, params, onChunk) => call(type, name, method, params, caller, onChunk),
      list: async (type, opts) => list(type, opts),
      remove: (type, name) => remove(type, name),
    }
  }

  const browserMeta = Object.fromEntries(metas.map((m) => [camel(m.name), { name: m.name, methods: m.methods, streaming: m.streaming }]))

  // Re-arm schedules that survived a restart.
  for (const r of index.exec('SELECT type, name FROM instances')) {
    if (byType.has(String(r.type))) arm(String(r.type), String(r.name))
  }

  function check(type, what, user) {
    const refusal = accessRefusal(typeOf(type).meta, what, user)
    if (refusal === 401) throw new HttpError('Sign in required', 401)
    if (refusal === 403) throw new HttpError(`${type}: "${what}" is not allowed from the browser`, 403)
  }

  return {
    metas,
    browserMeta,
    /** ctx.objects for server code running as `caller`. */
    api: (caller) => makeObjectsApi(browserMeta, serverTransport(caller)),
    /** `ctx.object` for an action an object event triggered, else undefined. */
    instanceFor(event, caller) {
      const o = event && typeof event === 'object' ? event.object : null
      if (!o || !o.serverObject || !byType.has(o.type)) return undefined
      return makeObjectsApi(browserMeta, serverTransport(caller))[camel(o.type)].get(String(o.instanceId))
    },
    /**
     * The browser surface — `/api/server-objects/...`. Returns false when the path
     * is not an objects route. Access is checked for every operation.
     */
    async handleHttp(req, res, url, user, { readBody, sendJson: send }) {
      // Every answer reports "handled", so the caller never routes on.
      const sendJson = (...a) => (send(...a), true)
      const m = /^\/api\/server-objects\/([a-z][a-z0-9-]*)(?:\/([^/]+))?(?:\/(call)\/([A-Za-z_][A-Za-z0-9_]*)|\/(get-or-create|live))?\/?$/.exec(url.pathname)
      if (!m) return false
      const [, type, rawName, , method, verb] = m
      const name = rawName === undefined ? undefined : decodeURIComponent(rawName)
      try {
        if (!name) {
          if (req.method === 'GET') {
            check(type, 'list', user)
            return sendJson(res, 200, { success: true, data: list(type, Object.fromEntries(url.searchParams)) })
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            check(type, 'create', user)
            await create(type, String(body.name ?? ''), body.init ?? {}, false, user)
            return sendJson(res, 200, { success: true, data: { name: body.name } })
          }
        } else if (verb === 'get-or-create' && req.method === 'POST') {
          const body = await readBody(req)
          check(type, 'create', user)
          await create(type, name, body.init ?? {}, true, user)
          return sendJson(res, 200, { success: true, data: { name } })
        } else if (method && req.method === 'POST') {
          const body = await readBody(req)
          check(type, method, user)
          const meta = typeOf(type).meta
          if (meta.streaming.includes(method)) {
            res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
            try {
              const result = await call(type, name, method, body.params ?? {}, user, (c) => res.write(`${JSON.stringify({ chunk: c })}\n`))
              res.end(`${JSON.stringify({ result })}\n`)
            } catch (err) {
              res.end(`${JSON.stringify({ error: String(err?.message ?? err), status: err?.status ?? 500 })}\n`)
            }
            return true
          }
          const result = await call(type, name, method, body.params ?? {}, user)
          return sendJson(res, 200, { success: true, data: { result } })
        } else if (!verb && req.method === 'GET') {
          check(type, 'read', user)
          const snap = read(type, name)
          if (!snap) throw new HttpError(`${type} "${name}" does not exist`, 404)
          return sendJson(res, 200, { success: true, data: snap })
        } else if (!verb && req.method === 'DELETE') {
          check(type, 'remove', user)
          return sendJson(res, 200, { success: true, data: { removed: await remove(type, name) } })
        }
        return sendJson(res, 405, { success: false, message: 'Method not allowed' })
      } catch (err) {
        const status = Number(err?.status) >= 400 && Number(err?.status) < 600 ? Number(err.status) : 500
        return sendJson(res, status, { success: false, message: String(err?.message ?? err) })
      }
    },
    /** WebSocket subscribe: `/api/server-objects/<type>/<name>/live`. */
    subscribe(type, name, user, ws) {
      check(type, 'subscribe', user)
      assertInstanceName(name)
      const k = key(type, name)
      let set = subscribers.get(k)
      if (!set) subscribers.set(k, (set = new Set()))
      set.add(ws)
      ws.onClose(() => set.delete(ws))
      const snap = read(type, name)
      if (snap) ws.send(JSON.stringify({ event: '__state', data: snap }))
    },
    close() {
      for (const t of timers.values()) clearTimeout(t)
      for (const s of open.values()) s.db.close()
      index.db.close()
    },
  }
}
