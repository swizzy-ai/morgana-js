/**
 * `ctx.objects` — built from object metadata plus a transport. The same code
 * makes the proxies for server actions (dev: in-process; cloud: Durable
 * Object calls) and for the browser (HTTP + WebSocket); only the transport
 * differs, so a proxy behaves identically everywhere.
 */

export interface ObjectsMeta {
  /** camelCase key → type name and member names. */
  [key: string]: { name: string; methods: string[]; streaming: string[] }
}

export interface Snapshot {
  state: Record<string, unknown>
  computed: Record<string, unknown>
}

export interface ObjectsTransport {
  create(type: string, name: string, init: Record<string, unknown>, ifMissing: boolean): Promise<void>
  read(type: string, name: string): Promise<Snapshot | null>
  call(type: string, name: string, method: string, params: Record<string, unknown>): Promise<unknown>
  /** Streaming method: chunks to `onChunk` as they arrive, resolves with the return value. */
  stream(type: string, name: string, method: string, params: Record<string, unknown>, onChunk: (c: unknown) => void): Promise<unknown>
  list(type: string, opts: { page?: number; pageSize?: number }): Promise<{ items: Array<{ name: string; createdAt: number }>; total: number }>
  remove(type: string, name: string): Promise<boolean>
  /** Browser only: live events (incl. `__state`). Returns unsubscribe. */
  subscribe?(type: string, name: string, listener: (event: string, data: unknown) => void): () => void
}

/** An async-iterable over pushed chunks, with the final value as `result`. */
function streamCall(run: (onChunk: (c: unknown) => void) => Promise<unknown>): AsyncIterable<unknown> & { result: Promise<unknown> } {
  const queue: unknown[] = []
  let waiting: ((v: IteratorResult<unknown>) => void) | null = null
  let failed: ((e: unknown) => void) | null = null
  let done = false
  let error: unknown = null
  const result = run((c) => {
    if (waiting) {
      const w = waiting
      waiting = null
      failed = null
      w({ value: c, done: false })
    } else queue.push(c)
  }).then(
    (v) => {
      done = true
      if (waiting) waiting({ value: undefined, done: true })
      return v
    },
    (e) => {
      done = true
      error = e
      if (failed) failed(e)
      throw e
    },
  )
  // Iterating is optional; an unobserved failure still surfaces on .result.
  result.catch(() => {})
  return {
    result,
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<unknown>>((resolve, reject) => {
            if (queue.length) return resolve({ value: queue.shift(), done: false })
            if (error) return reject(error)
            if (done) return resolve({ value: undefined, done: true })
            waiting = resolve
            failed = reject
          }),
      }
    },
  }
}

const RESERVED = new Set(['name', 'type', 'state', 'on', 'watch', 'remove', 'then'])

export function makeInstanceProxy(meta: ObjectsMeta[string], name: string, t: ObjectsTransport): Record<string, unknown> {
  const proxy: Record<string, unknown> = {
    name,
    type: meta.name,
    state: async () => {
      const s = await t.read(meta.name, name)
      if (!s) throw Object.assign(new Error(`${meta.name} "${name}" does not exist`), { status: 404 })
      return { ...s.state, ...s.computed }
    },
    on: (event: string, listener: (data: unknown) => void) => {
      if (!t.subscribe) throw new Error('object.on() is for the browser; on the server, react in the method that emits')
      return t.subscribe(meta.name, name, (e, d) => {
        if (e === event) listener(d)
      })
    },
    watch: (listener: (state: Record<string, unknown>) => void) => {
      if (!t.subscribe) throw new Error('object.watch() is for the browser')
      return t.subscribe(meta.name, name, (e, d) => {
        if (e === '__state') {
          const s = d as Snapshot
          listener({ ...s.state, ...s.computed })
        }
      })
    },
    remove: () => t.remove(meta.name, name),
  }
  for (const m of meta.methods) {
    if (RESERVED.has(m)) continue
    proxy[m] = meta.streaming.includes(m)
      ? (params?: Record<string, unknown>) => streamCall((onChunk) => t.stream(meta.name, name, m, params ?? {}, onChunk))
      : (params?: Record<string, unknown>) => t.call(meta.name, name, m, params ?? {})
  }
  return proxy
}

export function makeObjectsApi(metas: ObjectsMeta, t: ObjectsTransport): Record<string, unknown> {
  const api: Record<string, unknown> = {}
  for (const [key, meta] of Object.entries(metas)) {
    const get = (name: string) => makeInstanceProxy(meta, String(name), t)
    api[key] = {
      get,
      create: async (name: string, init?: Record<string, unknown>) => {
        await t.create(meta.name, String(name), init ?? {}, false)
        return get(name)
      },
      getOrCreate: async (name: string, init?: Record<string, unknown>) => {
        await t.create(meta.name, String(name), init ?? {}, true)
        return get(name)
      },
      exists: async (name: string) => (await t.read(meta.name, String(name))) !== null,
      list: (opts?: { page?: number; pageSize?: number }) => t.list(meta.name, opts ?? {}),
      remove: (name: string) => t.remove(meta.name, String(name)),
    }
  }
  return api
}
