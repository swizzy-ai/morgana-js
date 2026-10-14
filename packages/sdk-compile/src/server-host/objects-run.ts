/**
 * Server objects — running calls. Builds a method's `self`, executes a call
 * as one transaction, creates and destroys instances, and serializes calls
 * per instance. Shared by both hosts; see objects.ts for the storage model.
 */
import type { AuthUser } from '@morgana/sdk'
import {
  ensureSchema,
  Journal,
  readInstance,
  type ObjectMeta,
  type ObjectSql,
  type PendingEvent,
  type PendingJob,
  type QueryOptions,
} from './objects'

// ── `self`: one builder, evaluated by both hosts ───────────────────────────

/**
 * Flat host functions a method's `self` is built from. Flat because the cloud
 * sandbox only reliably carries first-level functions across its bridge; the
 * same shape serves the dev host so `self` is built by the same code.
 */
export interface SelfHost {
  id: string
  caller: AuthUser | null
  stateGet(): Record<string, unknown>
  set(patch: Record<string, unknown>): Record<string, unknown>
  dbGet(c: string, id: string): unknown
  dbAdd(c: string, r: Record<string, unknown>): unknown
  dbSet(c: string, id: string, r: Record<string, unknown>): unknown
  dbUpdate(c: string, id: string, p: Record<string, unknown>): unknown
  dbRemove(c: string, id: string): boolean
  dbQuery(c: string, o: QueryOptions): unknown
  dbCount(c: string, w?: Record<string, unknown>): number
  emit(event: string, data: unknown): void
  schedule(when: number | string, method: string, params?: Record<string, unknown>): void
  defer(job: string, params?: Record<string, unknown>): void
  /** Jobs only: run a method of this instance (serialized, transactional). */
  callMethod(method: string, params?: Record<string, unknown>): Promise<unknown>
  /** A streaming method's yield, sent to the caller as it happens. */
  chunk(value: unknown): Promise<void>
}

/**
 * JavaScript source of `__mgSelf(h, meta, ctx, kind)`. Plain ES2020, no
 * imports — evaluated with `new Function` under `morgana dev` and inlined
 * into the sandbox module in the cloud. One text, so `self` cannot differ by
 * host.
 */
export const SELF_BUILDER_SRC = `function __mgSelf(h, meta, ctx, kind) {
  var db = {};
  Object.keys(meta.collections || {}).forEach(function (c) {
    db[c] = {
      get: function (id) { return h.dbGet(c, String(id)); },
      add: function (r) { return h.dbAdd(c, r || {}); },
      set: function (id, r) { return h.dbSet(c, String(id), r || {}); },
      update: function (id, p) { return h.dbUpdate(c, String(id), p || {}); },
      remove: function (id) { return h.dbRemove(c, String(id)); },
      query: function (o) { return h.dbQuery(c, o || {}); },
      count: function (w) { return h.dbCount(c, w); }
    };
  });
  var self = {
    id: h.id, name: h.id, type: meta.name, caller: h.caller || null, db: db, ctx: ctx,
    emit: function (e, d) { return h.emit(e, d); }
  };
  Object.defineProperty(self, '__chunk', { value: function (v) { return h.chunk(v); }, enumerable: false });
  if (kind === 'method') {
    self.set = function (p) { return h.set(p); };
    self.schedule = function (w, m, p) { return h.schedule(w, m, p || {}); };
    self.defer = function (j, p) { return h.defer(j, p || {}); };
  } else {
    // Jobs read a snapshot and change it only through methods, so every
    // state change stays serialized and transactional.
    self.set = function () { throw new Error('self.set is for methods; from a job use: await self.call("method", params)'); };
    self.call = function (m, p) { return h.callMethod(m, p || {}); };
  }
  Object.defineProperty(self, 'state', { get: function () { return h.stateGet(); }, enumerable: true });
  return self;
}`

export function makeSelfHost(
  journal: Journal,
  id: string,
  caller: AuthUser | null,
  callMethod?: SelfHost['callMethod'],
  onChunk?: (value: unknown) => void | Promise<void>,
): SelfHost {
  return {
    id,
    caller,
    stateGet: () => structuredClone(journal.state),
    set: (p) => structuredClone(journal.setState(p)),
    dbGet: (c, rid) => journal.get(c, rid),
    dbAdd: (c, r) => journal.add(c, r),
    dbSet: (c, rid, r) => journal.set(c, rid, r),
    dbUpdate: (c, rid, p) => journal.update(c, rid, p),
    dbRemove: (c, rid) => journal.remove(c, rid),
    dbQuery: (c, o) => journal.query(c, o),
    dbCount: (c, w) => journal.count(c, w),
    emit: (e, d) => journal.emit(e, d),
    schedule: (w, m, p) => journal.schedule(w, m, p),
    defer: (j, p) => journal.defer(j, p),
    callMethod:
      callMethod ??
      (async () => {
        throw new Error('self.call is for jobs; a method changes state directly with self.set')
      }),
    chunk: async (value) => {
      if (onChunk) await onChunk(structuredClone(value))
    },
  }
}

// ── runs ────────────────────────────────────────────────────────────────────

/** What executes user code: native (dev) or the sandbox (cloud). */
export type Invoke = (req: {
  kind: 'method' | 'onCreate'
  name: string
  params: Record<string, unknown>
  host: SelfHost
}) => Promise<{ result: unknown; computed: Record<string, unknown> }>

export interface CallOutcome {
  result: unknown
  state: Record<string, unknown>
  computed: Record<string, unknown>
  stateChanged: boolean
  events: PendingEvent[]
  jobs: PendingJob[]
  scheduled: boolean
}

export class ObjectError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

function storedComputed(sql: ObjectSql): Record<string, unknown> {
  const r = sql.exec("SELECT v FROM __meta WHERE k = 'computed'")[0]
  return r ? (JSON.parse(String(r['v'])) as Record<string, unknown>) : {}
}

/** State + computed as last committed, or null when the instance does not exist. */
export function readSnapshot(
  sql: ObjectSql,
  meta: ObjectMeta,
): { state: Record<string, unknown>; computed: Record<string, unknown> } | null {
  ensureSchema(sql, meta)
  const inst = readInstance(sql)
  return inst ? { state: inst.state, computed: storedComputed(sql) } : null
}

async function transact(
  sql: ObjectSql,
  meta: ObjectMeta,
  name: string,
  kind: 'method' | 'onCreate',
  member: string,
  params: Record<string, unknown>,
  caller: AuthUser | null,
  invoke: Invoke,
  baseState: Record<string, unknown>,
  onChunk?: (value: unknown) => void | Promise<void>,
): Promise<CallOutcome> {
  const journal = new Journal(sql, meta, baseState)
  const host = makeSelfHost(journal, name, caller, undefined, onChunk)
  const out = await invoke({ kind, name: member, params: structuredClone(params ?? {}), host })
  journal.commit()
  sql.exec("INSERT OR REPLACE INTO __meta (k, v) VALUES ('computed', ?)", JSON.stringify(out.computed ?? {}))
  return {
    result: out.result === undefined ? null : structuredClone(out.result),
    state: journal.state,
    computed: out.computed ?? {},
    stateChanged: journal.stateChanged,
    events: journal.events,
    jobs: journal.jobs,
    scheduled: journal.schedules.length > 0,
  }
}

/** Create an instance by name; `onCreate` (if any) runs in the same transaction. */
export async function createInstance(
  sql: ObjectSql,
  meta: ObjectMeta,
  name: string,
  init: Record<string, unknown>,
  caller: AuthUser | null,
  invoke: Invoke,
): Promise<CallOutcome> {
  ensureSchema(sql, meta)
  if (readInstance(sql)) throw new ObjectError(`${meta.name} "${name}" already exists`, 409)
  const state = { ...structuredClone(meta.state ?? {}), ...structuredClone(init ?? {}) }
  sql.exec(
    "INSERT OR REPLACE INTO __meta (k, v) VALUES ('instance', ?)",
    JSON.stringify({ type: meta.name, name, createdAt: Date.now() }),
  )
  sql.exec("INSERT OR REPLACE INTO __meta (k, v) VALUES ('state', ?)", JSON.stringify(state))
  try {
    // With no onCreate an empty run still evaluates `computed` once.
    return await transact(sql, meta, name, meta.hasOnCreate ? 'onCreate' : 'method', meta.hasOnCreate ? 'onCreate' : '', init ?? {}, caller, invoke, state)
  } catch (err) {
    // A failed onCreate leaves nothing behind.
    sql.exec("DELETE FROM __meta WHERE k IN ('instance', 'state', 'computed')")
    throw err
  }
}

/**
 * Run one method as a transaction. The host serializes calls per instance.
 * A streaming method (`async function*`) sends each yield to `onChunk` as it
 * happens; its state changes still commit only when it finishes.
 */
export async function callMethod(
  sql: ObjectSql,
  meta: ObjectMeta,
  name: string,
  method: string,
  params: Record<string, unknown>,
  caller: AuthUser | null,
  invoke: Invoke,
  onChunk?: (value: unknown) => void | Promise<void>,
): Promise<CallOutcome> {
  if (!meta.methods.includes(method)) throw new ObjectError(`${meta.name} has no method "${method}"`, 404)
  ensureSchema(sql, meta)
  const inst = readInstance(sql)
  if (!inst) throw new ObjectError(`${meta.name} "${name}" does not exist`, 404)
  return transact(sql, meta, name, 'method', method, params, caller, invoke, inst.state, onChunk)
}

/** Remove an instance's data entirely. */
export function destroyInstance(sql: ObjectSql, meta: ObjectMeta): boolean {
  ensureSchema(sql, meta)
  const existed = readInstance(sql) !== null
  sql.transaction(() => {
    sql.exec('DELETE FROM __meta')
    sql.exec('DELETE FROM __schedule')
    for (const c of Object.keys(meta.collections)) sql.exec(`DELETE FROM c_${c}`)
  })
  return existed
}

/** A per-key promise queue: calls on one instance run strictly one at a time. */
export class SerialQueue {
  private tails = new Map<string, Promise<unknown>>()
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    const settled = next.catch(() => {})
    this.tails.set(key, settled)
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key)
    })
    return next
  }
}

/**
 * The method side of a module run, as JavaScript source: given the object
 * definition `def`, run member `name` with `self`, then evaluate `computed`
 * on the final state. Used verbatim by the dev host and the sandbox wrapper.
 */
export const RUN_MEMBER_SRC = `async function __mgRun(def, kind, name, params, self) {
  var result = null;
  if (kind === 'onCreate') { if (typeof def.onCreate === 'function') result = await def.onCreate(self, params); }
  else if (name) {
    var fn = def.methods && def.methods[name];
    if (typeof fn !== 'function') throw new Error(def.name + ' has no method "' + name + '"');
    var out = fn(self, params);
    if (out && typeof out[Symbol.asyncIterator] === 'function') {
      // A streaming method: each yield goes to the caller now; the
      // generator's return value is the call's result.
      var it = out[Symbol.asyncIterator](), step;
      while (!(step = await it.next()).done) await self.__chunk(step.value);
      result = step.value;
    } else result = await out;
  }
  var computed = {};
  var st = self.state;
  Object.keys(def.computed || {}).forEach(function (k) {
    try { computed[k] = def.computed[k](st); } catch (e) { computed[k] = null; }
  });
  return { result: result === undefined ? null : result, computed: computed };
}`
