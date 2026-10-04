/**
 * Host context — the surface a compiled server action actually runs against.
 *
 * Built from dist/server/stores.json plus a SQLite file, so the collections an
 * author declared in a compile action are the collections that exist at
 * runtime. Everything here is a real implementation: nothing throws
 * "runtime-only", because the runtime is exactly where these run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { StoreEngine } from './store.mjs'
import { ChannelHub } from './channels.mjs'
import { buildAi } from './ai.mjs'

/** @typedef {import('./store.mjs').StoreEngine} StoreEngine */

const CONTENT_TYPES = {
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function contentTypeFor(p) {
  return CONTENT_TYPES[path.extname(p).toLowerCase()] ?? 'application/octet-stream'
}

/** Reject traversal before anything touches the filesystem. */
function safeJoin(root, key) {
  if (typeof key !== 'string' || key === '') throw new Error('a file path is required')
  const full = path.resolve(root, key)
  const base = path.resolve(root)
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`file path "${key}" escapes the files root`)
  }
  return full
}

/**
 * Files — a writable counterpart to read-only build assets. Metadata lives in
 * SQLite so a listing survives a restart; bytes live on disk.
 */
class Files {
  constructor(root, engine) {
    this.root = root
    this.engine = engine
    fs.mkdirSync(root, { recursive: true })
    engine.create('__files', { columns: [{ name: 'path', type: 'string' }, { name: 'size', type: 'number' }] })
  }

  #full(key) {
    return safeJoin(this.root, key)
  }

  read(key) {
    const full = this.#full(key)
    if (!fs.existsSync(full)) return null
    return fs.readFileSync(full)
  }

  write(key, data, contentType) {
    const full = this.#full(key)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data ?? [])
    fs.writeFileSync(full, buf)
    const now = Date.now()
    const meta = {
      id: key,
      name: path.basename(key),
      path: key,
      contentType: contentType ?? contentTypeFor(key),
      size: buf.length,
      updatedAt: now,
    }
    // One record per path — a write is a create-or-overwrite.
    this.engine.set('__files', key, meta)
    return meta
  }

  update(key, data, contentType) {
    return this.write(key, data, contentType)
  }

  remove(key) {
    const full = this.#full(key)
    const existed = fs.existsSync(full)
    if (existed) fs.rmSync(full, { recursive: true, force: true })
    this.engine.remove('__files', key)
    return existed
  }

  list(prefix) {
    const all = this.engine.all('__files')
    return prefix ? all.filter((m) => m.path.startsWith(prefix)) : all
  }

  stat(key) {
    try {
      return this.engine.get('__files', key)
    } catch {
      return null
    }
  }
}

/**
 * Queue — in-process FIFO, drained on a microtask. Enough for the
 * fire-and-forget work an action kicks off; a hosted runtime would swap the
 * drain for a Durable Object alarm, but the surface an author sees is the same.
 */
class Queue {
  constructor(handler) {
    this.handler = handler
    this.pending = []
  }

  push(name, payload) {
    const item = {
      id: `q_${Date.now().toString(36)}_${(this.pending.length + 1).toString(36)}`,
      name,
      payload: payload ?? {},
      at: Date.now(),
    }
    this.pending.push(item)
    queueMicrotask(() => this.#drain())
    return item
  }

  async #drain() {
    if (!this.handler) return
    const items = this.pending.splice(0, this.pending.length)
    for (const item of items) {
      try {
        await this.handler(item.name, item.payload)
      } catch (err) {
        // A failing job must not take the request down with it.
        console.error(`[morgana] queue job "${item.name}" failed:`, err?.message ?? err)
      }
    }
  }
}

/**
 * Build the `ctx` a compiled action receives.
 *
 * @param {object} opts
 * @param {StoreEngine} opts.store
 * @param {string} opts.filesDir
 * @param {Record<string, unknown>} opts.args      parsed body / query
 * @param {Record<string, unknown>} opts.config    morgana.config vars
 * @param {string[]} opts.declaredStores           from dist/server/stores.json
 * @param {string[]} opts.enabledActions           action names this host may run
 * @param {(name: string) => Promise<unknown>} [opts.runAction] action → action
 * @param {string} [opts.base]                     public base URL for assets
 * @param {string} [opts.dataDir]                  durable root (agents.json lives here)
 */
/**
 * Builds the action context for one invocation.
 *
 * Async because declaring the project's stores reaches storage, and storage is
 * not memory. The `collections`/`files` surfaces below are async for the same
 * reason — the SDK contract says every method on them returns a promise, and a
 * host that returned plain values would let an action work here and fail
 * anywhere else.
 */
export async function makeHostContext(opts) {
  const { store, filesDir, args = {}, config = {}, declaredStores = [], enabledActions = [] } = opts
  // The channel hub. Supplied by the host rather than created here, because the
  // SSE route in `server.mjs` reads from the same instance — two hubs would mean
  // a publish that nobody is listening to, which is the bug this replaces.
  const channels = opts.channels ?? new ChannelHub()
  const runAction = opts.runAction ?? (async () => {
    throw new Error('no action dispatcher is wired into this host')
  })

  for (const name of declaredStores) {
    if (!(await store.shape(name))) await store.create(name, { columns: [] })
  }

  const files = new Files(filesDir, store)
  const queue = new Queue(async (name, payload) => {
    await runAction(name, payload)
  })
  const logs = []

  const log = (...parts) => {
    logs.push(parts.map(String).join(' '))
  }
  log.info = log
  log.warn = (...p) => logs.push(['warn', ...p.map(String)].join(' '))
  log.error = (...p) => logs.push(['error', ...p.map(String)].join(' '))

  /**
   * The `collections` handle.
   *
   * Async throughout, matching the SDK contract exactly. `node:sqlite` is
   * synchronous under the hood, but these return promises deliberately: the
   * point is that an action written against this handle is written against
   * *the contract*, not against the shape of one particular engine. An action
   * that forgets to `await` now fails here, loudly, instead of working locally
   * and throwing somewhere else.
   */
  const collections = {
    get: async (name, id) => store.get(name, id),
    set: async (name, id, data) => store.set(name, id, data),
    add: async (name, data) => store.add(name, data),
    insert: async (name, record) => store.insert(name, record),
    update: async (name, id, data) => store.update(name, id, data),
    remove: async (name, id) => store.remove(name, id),
    delete: async (name, id) => store.remove(name, id),
    count: async (name, o) => store.count(name, o),
    find: async (name, predicate) => store.find(name, predicate),
    query: async (name, o) => store.query(name, o),
    // Declared at compile time into stores.json; re-declaring is a no-op here.
    create: async (name, shape) => (await store.shape(name)) || (await store.create(name, shape)),
    shape: async (name) => store.shape(name),
  }

  /**
   * `ctx.ai` — generation, agents and tools.
   *
   * Built after `log` so an agent event can be logged, and before the context so
   * the context can carry it. The data directory is derived from `filesDir` when
   * the caller did not pass one: both callers pass `<data>/files`, and deriving
   * keeps a second parameter out of two call sites for no reason.
   */
  const ai = await buildAi({
    enabledActions,
    runAction,
    dataDir: opts.dataDir ?? path.join(filesDir, '..'),
    channels,
    log,
  })

  const ctx = {
    args,
    ai,
    log,
    vars: { ...(config.vars?.public ?? {}), ...(config.vars?.private ?? {}) },
    events: {
      emit: (event, payload) => log('emit', event, payload ?? ''),
      // A real publish, not a log line. It lands in the channel hub, which is
      // what `GET /api/events?channel=…` streams from — so `ctx.events.publish`
      // from a server action reaches every open page, the same as deployed.
      // It used to only write to the action log, which made a channel look like
      // it worked while nothing could possibly hear it.
      publish: async (channel, payload) => channels.publish(channel, payload),
      // Deliberately still a no-op on this lane: an action invocation is
      // short-lived, so a subscription made inside one cannot outlive it. That
      // is a property of the lane, not a gap — cross-invocation listening is
      // expressed with `config.on` triggers, which are deployed and durable.
      subscribe: () => () => {},
      on: () => () => {},
      channels: {
        list: async () => channels.list(),
        create: async (name, scope = 'public') => {
          const c = channels.channel(name, scope)
          if (!c) throw new Error(`invalid channel name: ${name}`)
          return { name: c.name, scope: c.scope, subscribers: c.presence }
        },
        history: async (name, limit) => channels.history(name, limit),
      },
    },
    assets: {
      url: (name) => `${opts.base ?? ''}/assets/${name}`,
      get: (name) => {
        const p = path.join(filesDir, '..', 'assets', String(name))
        return fs.existsSync(p) ? fs.readFileSync(p) : null
      },
    },
    actions: {
      run: async (name, params) => {
        if (!enabledActions.includes(name)) {
          throw new Error(`action "${name}" is not deployed on this host`)
        }
        return runAction(name, params ?? {})
      },
    },
    server: {
      env: process.env,
      request: {
        method: 'INVOKE',
        url: '/',
        path: '/',
        query: {},
        headers: {},
        body: args,
      },
      respond: () => {},
      response: {
        status: () => {},
        setHeader: () => {},
        respond: () => {},
        stream: () => {},
      },
      collections,
      // Async for the same reason as `collections`: the SDK says promises, so
      // this host says promises.
      files: {
        read: async (p) => files.read(p),
        write: async (p, data, ct) => files.write(p, data, ct),
        update: async (p, data, ct) => files.update(p, data, ct),
        remove: async (p) => files.remove(p),
        list: async (prefix) => files.list(prefix),
        stat: async (p) => files.stat(p),
      },
      queue: {
        push: async (name, payload) => queue.push(name, payload),
      },
    },
  }

  return { ctx, logs, files, queue, collections }
}
