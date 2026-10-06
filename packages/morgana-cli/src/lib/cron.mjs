/**
 * Cron scheduler — runtime schedules for the local host (`morgana dev`,
 * demo `server.mjs`).
 *
 * Same `CronHandle` shape as `ctx.server.cron` in cloud
 * (`schedule`/`cancel`/`list`), same grammar (`second-N`, 5-field cron, minute
 * granularity). Specs persist to `<dataDir>/crons.json` so a restart keeps
 * them; the tick is a 1s interval (unref'd, so it never holds the process
 * open) that fires due entries through the injected `runAction` — the same
 * dispatcher actions use, so a scheduled run behaves exactly like a manual one.
 *
 * Like the ChannelHub, the scheduler is created once per host process and
 * passed in via opts — two schedulers would mean a schedule that never fires,
 * which is the bug this replaces.
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * True for `second-N` and well-formed 5-field expressions. Mirrors the SDK
 * validator and the worker's `isValidCronExpression` — same grammar on all
 * three, so an entry accepted here is never refused there.
 */
export function isValidCronExpression(expr) {
  if (typeof expr !== 'string') return false
  const e = expr.trim()
  const sec = /^second-(\d+)$/i.exec(e)
  if (sec) return Number(sec[1]) >= 1
  const parts = e.split(/\s+/).filter(Boolean)
  if (parts.length !== 5) return false
  return parts.every(fieldOk)
}

function fieldOk(field) {
  if (field === '*' || field === '?') return true
  return field.split(',').every((part) => /^(\*|\d+(-\d+)?)(\/\d+)?$/.test(part))
}

function fieldMatch(field, value) {
  if (field === '*' || field === '?') return true
  for (const part of field.split(',')) {
    let range = part
    let step = 1
    if (range.includes('/')) {
      const [r, s] = range.split('/')
      range = r
      step = Number.parseInt(s, 10) || 1
    }
    if (range === '*') {
      if (value % step === 0) return true
      continue
    }
    const m = /^(\d+)(?:-(\d+))?$/.exec(range)
    if (m) {
      const lo = Number.parseInt(m[1], 10)
      const hi = m[2] ? Number.parseInt(m[2], 10) : lo
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true
    }
  }
  return false
}

/** True when the expression fires at `date` (UTC). Exported for tests. */
export function cronMatchesAt(expression, date) {
  const e = String(expression ?? '').trim()
  const sec = /^second-(\d+)$/i.exec(e)
  if (sec) return date.getUTCSeconds() % Math.max(1, Number.parseInt(sec[1], 10)) === 0
  const parts = e.split(/\s+/).filter(Boolean)
  if (parts.length !== 5) return false
  return (
    fieldMatch(parts[0], date.getUTCMinutes()) &&
    fieldMatch(parts[1], date.getUTCHours()) &&
    fieldMatch(parts[2], date.getUTCDate()) &&
    fieldMatch(parts[3], date.getUTCMonth() + 1) &&
    fieldMatch(parts[4], date.getUTCDay())
  )
}

function checkName(name) {
  if (!name || typeof name !== 'string') throw new Error('ctx.server.cron requires a schedule name')
  if (name.startsWith(':')) throw new Error(`schedule "${name}" may not start with ":"`)
  if (name.includes('::')) throw new Error(`schedule "${name}" may not contain "::"`)
  return name
}

export class CronScheduler {
  constructor({ runAction, persistFile } = {}) {
    this.runAction =
      runAction ??
      (async () => {
        throw new Error('no action dispatcher is wired into this scheduler')
      })
    this.persistFile = persistFile ?? null
    this.specs = new Map()
    this.timer = null
    // One fire per matching instant: without this a 1s tick fires `second-1`
    // once (fine) but a slow tick could double-fire a minute match.
    this.lastFire = new Map()
    if (this.persistFile) {
      try {
        const raw = fs.readFileSync(this.persistFile, 'utf8')
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          for (const s of arr) {
            if (s && typeof s.name === 'string' && isValidCronExpression(s.cron) && typeof s.run === 'string') {
              this.specs.set(s.name, {
                name: s.name,
                cron: s.cron,
                run: s.run,
                params: s.params,
                enabled: s.enabled !== false,
              })
            }
          }
        }
      } catch {
        // Missing or corrupt file means no schedules — same as a fresh host.
      }
    }
  }

  #save() {
    if (!this.persistFile) return
    fs.mkdirSync(path.dirname(this.persistFile), { recursive: true })
    fs.writeFileSync(this.persistFile, JSON.stringify([...this.specs.values()], null, 2))
  }

  async schedule(name, spec) {
    const key = checkName(name)
    if (!spec || typeof spec !== 'object') throw new Error(`schedule "${key}" needs { cron, run }`)
    if (!isValidCronExpression(spec.cron)) {
      throw new Error(`schedule "${key}" has a bad cron expression ${JSON.stringify(spec.cron)} — expected 5-field cron or second-N (e.g. '* * * * *')`)
    }
    if (!spec.run || typeof spec.run !== 'string') {
      throw new Error(`schedule "${key}" needs a deployed action name in "run"`)
    }
    const entry = { name: key, cron: spec.cron, run: spec.run, params: spec.params, enabled: spec.enabled !== false }
    this.specs.set(key, entry)
    this.#save()
    return entry
  }

  async cancel(name) {
    const key = checkName(name)
    if (!this.specs.has(key)) return false
    this.specs.delete(key)
    this.lastFire.delete(key)
    this.#save()
    return true
  }

  async list() {
    return [...this.specs.values()]
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(new Date()), 1000)
    // Never hold the process open for tests or one-shot runs.
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Evaluate every entry against `now`, firing matches. Public for tests. */
  async tick(now) {
    const at = now ?? new Date()
    for (const spec of this.specs.values()) {
      if (spec.enabled === false) continue
      if (!cronMatchesAt(spec.cron, at)) continue
      // One fire per matching instant at the entry's own granularity: a 1s
      // tick would otherwise fire a minute entry sixty times per minute.
      const granular = /^second-(\d+)$/i.test(String(spec.cron).trim())
      const key = granular ? Math.floor(at.getTime() / 1000) : Math.floor(at.getTime() / 60000)
      if (this.lastFire.get(spec.name) === key) continue
      this.lastFire.set(spec.name, key)
      try {
        await this.runAction(spec.run, spec.params ?? {})
      } catch (err) {
        // A failing scheduled run must not take the tick down with it —
        // every other entry still fires on time.
        console.error(`[morgana] cron "${spec.name}" failed:`, err?.message ?? err)
      }
    }
  }
}
