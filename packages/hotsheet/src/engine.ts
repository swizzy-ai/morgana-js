/**
 * Hotsheet engine — the pure spreadsheet-metaphor core.
 *
 * Everything is a column. A column is `when` (predicate) + `for` (optional
 * wait) + `do` (executor whose return value becomes the cell value). `do`
 * alone with no `when` is the unconditional calc — there is no separate
 * `formula` mechanism. Formulas and `do` blocks receive `(row, ctx)` so any
 * cell can read any sheet without circular imports.
 *
 * The engine outputs an objective stream of row/cell/column/sheet changes and
 * nothing else. It has no storage of its own: persistence arrives through
 * `StorageAdapter`, time through `now()`, ids through `makeId()`. Same engine,
 * every environment.
 */

export enum Types {
  String = 'String',
  Number = 'Number',
  Boolean = 'Boolean',
  Timestamp = 'Timestamp',
  JSON = 'JSON',
}

export const HotsheetEvents = {
  ROW_ADDED: 'ROW_ADDED',
  CELL_UPDATED: 'CELL_UPDATED',
  ROW_REMOVED: 'ROW_REMOVED',
  COLUMN_ADDED: 'COLUMN_ADDED',
  COLUMN_UPDATED: 'COLUMN_UPDATED',
  COLUMN_REMOVED: 'COLUMN_REMOVED',
  SHEET_CREATED: 'SHEET_CREATED',
  SHEET_REMOVED: 'SHEET_REMOVED',
} as const

export type HotsheetEventType = (typeof HotsheetEvents)[keyof typeof HotsheetEvents]

export type RawStreamEvent =
  | { type: typeof HotsheetEvents.ROW_ADDED; sheet: string; rowId: string; row: unknown }
  | { type: typeof HotsheetEvents.CELL_UPDATED; sheet: string; rowId: string; column: string; value: unknown }
  | { type: typeof HotsheetEvents.ROW_REMOVED; sheet: string; rowId: string }
  | { type: typeof HotsheetEvents.COLUMN_ADDED; sheet: string; column: string; def: unknown }
  | { type: typeof HotsheetEvents.COLUMN_UPDATED; sheet: string; column: string; def: unknown }
  | { type: typeof HotsheetEvents.COLUMN_REMOVED; sheet: string; column: string }
  | { type: typeof HotsheetEvents.SHEET_CREATED; sheet: string }
  | { type: typeof HotsheetEvents.SHEET_REMOVED; sheet: string }

export interface StorageAdapter {
  get(sheet: string, rowId: string): Promise<Record<string, unknown> | null>
  set(sheet: string, rowId: string, row: Record<string, unknown>): Promise<void>
  list(sheet: string): Promise<Array<Record<string, unknown> & { id: string }>>
  del(sheet: string, rowId: string): Promise<void>
}

export interface EngineOpts {
  storage: StorageAdapter
  /** Injected clock — tests fix it, cloud passes Date.now. */
  now?: () => number
  /** Injected ids — deterministic in tests, KSUID/UUID in cloud. */
  makeId?: () => string
  onEvent?: (e: RawStreamEvent) => void | Promise<void>
  /**
   * How a stored (string) behaviour runs HERE. Absent + string behaviour =
   * a loud error, not a silent skip: a behaviour with no bridge is a wiring
   * bug, and an empty cell that should have fired is the failure this engine
   * refuses to produce quietly. Dev passes nothing (functions run directly);
   * cloud passes `(ref, row) => actions.run(ref.behaviour, …)`.
   */
  invoke?: (ref: BehaviorRef, row: Record<string, unknown>) => unknown | Promise<unknown>
  /**
   * Reserved escape hatch. Single-visit evaluation needs no pass cap, but if
   * chaining is ever reintroduced this is where the bound lives. Unused by
   * evaluateRow today.
   */
  maxPasses?: number
}

/**
 * A column behaviour — either a real function (in-process: Node, tests,
 * compile lane) or a name (stored as data; executed through `invoke`, e.g. a
 * deployed action in cloud). One column, two homes; the resolver below is the
 * only place that tells them apart.
 */
export type Behavior<TRow, T> =
  | string
  | ((row: TRow, ctx: SheetContext) => T | Promise<T>)

export interface BehaviorRef {
  sheet: string
  column: string
  kind: 'when' | 'do'
  /** The stored behaviour name. */
  behaviour: string
}

export interface SheetContext {
  sheet<T = Record<string, unknown>>(name: string): SheetAPI<T>
}

export interface SheetAPI<T = Record<string, unknown>> {
  getRow(rowId: string): Promise<T | null>
  getAllRows(): Promise<T[]>
  appendRows(rows: Array<Partial<T>>): Promise<string[]>
  updateRow(rowId: string, data: Partial<T>): Promise<void>
  deleteRow(rowId: string): Promise<void>
}

export interface ColumnDef<TRow, TReturn> {
  type: Types
  /**
   * Predicate. Absent means always — `do` alone is the unconditional calc, so
   * plain derivations never need a tautology. A string names a stored
   * behaviour (executed via `invoke`); a function runs in-process.
   */
  when?: Behavior<TRow, boolean>
  /** Wait, e.g. '48h': fire only if still true when due. Drained by the host. */
  for?: string
  /** Executor — its return value becomes the cell value. String or function. */
  do?: Behavior<TRow, TReturn>
  /**
   * Opt-in dependency declaration (e.g. deps: ['lastLogin', 'planType']). The
   * engine only re-evaluates columns whose deps intersect the write's dirty
   * set. Undeclared = always visited (safe fallback).
   */
  deps?: string[]
}

export class Sheet<TRow extends Record<string, unknown> = Record<string, unknown>> {
  public columns = new Map<string, ColumnDef<any, any>>()

  constructor(public readonly name: string) {}

  column<K extends string, TReturn>(
    name: K,
    def: ColumnDef<TRow, TReturn>,
  ): Sheet<TRow & Record<K, TReturn>> {
    this.columns.set(name, def as ColumnDef<any, any>)
    return this as unknown as Sheet<TRow & Record<K, TReturn>>
  }
}

/** Parse '48h'/'15m' durations. One parser for dev timers and cloud alarms. */
export function parseDuration(s: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(s.trim())
  if (!m) throw new Error(`Bad duration ${JSON.stringify(s)} — expected e.g. '48h', '15m'`)
  const n = Number(m[1])
  const unit = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] as string]!
  return n * unit
}

export interface DueEntry {
  sheet: string
  rowId: string
  column: string
  runAt: number
}

export class Engine implements SheetContext {
  private sheets = new Map<string, Sheet<Record<string, unknown>>>()
  /**
   * Cells currently being evaluated (sheet:row:column). A `do` may write to
   * other rows/sheets, which triggers a NESTED reactive pass — without this
   * guard the nested pass would re-enter the still-empty cell and recurse
   * until the heap blows. Nested passes skip active cells; the outer pass
   * fills them when their `do` returns. Same rule as locks: whoever started
   * the cell finishes it.
   */
  private active = new Set<string>()
  /**
   * Plain data, not timers: timers don't survive a DO eviction. The host
   * persists the queue (cloud alongside the record, dev via setTimeout) and
   * re-checks `when` at due time.
   */
  private due: DueEntry[] = []

  constructor(private opts: EngineOpts) {}

  register(sheet: Sheet<Record<string, unknown>>): void {
    const isNew = !this.sheets.has(sheet.name)
    this.sheets.set(sheet.name, sheet)
    if (isNew) void this.opts.onEvent?.({ type: HotsheetEvents.SHEET_CREATED, sheet: sheet.name })
  }

  dropSheet(name: string): void {
    if (this.sheets.delete(name)) {
      void this.opts.onEvent?.({ type: HotsheetEvents.SHEET_REMOVED, sheet: name })
    }
  }

  /**
   * Restore persisted `for` waits (e.g. loaded from an instance record after
   * a restart or DO eviction). Entries for unknown sheets/columns are kept —
   * the schema may arrive after the queue — and skipped at drain time.
   */
  restoreDue(entries: DueEntry[]): void {
    for (const e of entries ?? []) {
      if (e && typeof e.sheet === 'string' && typeof e.rowId === 'string' && typeof e.column === 'string') {
        this.due.push({ sheet: e.sheet, rowId: e.rowId, column: e.column, runAt: Number(e.runAt) || 0 })
      }
    }
  }

  /**
   * The one place functions and stored behaviours part ways. A function runs
   * here; a string goes through `invoke` (cloud: a deployed action). A string
   * with no bridge throws — a behaviour that can never run must fail at the
   * write, not sit empty forever.
   */
  private runBehaviour(
    sheet: string,
    column: string,
    kind: 'when' | 'do',
    behaviour: unknown,
    row: Record<string, unknown>,
  ): unknown | Promise<unknown> {
    if (typeof behaviour === 'function') {
      return (behaviour as (row: Record<string, unknown>, ctx: SheetContext) => unknown)(row, this)
    }
    if (typeof behaviour === 'string') {
      if (!this.opts.invoke) {
        throw new Error(`[hotsheet] column "${column}" on sheet "${sheet}" names behaviour "${behaviour}" but this host provides no invoke bridge`)
      }
      return this.opts.invoke({ sheet, column, kind, behaviour }, row)
    }
    return undefined
  }

  /** Columns are schema — every change emits so grids and triggers stay in sync. */
  addColumn(sheetName: string, column: string, def: ColumnDef<Record<string, unknown>, unknown>): void {
    const sheet = this.sheets.get(sheetName)
    if (!sheet) throw new Error(`[hotsheet] sheet "${sheetName}" is not registered`)
    const existed = sheet.columns.has(column)
    sheet.columns.set(column, def as ColumnDef<any, any>)
    void this.opts.onEvent?.({
      type: existed ? HotsheetEvents.COLUMN_UPDATED : HotsheetEvents.COLUMN_ADDED,
      sheet: sheetName,
      column,
      def,
    })
  }

  dropColumn(sheetName: string, column: string): void {
    if (this.sheets.get(sheetName)?.columns.delete(column)) {
      void this.opts.onEvent?.({ type: HotsheetEvents.COLUMN_REMOVED, sheet: sheetName, column })
    }
  }

  sheet<T = Record<string, unknown>>(name: string): SheetAPI<T> {
    const storage = this.opts.storage
    const emit = this.opts.onEvent
    const fire = (e: RawStreamEvent): void => void emit?.(e)
    const self = this
    return {
      getRow: (rowId) => storage.get(name, rowId) as Promise<T | null>,
      getAllRows: () => storage.list(name) as Promise<T[]>,
      appendRows: async (rows) => {
        const ids: string[] = []
        const dirty = new Set<string>()
        for (const row of rows) {
          const rowId = self.opts.makeId?.() ?? `row_${Date.now().toString(36)}_${ids.length}`
          const full = { ...(row as object), id: rowId } as Record<string, unknown>
          await storage.set(name, rowId, full)
          fire({ type: HotsheetEvents.ROW_ADDED, sheet: name, rowId, row: full })
          for (const key of Object.keys(row as object)) dirty.add(key)
          ids.push(rowId)
        }
        // One reactive pass over the whole instance (not per row): a write
        // can fill cells in other rows and sheets, and those fills cascade.
        await self.evaluateAffected([...dirty])
        return ids
      },
      updateRow: async (rowId, data) => {
        const existing = (await storage.get(name, rowId)) ?? {}
        const updated = { ...existing, ...(data as object) }
        await storage.set(name, rowId, updated)
        for (const [key, value] of Object.entries(data as object)) {
          fire({ type: HotsheetEvents.CELL_UPDATED, sheet: name, rowId, column: key, value })
        }
        await self.evaluateAffected(Object.keys(data as object))
      },
      deleteRow: async (rowId) => {
        await storage.del(name, rowId)
        fire({ type: HotsheetEvents.ROW_REMOVED, sheet: name, rowId })
      },
    }
  }

  /**
   * Index-driven, single read + single write. One storage get, visit only
   * columns whose deps intersect `dirty` (undeclared deps always visited),
   * one set iff something changed. Returns what filled so a caller can extend
   * a cascade across rows and sheets.
   */
  async evaluateRow(
    sheetName: string,
    rowId: string,
    dirty?: string[],
  ): Promise<{ changed: boolean; filled: string[] }> {
    const def = this.sheets.get(sheetName)
    if (!def) return { changed: false, filled: [] }
    const storage = this.opts.storage
    const now = this.opts.now?.() ?? Date.now()
    const row = await storage.get(sheetName, rowId)
    if (!row) return { changed: false, filled: [] }
    const isDirty = (deps?: string[]): boolean => {
      if (!dirty) return true
      if (!deps) return true
      return deps.some((d) => dirty.includes(d))
    }
    let changed = false
    const filled: string[] = []
    const touch = (col: string, value: unknown): void => {
      if (JSON.stringify(value) !== JSON.stringify(row[col])) {
        row[col] = value
        changed = true
        filled.push(col)
        void this.opts.onEvent?.({ type: HotsheetEvents.CELL_UPDATED, sheet: sheetName, rowId, column: col, value })
      }
    }
    for (const [col, cdef] of def.columns) {
      const c = cdef as ColumnDef<Record<string, unknown>, unknown>
      if (c.do === undefined || row[col] !== undefined || !isDirty(c.deps)) continue
      const cellKey = `${sheetName}:${rowId}:${col}`
      // Reentrant writes (a `do` updating another row/sheet triggers a nested
      // pass) must not re-enter this cell while its `do` is still running.
      if (this.active.has(cellKey)) continue
      // Bridge check BEFORE the predicate try/catch: a stored behaviour with
      // no invoke bridge is a wiring bug, not a data error, so it must throw
      // rather than be swallowed as a false `when`.
      if ((typeof c.when === 'string' || typeof c.do === 'string') && !this.opts.invoke) {
        const missing = typeof c.when === 'string' ? c.when : (c.do as string)
        throw new Error(`[hotsheet] column "${col}" on sheet "${sheetName}" names behaviour "${missing}" but this host provides no invoke bridge`)
      }
      this.active.add(cellKey)
      try {
        let fireIt = false
        try {
          fireIt = c.when === undefined ? true : !!(await this.runBehaviour(sheetName, col, 'when', c.when, row))
        } catch {
          fireIt = false
        }
        if (!fireIt) continue
        if (c.for) {
          this.due.push({ sheet: sheetName, rowId, column: col, runAt: now + parseDuration(c.for) })
        } else {
          touch(col, await this.runBehaviour(sheetName, col, 'do', c.do, row))
        }
      } finally {
        this.active.delete(cellKey)
      }
    }
    if (changed) await storage.set(sheetName, rowId, row)
    return { changed, filled }
  }

  /**
   * The reactive pass: after a write, re-check every unfilled `when` cell in
   * the instance whose column *might* read a dirty column, then repeat with
   * what newly filled until nothing new fills or the budget trips.
   *
   * Matching is by column NAME across all sheets and rows (a `deps` entry
   * narrows same-row visits; undeclared deps always visit). Name matching can
   * over-visit — an unrelated same-named column gets its `when` re-checked —
   * but never wrong-fills: `when` decides, and a filled cell never revisits.
   * Fill-once is what terminates the cascade; the budget is the backstop.
   */
  async evaluateAffected(
    dirtyColumns: string[] = [],
    opts?: { budget?: number },
  ): Promise<{ evaluated: number; filled: number }> {
    const budget = opts?.budget ?? 1000
    let evaluated = 0
    let filled = 0
    const dirty = new Set(dirtyColumns)
    for (;;) {
      let changed = false
      for (const sheetName of [...this.sheets.keys()]) {
        const rows = await this.opts.storage.list(sheetName)
        for (const row of rows) {
          if (evaluated >= budget) {
            throw new Error(
              `[hotsheet] cascade budget exceeded (${budget} evaluations) — a cycle of rules filling rules`,
            )
          }
          const r = await this.evaluateRow(sheetName, row.id, [...dirty])
          evaluated += 1
          if (r.changed) {
            changed = true
            filled += r.filled.length
            for (const col of r.filled) dirty.add(col)
          }
        }
      }
      if (!changed) return { evaluated, filled }
    }
  }

  /** The host drains this — dev via setTimeout, cloud via alarms. */
  dueQueue(): DueEntry[] {
    return [...this.due].sort((a, b) => a.runAt - b.runAt)
  }

  /**
   * Re-check overdue `for` entries: re-evaluates `when` now, runs `do` only if
   * still true. Returns the columns that fired.
   */
  async drainDue(now?: number): Promise<DueEntry[]> {
    const at = now ?? this.opts.now?.() ?? Date.now()
    const ready = this.due.filter((d) => d.runAt <= at)
    this.due = this.due.filter((d) => d.runAt > at)
    const fired: DueEntry[] = []
    for (const d of ready) {
      const def = this.sheets.get(d.sheet)
      const row = await this.opts.storage.get(d.sheet, d.rowId)
      const c = def?.columns.get(d.column) as ColumnDef<Record<string, unknown>, unknown> | undefined
      if (!def || !row || c?.do === undefined) continue
      if ((typeof c.when === 'string' || typeof c.do === 'string') && !this.opts.invoke) {
        throw new Error(`[hotsheet] column "${d.column}" on sheet "${d.sheet}" names a behaviour but this host provides no invoke bridge`)
      }
      let still = false
      try {
        still = c.when === undefined ? true : !!(await this.runBehaviour(d.sheet, d.column, 'when', c.when, row))
      } catch {
        still = false
      }
      if (!still || row[d.column] !== undefined) continue
      // Same reentrancy guard as evaluateRow: the `do` may write, and the
      // nested pass must not re-enter this cell while it runs.
      const cellKey = `${d.sheet}:${d.rowId}:${d.column}`
      if (this.active.has(cellKey)) continue
      this.active.add(cellKey)
      let v: unknown
      try {
        v = await this.runBehaviour(d.sheet, d.column, 'do', c.do, row)
      } finally {
        this.active.delete(cellKey)
      }
      row[d.column] = v as unknown
      await this.opts.storage.set(d.sheet, d.rowId, row)
      void this.opts.onEvent?.({ type: HotsheetEvents.CELL_UPDATED, sheet: d.sheet, rowId: d.rowId, column: d.column, value: v })
      fired.push(d)
    }
    return fired
  }
}
