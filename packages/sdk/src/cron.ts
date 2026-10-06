/**
 * Cron — runtime schedules managed from code (`ctx.server.cron`).
 *
 * Deploy-time cron comes from `morgana.config.ts` hooks (`on: 'cron(…)'`) and
 * is replaced on every deploy. Runtime entries are owned by the caller that
 * scheduled them: they survive until cancelled or overwritten, and a deploy
 * does not touch them (they live under a separate `triggers:rt:` namespace
 * on the worker for exactly this reason).
 *
 * Granularity is one minute — the worker's scheduled tick. Sub-minute waits
 * (`for: '90s'` on a sheet column) are one-shot DO alarms, not cron entries.
 */

export interface CronScheduleSpec {
  /** 5-field cron (`* * * * *`) or `second-N`. Minute granularity. */
  cron: string
  /** Deployed action to run on each fire. */
  run: string
  params?: Record<string, unknown>
  enabled?: boolean
}

export interface CronSchedule extends CronScheduleSpec {
  name: string
}

export interface CronHandle {
  /** Create or overwrite a runtime schedule. Invalid expressions throw. */
  schedule(name: string, spec: CronScheduleSpec): Promise<CronSchedule>
  /** Remove a runtime schedule. False when there was none. */
  cancel(name: string): Promise<boolean>
  /** Every runtime schedule, by name. */
  list(): Promise<CronSchedule[]>
}

function fieldOk(field: string): boolean {
  if (field === '*' || field === '?') return true
  // `*/15`, `5-30/5`, `5`, `5-30` — the grammar cronMatches evaluates.
  return field.split(',').every((part) => /^(\*|\d+(-\d+)?)(\/\d+)?$/.test(part))
}

/**
 * True for `second-N` and well-formed 5-field expressions. Mirrors the
 * worker's validator (triggers.ts) — same grammar both sides, so an entry
 * accepted here is never rejected there.
 */
export function isValidCronExpression(expr: unknown): boolean {
  if (typeof expr !== 'string') return false
  const e = expr.trim()
  const sec = /^second-(\d+)$/i.exec(e)
  if (sec) return Number(sec[1]) >= 1
  const parts = e.split(/\s+/).filter(Boolean)
  if (parts.length !== 5) return false
  return parts.every(fieldOk)
}
