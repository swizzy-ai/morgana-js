/**
 * Store engine — collections on SQLite.
 *
 * Uses the `node:sqlite` built in Node 22+, so the host has real persistence
 * with no dependency. Records live in one table per collection as a JSON
 * document plus a `sort` column, which keeps the schema a function of the
 * declared shape rather than of migrations, and keeps `where` / `sort` /
 * `page` answerable without a bespoke query builder.
 *
 * The declared shape drives two things: which fields get filtered to their
 * declared type on write, and what `shape()` reports back. Unknown fields are
 * kept — a shape is a declaration, not a cage.
 */

import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
/**
 * @typedef {{ id?: string, name: string, type: 'string'|'number'|'boolean'|'date'|'json' }} ColumnDef
 * @typedef {{ columns?: ColumnDef[], tables?: Array<{ id?: string, name: string, columns: ColumnDef[] }> }} Shape
 * @typedef {{ field: string, op?: string, value: unknown }} WhereClause
 * @typedef {{ filter?: Record<string, unknown>, where?: WhereClause[], sort?: { field: string, dir?: 'asc'|'desc' },
 *             page?: number, pageSize?: number, fields?: string[] }} QueryOptions
 * @typedef {{ items: Array<Record<string, unknown>>, total: number, page: number, pageSize: number, totalPages: number }} QueryResult
 */

/** Reserved record id holding the shape. Cannot collide with a real id. */
const SHAPE_SUFFIX = '::shape'

/** @typedef {ColumnDef['type']} ColumnType */

const SQL_TYPE = {
  string: 'TEXT',
  number: 'REAL',
  boolean: 'INTEGER',
  date: 'TEXT',
  json: 'TEXT',
}

/** Coerce a value to its declared type, or leave it alone when undeclared. */
/** @param {unknown} value @param {ColumnType|undefined} type */
function coerce(value, type) {
  if (value === undefined || value === null) return null
  switch (type) {
    case 'number': {
      if (typeof value === 'number') return value
      const n = Number(value)
      return Number.isNaN(n) ? null : n
    }
    case 'boolean':
      if (typeof value === 'boolean') return value ? 1 : 0
      if (value === 'true') return 1
      if (value === 'false') return 0
      return value ? 1 : 0
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value)
    case 'date': {
      if (typeof value === 'number') return new Date(value).toISOString()
      const d = new Date(String(value))
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    case 'string':
    default:
      return typeof value === 'string' ? value : String(value)
  }
}

function decode(row) {
  const data = row['data']
  if (typeof data !== 'string') return {}
  try {
    const parsed = JSON.parse(data)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Keys are lower-case because a caller's op is normalised before lookup, and
// callers write both `startsWith` and `startswith`.
const OPS = {
  eq: (a, b) => a === b || String(a) === String(b),
  ne: (a, b) => !(a === b || String(a) === String(b)),
  gt: (a, b) => toNumber(a) !== null && toNumber(b) !== null && Number(a) > Number(b),
  gte: (a, b) => toNumber(a) !== null && toNumber(b) !== null && Number(a) >= Number(b),
  lt: (a, b) => toNumber(a) !== null && toNumber(b) !== null && Number(a) < Number(b),
  lte: (a, b) => toNumber(a) !== null && toNumber(b) !== null && Number(a) <= Number(b),
  in: (a, b) => (Array.isArray(b) ? b : [b]).map(String).includes(String(a)),
  nin: (a, b) => !(Array.isArray(b) ? b : [b]).map(String).includes(String(a)),
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
  startswith: (a, b) => String(a ?? '').startsWith(String(b ?? '')),
  endswith: (a, b) => String(a ?? '').endsWith(String(b ?? '')),
  exists: (a, b) => (b ? a !== null && a !== undefined : a === null || a === undefined),
  between: (a, b) => {
    if (!Array.isArray(b) || b.length < 2) return false
    const n = toNumber(a)
    if (n === null) return false
    return n >= Number(b[0]) && n <= Number(b[1])
  },
}

function matches(record, opts) {
  if (opts.where) {
    for (const clause of opts.where) {
      if (!clause || typeof clause.field !== 'string') continue
      const test = OPS[(clause.op ?? 'eq').toLowerCase()] ?? OPS.eq
      if (!test(record[clause.field], clause.value)) return false
    }
  }
  if (opts.filter && typeof opts.filter === 'object') {
    for (const [field, want] of Object.entries(opts.filter)) {
      if (want === undefined) continue
      if (OPS.eq(record[field], want)) continue
      if (Array.isArray(want) && OPS.in(record[field], want)) continue
      return false
    }
  }
  return true
}

function compare(a, b) {
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na !== null && nb !== null) return na - nb
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(Boolean(a)) - Number(Boolean(b))
  }
  return String(a ?? '').localeCompare(String(b ?? ''))
}

/**
 * @param {{ file: string, now?: () => number, id?: () => string }} opts
 *   `file` is a database path or ':memory:'. `now`/`id` are injected by tests
 *   so timestamps and record ids are deterministic.
 */
export class StoreEngine {
  /** @type {DatabaseSync} */
  db
  now
  nextId
  /** Cache of declared shapes, so `shape()` does not hit the db per call. */
  /** @type {Map<string, Shape>} */
  shapes = new Map()

  constructor(opts) {
    this.db = new DatabaseSync(opts.file)
    this.now = opts.now ?? (() => Date.now())
    this.nextId = opts.id ?? (() => randomUUID())
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS collections (
         name TEXT NOT NULL,
         id   TEXT NOT NULL,
         data TEXT NOT NULL,
         sort INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (name, id)
       )`,
    )
    this.db.exec('CREATE INDEX IF NOT EXISTS collections_name_sort ON collections (name, sort)')
  }

  close() {
    this.db.close()
  }

  tableFor(name) {
    // One physical table per collection: a shape is data, not schema.
    const safe = `c_${String(name).replace(/[^A-Za-z0-9_]/g, '_')}`
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${safe} (
         name TEXT NOT NULL,
         id   TEXT NOT NULL,
         data TEXT NOT NULL,
         sort INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (name, id)
       )`,
    )
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS ${safe}_name_sort ON ${safe} (name, sort)`,
    )
  }

  safeTable(name) {
    return `c_${name.replace(/[^A-Za-z0-9_]/g, '_')}`
  }

  columnsOf(shape) {
    const out = new Map()
    if (!shape) return out
    for (const col of shape.columns ?? []) out.set(col.name, col.type)
    for (const t of shape.tables ?? []) for (const col of t.columns ?? []) out.set(col.name, col.type)
    return out
  }

  /** Declare a collection's shape. Idempotent — safe to re-run at every boot. */
  create(name, shape) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name)) {
      throw new Error(`invalid collection name "${String(name)}" — use letters, digits, - and _`)
    }
    // Re-declaring with no shape must not erase the one already recorded —
    // `create(name)` is a legitimate "declare this" call.
    const existing = this.shape(name)
    const resolved = shape ?? existing ?? { columns: [] }
    const resolvedTypes = this.columnsOf(resolved)
    for (const col of resolvedTypes.keys()) {
      const t = resolvedTypes.get(col)
      if (t && !SQL_TYPE[t]) {
        throw new Error(`collection "${name}" column "${col}" has unknown type "${t}"`)
      }
    }
    this.shapes.set(name, resolved)
    this.tableFor(name)
    this.db
      .prepare('INSERT OR REPLACE INTO collections (name, id, data, sort) VALUES (?, ?, ?, ?)')
      .run(name, SHAPE_SUFFIX, JSON.stringify(resolved), -1)
    return resolved
  }

  shape(name) {
    const cached = this.shapes.get(name)
    if (cached) return cached
    const row = this.db
      .prepare('SELECT data FROM collections WHERE name = ? AND id = ?')
      .get(name, SHAPE_SUFFIX)
    if (!row?.data) return null
    const parsed = JSON.parse(row.data)
    this.shapes.set(name, parsed)
    return parsed
  }

  names() {
    // The shape row is itself the record that a collection was declared, so an
    // empty collection still counts as declared.
    return this.db
      .prepare('SELECT DISTINCT name FROM collections ORDER BY name')
      .all()
      .map((r) => r.name)
  }

  assertExists(name) {
    if (!this.shape(name)) {
      throw new Error(
        `collection "${name}" is not declared — declare it with ctx.server.collections.create('${name}', { columns: [...] }) in a compile action`,
      )
    }
  }

  readRow(name, id) {
    const row = this.db
      .prepare(`SELECT data FROM ${this.safeTable(name)} WHERE name = ? AND id = ?`)
      .get(name, id)
    return row?.data ? decode(row) : null
  }

  get(name, id) {
    this.assertExists(name)
    if (id === undefined) return this.all(name)
    return this.readRow(name, id)
  }

  all(name) {
    const rows = this.db
      .prepare(`SELECT id, data FROM ${this.safeTable(name)} WHERE name = ? ORDER BY sort, rowid`)
      .all(name)
    return rows.map((r) => ({ id: r.id, ...decode(r) }))
  }

  nextSort(name) {
    const row = this.db
      .prepare(`SELECT MAX(sort) AS m FROM ${this.safeTable(name)} WHERE name = ?`)
      .get(name)
    return (row?.m ?? 0) + 1
  }

  /** Insert, generating an id. */
  add(name, data) {
    this.assertExists(name)
    const id = typeof data?.id === 'string' && data.id ? data.id : this.nextId()
    return this.insert(name, { ...(data ?? {}), id })
  }

  /** Insert with a caller-supplied record. */
  insert(name, record) {
    this.assertExists(name)
    const src = record ?? {}
    const id = typeof src.id === 'string' && src.id ? src.id : this.nextId()
    const types = this.columnsOf(this.shape(name))
    const now = this.now()
    const out = { id }
    for (const [k, v] of Object.entries(src)) {
      if (k === 'id') continue
      out[k] = coerce(v, types.get(k))
    }
    if (out.createdAt === undefined) out.createdAt = now
    out.updatedAt = now
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ${this.safeTable(name)} (name, id, data, sort) VALUES (?, ?, ?, ?)`,
      )
      .run(name, id, JSON.stringify(out), this.nextSort(name))
    return out
  }

  /** Create-or-overwrite at an explicit id. */
  set(name, id, data) {
    this.assertExists(name)
    if (typeof id !== 'string' || !id) throw new Error(`set("${name}") needs a non-empty id`)
    return this.insert(name, { ...(data ?? {}), id })
  }

  /** Merge into an existing record. Returns null when the id is unknown. */
  update(name, id, data) {
    this.assertExists(name)
    const current = this.readRow(name, id)
    if (!current) return null
    return this.insert(name, { ...current, ...(data ?? {}), id })
  }

  remove(name, id) {
    this.assertExists(name)
    const res = this.db
      .prepare(`DELETE FROM ${this.safeTable(name)} WHERE name = ? AND id = ?`)
      .run(name, id)
    return Number(res.changes ?? 0) > 0
  }

  count(name, opts = {}) {
    this.assertExists(name)
    if (!opts.where && !opts.filter) {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS n FROM ${this.safeTable(name)} WHERE name = ?`)
        .get(name)
      return Number(row?.n ?? 0)
    }
    return this.filtered(name, opts).length
  }

  find(name, predicate) {
    this.assertExists(name)
    const rows = this.all(name)
    if (typeof predicate !== 'function') return rows
    const fn = predicate
    return rows.filter((r) => {
      try {
        return Boolean(fn(r))
      } catch {
        return false
      }
    })
  }

  filtered(name, opts) {
    const rows = this.all(name).filter((r) => matches(r, opts))
    if (opts.sort?.field) {
      const dir = opts.sort.dir === 'desc' ? -1 : 1
      const field = opts.sort.field
      rows.sort((a, b) => dir * compare(a[field], b[field]))
    }
    return rows
  }

  query(name, opts = {}) {
    this.assertExists(name)
    const matched = this.filtered(name, opts)
    const total = matched.length
    const pageSize = Math.max(1, Math.floor(Number(opts.pageSize ?? 20)))
    const page = Math.max(1, Math.floor(Number(opts.page ?? 1)))
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const start = (page - 1) * pageSize
    let items = matched.slice(start, start + pageSize)
    if (opts.fields && opts.fields.length) {
      // `id` always survives a projection: every record has one, and without
      // it a caller cannot update or remove what it just fetched.
      const keep = new Set([...opts.fields, 'id'])
      items = items.map((r) => {
        const out = {}
        for (const k of keep) if (k in r) out[k] = r[k]
        return out
      })
    }
    return { items, total, page, pageSize, totalPages }
  }

  /** Every record across every collection — what the demo host seeds from. */
  dump() {
    const out = {}
    for (const name of this.names()) out[name] = this.all(name)
    return out
  }
}
