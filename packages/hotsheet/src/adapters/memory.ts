/**
 * In-memory storage + deterministic test helpers for the hotsheet engine.
 *
 * The memory adapter is what compile/dev use. Cloud passes its own adapter
 * over DO storage — same interface, no engine changes.
 */
import type { StorageAdapter } from '../engine'

export function createMemoryStorage(): StorageAdapter & { clear(): void } {
  const data = new Map<string, Map<string, Record<string, unknown>>>()
  const table = (sheet: string): Map<string, Record<string, unknown>> => {
    let t = data.get(sheet)
    if (!t) {
      t = new Map()
      data.set(sheet, t)
    }
    return t
  }
  return {
    get: async (sheet, rowId) => table(sheet).get(rowId) ?? null,
    set: async (sheet, rowId, row) => void table(sheet).set(rowId, row),
    list: async (sheet) => [...(data.get(sheet)?.values() ?? [])] as Array<Record<string, unknown> & { id: string }>,
    del: async (sheet, rowId) => void table(sheet).delete(rowId),
    clear: () => data.clear(),
  }
}

/** Fixed clock for tests — advance it manually with `tick`. */
export function createTestClock(start = 1_000_000): { now: () => number; tick: (ms: number) => void } {
  let t = start
  return { now: () => t, tick: (ms: number) => void (t += ms) }
}

/** Counter ids (`row_1`, `row_2`, …) — deterministic, collision-free per instance. */
export function createCounterIds(prefix = 'row'): () => string {
  let n = 0
  return () => `${prefix}_${++n}`
}
