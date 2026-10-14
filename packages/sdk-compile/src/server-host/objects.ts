/**
 * Server objects — the kernel both hosts run.
 *
 * An object instance is durable state + its own tables + methods. Where it
 * runs differs (a Durable Object per instance in the cloud, an in-process
 * instance under `morgana dev`); what a call *means* is decided here, once:
 *
 *   - A method call is a transaction. Its state patch and table writes are
 *     journaled, reads see the call's own pending writes, and everything
 *     commits together when the method returns — or is discarded when it
 *     throws. Events and schedules are released only on commit.
 *   - Calls on one instance run one at a time (the host serializes), so a
 *     read-modify-write can never interleave with another.
 *   - Access is declared, not coded: a browser may call only what `access`
 *     names; server code (actions, other objects) may call everything.
 *
 * Storage is plain SQLite through a tiny synchronous adapter, so the same SQL
 * runs on Durable Object storage and on node:sqlite.
 */
import type { AuthUser } from '@morgana/sdk'
import { assertDeclaredFields } from './collections'

// ── definitions (the compiled, serializable part) ───────────────────────────

export type AccessRule = 'public' | 'member' | 'server' | { role: string | string[] }

export interface ObjectMeta {
  /** Type name, e.g. `chat-room`. */
  name: string
  /** Initial state for a new instance (merged under `create` init). */
  state: Record<string, unknown>
  collections: Record<string, { columns: Array<{ name: string; type?: string }> }>
  methods: string[]
  /** Methods written as `async function*`: their yields stream to the caller. */
  streaming: string[]
  jobs: string[]
  computed: string[]
  access: Record<string, AccessRule>
  hasOnCreate: boolean
  /**
   * Keys of the definition's `on` section — reactions run inside the call
   * that caused them: `<collection>.added|updated|removed`, `state.<key>`, or
   * a custom event name.
   */
  on?: string[]
}

/** Events an instance announces about itself (triggers and subscribers). */
export const LIFECYCLE_EVENTS = ['created', 'removed', 'state'] as const
export const RECORD_VERBS = ['added', 'updated', 'removed'] as const

/** A deployed `on: 'object:<type>[/<name>].<event>'` server trigger. */
export interface ObjectTrigger {
  type: string
  /** One instance, or every instance of the type when absent. */
  name?: string | null
  event: string
  action: string
}

/** Parse `object:<type>[/<name>].<event>`; null when it is not that shape. */
export function parseObjectSelector(selector: string): { type: string; name: string | null; event: string } | null {
  const m = /^object:([a-z][a-z0-9-]*)(?:\/([^.\s]+))?\.(.+)$/.exec(String(selector).trim())
  if (!m) return null
  return { type: m[1]!, name: m[2] ? decodeURIComponent(m[2]) : null, event: m[3]! }
}

/** What is wrong with an object selector's event, given the type, or null. */
export function objectEventProblem(meta: ObjectMeta, event: string): string | null {
  if ((LIFECYCLE_EVENTS as readonly string[]).includes(event)) return null
  const dot = event.indexOf('.')
  if (dot < 0) return null // a custom event from self.emit — not knowable statically
  const c = event.slice(0, dot)
  const verb = event.slice(dot + 1)
  if (!meta.collections[c]) return `"${meta.name}" has no collection "${c}" (it has: ${Object.keys(meta.collections).join(', ') || 'none'})`
  if (!(RECORD_VERBS as readonly string[]).includes(verb)) return `"${c}.${verb}" — a collection event is ${c}.added, ${c}.updated or ${c}.removed`
  return null
}

/** The `__jobs` entry kind that delivers a trigger (beside real jobs). */
export const TRIGGER_JOB_PREFIX = '__trigger:'

export const OBJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/
/** Instance names: what you create with. URL- and key-safe. */
export const INSTANCE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function assertInstanceName(name: unknown): string {
  const n = String(name ?? '')
  if (!INSTANCE_NAME_RE.test(n)) {
    throw Object.assign(new Error(`invalid instance name "${n}" — letters, digits and . _ : - (max 128)`), { status: 400 })
  }
  return n
}

// ── storage adapter ─────────────────────────────────────────────────────────

/** Synchronous SQLite, as both Durable Objects and node:sqlite provide. */
export interface ObjectSql {
  exec(sql: string, ...params: unknown[]): Array<Record<string, unknown>>
  /** Run `fn` atomically. */
  transaction(fn: () => void): void
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(s)) throw new Error(`invalid identifier "${s}"`)
  return s
}
const table = (collection: string) => `c_${ident(collection)}`

export function ensureSchema(sql: ObjectSql, meta: ObjectMeta): void {
  sql.exec('CREATE TABLE IF NOT EXISTS __meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
  sql.exec('CREATE TABLE IF NOT EXISTS __schedule (id TEXT PRIMARY KEY, at INTEGER NOT NULL, method TEXT NOT NULL, params TEXT NOT NULL)')
  // Deferred jobs, written in the commit that deferred them: a job survives a
  // restart or an evicted Durable Object, and runs at least once.
  sql.exec('CREATE TABLE IF NOT EXISTS __jobs (id TEXT PRIMARY KEY, at INTEGER NOT NULL, job TEXT NOT NULL, params TEXT NOT NULL, caller TEXT, attempts INTEGER NOT NULL DEFAULT 0)')
  for (const c of Object.keys(meta.collections)) {
    sql.exec(`CREATE TABLE IF NOT EXISTS ${table(c)} (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, data TEXT NOT NULL)`)
  }
}

export interface InstanceRecord {
  type: string
  name: string
  createdAt: number
  state: Record<string, unknown>
}

export function readInstance(sql: ObjectSql): InstanceRecord | null {
  const rows = sql.exec("SELECT k, v FROM __meta WHERE k IN ('instance', 'state')")
  const map = Object.fromEntries(rows.map((r) => [String(r['k']), JSON.parse(String(r['v']))]))
  if (!map['instance']) return null
  return { ...(map['instance'] as Omit<InstanceRecord, 'state'>), state: (map['state'] as Record<string, unknown>) ?? {} }
}

// ── the journal: one call's pending writes ─────────────────────────────────

type Row = Record<string, unknown> & { id: string }

export interface QueryOptions {
  where?: Record<string, unknown>
  sort?: { field: string; dir?: 'asc' | 'desc' }
  limit?: number
  offset?: number
}

let seqClock = 0
const nextSeq = () => {
  seqClock = Math.max(Date.now() * 1000, seqClock + 1)
  return seqClock
}
const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(8))
  return `r_${Date.now().toString(36)}${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 10)}`
}

export interface PendingEvent {
  event: string
  data: unknown
}
interface Reaction {
  event: string
  data: unknown
  previous?: unknown
}
export interface PendingSchedule {
  at: number
  method: string
  params: Record<string, unknown>
}
export interface PendingJob {
  id: string
  job: string
  params: Record<string, unknown>
}

export class Journal {
  state: Record<string, unknown>
  stateChanged = false
  private writes = new Map<string, Map<string, Row | null>>()
  private seqs = new Map<string, number>()
  events: PendingEvent[] = []
  schedules: PendingSchedule[] = []
  jobs: PendingJob[] = []
  /** For `on` reactions: queued until the member returns, then run in the same call. */
  private reactions: Reaction[] = []
  /** Set by the host for trigger delivery: who this instance is and what listens. */
  outbox: { name: string; triggers: ObjectTrigger[]; created?: boolean } | null = null
  /** How many trigger deliveries the last commit queued. */
  triggersQueued = 0

  constructor(
    private sql: ObjectSql,
    private meta: ObjectMeta,
    committedState: Record<string, unknown>,
  ) {
    this.state = structuredClone(committedState)
  }

  private coll(name: string): string {
    if (!this.meta.collections[name]) {
      throw Object.assign(new Error(`object "${this.meta.name}" has no collection "${name}"`), { status: 400 })
    }
    return name
  }

  private reacts(event: string): boolean {
    return Boolean(this.meta.on?.includes(event))
  }

  /** A record write: announced to subscribers and triggers, and to `on`. */
  private recordEvent(event: string, data: unknown, previous?: unknown): void {
    this.events.push({ event, data: structuredClone(data) })
    if (this.reacts(event)) this.reactions.push({ event, data: structuredClone(data), previous: structuredClone(previous) })
  }

  /** The reactions queued so far (and clears them). */
  takeReactions(): Reaction[] {
    const out = this.reactions
    this.reactions = []
    return out
  }

  setState(patch: Record<string, unknown>): Record<string, unknown> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('self.set(patch) needs an object')
    for (const [k, v] of Object.entries(patch)) {
      if (this.reacts(`state.${k}`) && JSON.stringify(v) !== JSON.stringify(this.state[k])) {
        this.reactions.push({ event: `state.${k}`, data: { value: structuredClone(v), previous: structuredClone(this.state[k]) } })
      }
    }
    this.state = { ...this.state, ...structuredClone(patch) }
    this.stateChanged = true
    return this.state
  }

  private pending(c: string): Map<string, Row | null> {
    let m = this.writes.get(c)
    if (!m) this.writes.set(c, (m = new Map()))
    return m
  }

  private committedRow(c: string, id: string): Row | null {
    const r = this.sql.exec(`SELECT data FROM ${table(c)} WHERE id = ?`, id)[0]
    return r ? (JSON.parse(String(r['data'])) as Row) : null
  }

  get(collection: string, id: string): Row | null {
    const c = this.coll(collection)
    const p = this.writes.get(c)
    if (p?.has(id)) return structuredClone(p.get(id) ?? null)
    return this.committedRow(c, String(id))
  }

  add(collection: string, record: Record<string, unknown>): Row {
    const c = this.coll(collection)
    assertDeclaredFields(collection, this.meta.collections[c], record)
    const given = typeof record['id'] === 'string' && record['id'] ? String(record['id']) : null
    const id = given ?? newId()
    // Only a caller-chosen id can already exist.
    const previous = given ? this.get(c, id) : null
    const now = Date.now()
    const row: Row = { ...structuredClone(record), id, createdAt: (previous?.['createdAt'] as number) ?? (record['createdAt'] as number) ?? now, updatedAt: now }
    this.pending(c).set(id, row)
    if (!previous) this.seqs.set(`${c}:${id}`, nextSeq())
    this.recordEvent(previous ? `${c}.updated` : `${c}.added`, row, previous ?? undefined)
    return structuredClone(row)
  }

  set(collection: string, id: string, record: Record<string, unknown>): Row {
    return this.add(collection, { ...record, id: String(id) })
  }

  update(collection: string, id: string, patch: Record<string, unknown>): Row | null {
    const c = this.coll(collection)
    assertDeclaredFields(collection, this.meta.collections[c], patch)
    const current = this.get(c, String(id))
    if (!current) return null
    const row: Row = { ...current, ...structuredClone(patch), id: current.id, updatedAt: Date.now() }
    this.pending(c).set(current.id, row)
    this.recordEvent(`${c}.updated`, row, current)
    return structuredClone(row)
  }

  remove(collection: string, id: string): boolean {
    const c = this.coll(collection)
    const previous = this.get(c, String(id))
    this.pending(c).set(String(id), null)
    if (previous) this.recordEvent(`${c}.removed`, previous)
    return previous !== null
  }

  query(collection: string, opts: QueryOptions = {}): { items: Row[]; total: number } {
    const c = this.coll(collection)
    const where = opts.where ?? {}
    const sortField = opts.sort?.field
    const dir = opts.sort?.dir === 'desc' ? 'DESC' : 'ASC'
    const clauses: string[] = []
    const params: unknown[] = []
    for (const [k, v] of Object.entries(where)) {
      clauses.push(`json_extract(data, ?) = ?`)
      params.push(`$.${ident(k)}`, typeof v === 'boolean' ? (v ? 1 : 0) : v)
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const orderSql = sortField ? `ORDER BY json_extract(data, '$.${ident(sortField)}') ${dir}, seq ${dir}` : `ORDER BY seq ${dir}`
    const pend = this.writes.get(c)
    const matches = (r: Row) => Object.entries(where).every(([k, v]) => r[k] === v)
    if (!pend || pend.size === 0) {
      const total = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM ${table(c)} ${whereSql}`, ...params)[0]?.['n'] ?? 0)
      const limit = opts.limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(opts.limit))} OFFSET ${Math.max(0, Math.floor(opts.offset ?? 0))}` : ''
      const items = this.sql.exec(`SELECT data FROM ${table(c)} ${whereSql} ${orderSql}${limit}`, ...params).map((r) => JSON.parse(String(r['data'])) as Row)
      return { items, total }
    }
    // Pending writes in this call: merge them over the committed rows.
    const rows = new Map<string, Row>()
    for (const r of this.sql.exec(`SELECT data FROM ${table(c)} ${whereSql} ${orderSql}`, ...params)) {
      const row = JSON.parse(String(r['data'])) as Row
      rows.set(row.id, row)
    }
    for (const [id, row] of pend) {
      if (row === null || !matches(row)) rows.delete(id)
      else rows.set(id, row)
    }
    let items = [...rows.values()]
    if (sortField) {
      items.sort((a, b) => {
        const x = a[sortField] as never
        const y = b[sortField] as never
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'DESC' ? -1 : 1)
      })
    }
    const total = items.length
    const off = Math.max(0, Math.floor(opts.offset ?? 0))
    if (opts.limit !== undefined) items = items.slice(off, off + Math.max(0, Math.floor(opts.limit)))
    return { items: structuredClone(items), total }
  }

  count(collection: string, where?: Record<string, unknown>): number {
    return this.query(collection, { where }).total
  }

  emit(event: string, data: unknown): void {
    if (typeof event !== 'string' || !event || event.startsWith('__') || event.includes('.')) {
      throw new Error('self.emit(event, data) needs a name without "." and not starting with "__" (dotted names are record events)')
    }
    if ((LIFECYCLE_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`self.emit: "${event}" is announced by the object itself — choose another name`)
    }
    this.events.push({ event, data: structuredClone(data ?? null) })
    if (this.reacts(event)) this.reactions.push({ event, data: structuredClone(data ?? null) })
  }

  schedule(when: number | string | Date, method: string, params: Record<string, unknown> = {}): void {
    if (!this.meta.methods.includes(method)) throw new Error(`self.schedule: "${method}" is not a method of "${this.meta.name}"`)
    this.schedules.push({ at: toTime(when), method, params: structuredClone(params ?? {}) })
  }

  defer(job: string, params: Record<string, unknown> = {}): void {
    if (!this.meta.jobs.includes(job)) throw new Error(`self.defer: "${job}" is not a job of "${this.meta.name}"`)
    this.jobs.push({ id: newId(), job, params: structuredClone(params ?? {}) })
  }

  private pendingTriggers(): Array<{ action: string; payload: unknown }> {
    if (!this.outbox?.triggers.length) return []
    const { name, triggers } = this.outbox
    const events: PendingEvent[] = [...this.events]
    if (this.outbox.created) events.unshift({ event: 'created', data: structuredClone(this.state) })
    if (this.stateChanged || this.outbox.created) events.push({ event: 'state', data: structuredClone(this.state) })
    const out: Array<{ action: string; payload: unknown }> = []
    for (const e of events) {
      for (const t of matchTriggers(triggers, this.meta.name, name, e.event)) {
        out.push({ action: t.action, payload: { event: triggerPayload(this.meta.name, name, e.event, e.data) } })
      }
    }
    return out
  }

  /** Apply everything atomically (`computed` and the deferring caller ride along). */
  commit(computed?: Record<string, unknown>, caller: unknown = null): void {
    this.sql.transaction(() => {
      if (computed) this.sql.exec("INSERT OR REPLACE INTO __meta (k, v) VALUES ('computed', ?)", JSON.stringify(computed))
      if (this.stateChanged) this.sql.exec("INSERT OR REPLACE INTO __meta (k, v) VALUES ('state', ?)", JSON.stringify(this.state))
      for (const [c, pend] of this.writes) {
        for (const [id, row] of pend) {
          if (row === null) this.sql.exec(`DELETE FROM ${table(c)} WHERE id = ?`, id)
          else {
            const seq = this.seqs.get(`${c}:${id}`)
            if (seq !== undefined) {
              this.sql.exec(`INSERT OR REPLACE INTO ${table(c)} (id, seq, data) VALUES (?, ?, ?)`, id, seq, JSON.stringify(row))
            } else {
              this.sql.exec(`UPDATE ${table(c)} SET data = ? WHERE id = ?`, JSON.stringify(row), id)
            }
          }
        }
      }
      for (const s of this.schedules) {
        this.sql.exec('INSERT INTO __schedule (id, at, method, params) VALUES (?, ?, ?, ?)', newId(), s.at, s.method, JSON.stringify(s.params))
      }
      for (const j of this.jobs) {
        this.sql.exec('INSERT INTO __jobs (id, at, job, params, caller) VALUES (?, ?, ?, ?, ?)', j.id, Date.now(), j.job, JSON.stringify(j.params), JSON.stringify(caller ?? null))
      }
      // Triggers ride the same durable queue: written with the commit,
      // delivered at least once — and never for a call that rolled back.
      const queued = this.pendingTriggers()
      this.triggersQueued = queued.length
      for (const t of queued) {
        this.sql.exec('INSERT INTO __jobs (id, at, job, params, caller) VALUES (?, ?, ?, ?, ?)', newId(), Date.now(), `${TRIGGER_JOB_PREFIX}${t.action}`, JSON.stringify(t.payload), JSON.stringify(caller ?? null))
      }
    })
  }
}

/** Which triggers match an event of this instance. */
export function matchTriggers(triggers: ObjectTrigger[], type: string, name: string, event: string): ObjectTrigger[] {
  return triggers.filter((t) => t.type === type && t.event === event && (t.name == null || t.name === name))
}

/** The descriptor a triggered action receives as `ctx.args.event`. */
export function triggerPayload(type: string, name: string, event: string, data: unknown) {
  return {
    kind: `object:${type}.${event}`,
    source: type,
    event,
    object: { type, instanceId: name, serverObject: true },
    payload: data ?? null,
    timestamp: new Date().toISOString(),
  }
}

/** `30s`, `5m`, `2h`, `1d`, ms number (relative), Date or ISO string (absolute). */
export function toTime(when: number | string | Date): number {
  if (when instanceof Date) return when.getTime()
  if (typeof when === 'number') return Date.now() + Math.max(0, when)
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(String(when).trim())
  if (m) {
    const n = Number(m[1])
    const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'ms']
    return Date.now() + n * unit
  }
  const t = Date.parse(String(when))
  if (Number.isNaN(t)) throw new Error(`self.schedule: cannot read time "${String(when)}"`)
  return t
}

/** The next scheduled run or pending job, or null. */
export function nextScheduledAt(sql: ObjectSql): number | null {
  const r = sql.exec('SELECT MIN(at) AS at FROM (SELECT at FROM __schedule UNION ALL SELECT at FROM __jobs)')[0]
  return r && r['at'] !== null && r['at'] !== undefined ? Number(r['at']) : null
}

export interface StoredJob {
  id: string
  job: string
  params: Record<string, unknown>
  caller: unknown
  attempts: number
}

/** Jobs due to run (not removed — see finishJob / failJob). */
export function dueJobs(sql: ObjectSql, now = Date.now()): StoredJob[] {
  return sql.exec('SELECT id, job, params, caller, attempts FROM __jobs WHERE at <= ? ORDER BY at', now).map((r) => ({
    id: String(r['id']),
    job: String(r['job']),
    params: JSON.parse(String(r['params'])) as Record<string, unknown>,
    caller: r['caller'] ? JSON.parse(String(r['caller'])) : null,
    attempts: Number(r['attempts'] ?? 0),
  }))
}

/** A job is held back while it runs, so a second sweep does not start it again. */
export function claimJob(sql: ObjectSql, id: string, leaseMs = 15 * 60_000): void {
  sql.exec('UPDATE __jobs SET at = ? WHERE id = ?', Date.now() + leaseMs, id)
}

export function finishJob(sql: ObjectSql, id: string): void {
  sql.exec('DELETE FROM __jobs WHERE id = ?', id)
}

export const MAX_JOB_ATTEMPTS = 3

/** Retry with backoff (2s, 8s); dropped after MAX_JOB_ATTEMPTS. Returns true when dropped. */
export function failJob(sql: ObjectSql, id: string): boolean {
  const r = sql.exec('SELECT attempts FROM __jobs WHERE id = ?', id)[0]
  const attempts = Number(r?.['attempts'] ?? 0) + 1
  if (!r || attempts >= MAX_JOB_ATTEMPTS) {
    finishJob(sql, id)
    return true
  }
  sql.exec('UPDATE __jobs SET attempts = ?, at = ? WHERE id = ?', attempts, Date.now() + 2000 * 4 ** (attempts - 1), id)
  return false
}

/** Due schedule entries, removed from the table. */
export function takeDue(sql: ObjectSql, now = Date.now()): Array<{ method: string; params: Record<string, unknown> }> {
  const rows = sql.exec('SELECT id, method, params FROM __schedule WHERE at <= ? ORDER BY at', now)
  if (!rows.length) return []
  sql.transaction(() => {
    for (const r of rows) sql.exec('DELETE FROM __schedule WHERE id = ?', r['id'])
  })
  return rows.map((r) => ({ method: String(r['method']), params: JSON.parse(String(r['params'])) as Record<string, unknown> }))
}

// ── access ──────────────────────────────────────────────────────────────────

/** What a browser caller may do. Server code bypasses this entirely. */
export function accessRefusal(meta: ObjectMeta, what: string, user: AuthUser | null): 401 | 403 | null {
  const rule = meta.access[what]
  if (rule === undefined || rule === 'server') return 403
  if (rule === 'public') return null
  if (!user) return 401
  if (rule === 'member') return null
  const roles = Array.isArray(rule.role) ? rule.role : [rule.role]
  return roles.some((r) => user.roles?.includes(r)) ? null : 403
}

/** Validate a definition's declarative parts at build time. */
export function validateObjectMeta(meta: ObjectMeta): string[] {
  const errors: string[] = []
  if (!OBJECT_NAME_RE.test(meta.name)) errors.push(`object name "${meta.name}" must be lowercase letters, digits and -, starting with a letter`)
  const members = new Set([...meta.methods, ...meta.jobs])
  if (members.size !== meta.methods.length + meta.jobs.length) {
    errors.push(`object "${meta.name}" uses one name for both a method and a job`)
  }
  for (const s of meta.streaming) {
    if (!meta.methods.includes(s)) errors.push(`object "${meta.name}": streaming "${s}" is not a method`)
  }
  for (const key of meta.on ?? []) {
    if (key.startsWith('state.')) {
      const k = key.slice('state.'.length)
      if (!(k in (meta.state ?? {}))) errors.push(`object "${meta.name}": on "${key}" — "${k}" is not in its state`)
      continue
    }
    if ((LIFECYCLE_EVENTS as readonly string[]).includes(key)) {
      errors.push(`object "${meta.name}": on "${key}" — use onCreate, or an action with on: 'object:${meta.name}.${key}'`)
      continue
    }
    const problem = objectEventProblem(meta, key)
    if (problem) errors.push(`object "${meta.name}": on "${key}" — ${problem}`)
  }
  const reserved = new Set(['create', 'read', 'subscribe', 'list', 'remove'])
  for (const name of members) {
    if (reserved.has(name)) errors.push(`object "${meta.name}": "${name}" is reserved — rename the method`)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) errors.push(`object "${meta.name}": "${name}" is not a valid method name`)
  }
  for (const [what, rule] of Object.entries(meta.access)) {
    if (!reserved.has(what) && !meta.methods.includes(what)) {
      errors.push(`object "${meta.name}" access names "${what}", which is not a method or create/read/subscribe/list/remove`)
    }
    const ok = rule === 'public' || rule === 'member' || rule === 'server' || (typeof rule === 'object' && rule !== null && 'role' in rule)
    if (!ok) errors.push(`object "${meta.name}" access.${what} must be 'public' | 'member' | 'server' | { role }`)
  }
  for (const c of Object.keys(meta.collections)) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(c)) errors.push(`object "${meta.name}" collection "${c}" must be a plain identifier`)
  }
  return errors
}
