/**
 * `morgana data` — read a deployed project's stores from the terminal.
 *
 *   morgana data                               every store, with its row count
 *   morgana data slips                         the newest 20 rows
 *   morgana data slips --where source=image    rows whose fields equal these values
 *   morgana data slips --search "PSG"          rows whose text contains it
 *   morgana data slips --fields id,scannedAt --limit 50 --sort scannedAt --asc
 *   morgana data slips --json | --csv          for piping
 *   morgana data slips <id>                    one row in full
 *
 * Read only: it never writes or deletes.
 */
import { say, bold, dim } from '../ui.mjs'
import { resolveTarget, resolveCredential } from './deploy.mjs'

async function get(base, bearer, route) {
  const res = await fetch(`${base}${route}`, { headers: { authorization: `Bearer ${bearer}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success === false) throw new Error(`${res.status} ${body.message ?? ''}`.trim())
  return body
}

/** "source=image,stance=supported" → { source: 'image', stance: 'supported' } (numbers and booleans as such). */
function parseWhere(text) {
  const out = {}
  for (const pair of String(text || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = pair.indexOf('=')
    if (i < 1) throw new Error(`--where needs field=value pairs: "${pair}"`)
    const raw = pair.slice(i + 1)
    out[pair.slice(0, i)] = raw === 'true' ? true : raw === 'false' ? false : raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw
  }
  return out
}

const cell = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function csv(rows, cols) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(cell(r[c]))).join(','))].join('\n')
}

/** Columns for a table: the given fields, else id plus the first few fields that aren't long JSON. */
function columnsFor(rows, fields) {
  if (fields.length) return fields
  const keys = []
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  const scalar = keys.filter((k) => rows.every((r) => r[k] === null || r[k] === undefined || typeof r[k] !== 'object'))
  return ['id', ...scalar.filter((k) => k !== 'id')].slice(0, 6)
}

function table(rows, cols) {
  const width = Math.max(12, Math.floor((process.stdout.columns || 120) / cols.length) - 2)
  const w = cols.map((c) => Math.min(width, Math.max(c.length, ...rows.map((r) => cell(r[c]).length))))
  const line = (vals) => vals.map((v, i) => short(v, w[i]).padEnd(w[i])).join('  ')
  say(bold(line(cols)))
  for (const r of rows) say(line(cols.map((c) => cell(r[c]))))
}

export async function data({ store, id, where, search, fields = '', limit = 20, sort, asc = false, json = false, asCsv = false, url, project, env, token } = {}) {
  const { base, projectId } = resolveTarget({ url, project, env })
  const { bearer } = await resolveCredential({ base, token })
  const root = `/api/v1/projects/${encodeURIComponent(projectId)}/stores`

  if (!store) {
    const body = await get(base, bearer, root)
    const rows = []
    for (const s of body.stores ?? []) {
      const page = await get(base, bearer, `${root}/${encodeURIComponent(s.name)}/records?page=1&pageSize=1`).catch(() => ({}))
      rows.push({ store: s.name, rows: page.total ?? '?', columns: (s.shape?.columns ?? []).map((c) => c.name).join(', ') })
    }
    if (json) return void process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
    say(`${bold('stores')} ${dim(projectId)}`)
    if (!rows.length) say(dim('  (none)'))
    else table(rows, ['store', 'rows', 'columns'])
    return rows
  }

  if (id) {
    const body = await get(base, bearer, `${root}/${encodeURIComponent(store)}/records/${encodeURIComponent(id)}`)
    process.stdout.write(`${JSON.stringify(body.record ?? body.data ?? body, null, 2)}\n`)
    return body
  }

  const fieldList = String(fields).split(',').map((s) => s.trim()).filter(Boolean)
  const qs = new URLSearchParams({ page: '1', pageSize: String(Math.max(1, Number(limit) || 20)) })
  if (search) qs.set('q', String(search))
  const filter = parseWhere(where)
  if (Object.keys(filter).length) qs.set('filter', JSON.stringify(filter))
  // Newest first unless told otherwise: the framework stamps every row's createdAt.
  qs.set('sort', sort || 'createdAt')
  qs.set('dir', asc ? 'asc' : 'desc')
  if (fieldList.length) qs.set('fields', fieldList.join(','))
  const body = await get(base, bearer, `${root}/${encodeURIComponent(store)}/records?${qs}`)
  const rows = (body.items ?? []).slice(0, Number(limit) || 20)
  if (json) return void process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
  const cols = columnsFor(rows, fieldList)
  if (asCsv) return void process.stdout.write(`${csv(rows, cols)}\n`)
  say(`${bold(store)} ${dim(`${projectId} · ${rows.length} of ${body.total ?? rows.length}`)}`)
  if (!rows.length) say(dim('  (no rows)'))
  else table(rows, cols)
  return rows
}
