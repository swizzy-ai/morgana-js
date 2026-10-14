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
}

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
export interface PendingSchedule {
  at: number
  method: string
  params: Record<string, unknown>
}
export interface PendingJob {
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

  setState(patch: Record<string, unknown>): Record<string, unknown> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('self.set(patch) needs an object')
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
    const id = typeof record['id'] === 'string' && record['id'] ? String(record['id']) : newId()
    const now = Date.now()
    const row: Row = { ...structuredClone(record), id, createdAt: (record['createdAt'] as number) ?? now, updatedAt: now }
    this.pending(c).set(id, row)
    this.seqs.set(`${c}:${id}`, nextSeq())
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
    return structuredClone(row)
  }

  remove(collection: string, id: string): boolean {
    const c = this.coll(collection)
    const existed = this.get(c, String(id)) !== null
    this.pending(c).set(String(id), null)
    return existed
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
    if (typeof event !== 'string' || !event || event.startsWith('__')) throw new Error('self.emit(event, data) needs a name not starting with "__"')
    this.events.push({ event, data: structuredClone(data ?? null) })
  }

  schedule(when: number | string | Date, method: string, params: Record<string, unknown> = {}): void {
    if (!this.meta.methods.includes(method)) throw new Error(`self.schedule: "${method}" is not a method of "${this.meta.name}"`)
    this.schedules.push({ at: toTime(when), method, params: structuredClone(params ?? {}) })
  }

  defer(job: string, params: Record<string, unknown> = {}): void {
    if (!this.meta.jobs.includes(job)) throw new Error(`self.defer: "${job}" is not a job of "${this.meta.name}"`)
    this.jobs.push({ job, params: structuredClone(params ?? {}) })
  }

  /** Apply everything atomically. */
  commit(): void {
    this.sql.transaction(() => {
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
    })
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

/** The next scheduled run, or null. */
export function nextScheduledAt(sql: ObjectSql): number | null {
  const r = sql.exec('SELECT MIN(at) AS at FROM __schedule')[0]
  return r && r['at'] !== null && r['at'] !== undefined ? Number(r['at']) : null
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
