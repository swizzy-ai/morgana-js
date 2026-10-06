import { describe, expect, it, vi } from 'vitest'
import {
  Engine,
  HotsheetEvents,
  Sheet,
  Types,
  parseDuration,
  type BehaviorRef,
  type RawStreamEvent,
} from '../engine'
import { createCounterIds, createMemoryStorage, createTestClock } from '../adapters/memory'

function setup() {
  const events: RawStreamEvent[] = []
  const storage = createMemoryStorage()
  const clock = createTestClock()
  const engine = new Engine({
    storage,
    now: clock.now,
    makeId: createCounterIds('r'),
    onEvent: (e) => void events.push(e),
  })
  return { engine, events, storage, clock }
}

describe('hotsheet engine', () => {
  it('emits SHEET_CREATED on first register only', () => {
    const { engine, events } = setup()
    engine.register(new Sheet('Customers'))
    engine.register(new Sheet('Customers'))
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'SHEET_CREATED', sheet: 'Customers' })
  })

  it('do alone is the unconditional calc', async () => {
    const { engine } = setup()
    engine.register(
      new Sheet('T')
        .column('a', { type: Types.Number })
        .column('double', { type: Types.Number, deps: ['a'], do: (row) => (row.a as number) * 2 }),
    )
    const [id] = await engine.sheet('T').appendRows([{ a: 21 }])
    expect((await engine.sheet('T').getRow(id!))?.double).toBe(42)
  })

  it('when gates do, and false leaves the cell empty', async () => {
    const { engine } = setup()
    engine.register(
      new Sheet('T')
        .column('plan', { type: Types.String })
        .column('proposal', {
          type: Types.JSON,
          deps: ['plan'],
          when: (row) => row.plan === 'Pro',
          do: () => ({ action: 'SEND_DISCOUNT' }),
        }),
    )
    const [free] = await engine.sheet('T').appendRows([{ plan: 'Free' }])
    const [pro] = await engine.sheet('T').appendRows([{ plan: 'Pro' }])
    expect((await engine.sheet('T').getRow(free!))?.proposal).toBeUndefined()
    expect((await engine.sheet('T').getRow(pro!))?.proposal).toEqual({ action: 'SEND_DISCOUNT' })
  })

  it('do can write cross-sheet rows', async () => {
    const { engine } = setup()
    engine.register(new Sheet('Escalations').column('reason', { type: Types.String }))
    engine.register(
      new Sheet('Customers')
        .column('status', { type: Types.String })
        .column('escalated', {
          type: Types.String,
          deps: ['status'],
          when: (row) => row.status === 'FAILED',
          do: (row, ctx) => {
            void ctx.sheet('Escalations').appendRows([{ reason: 'failed' }])
            return 'ESCALATED'
          },
        }),
    )
    await engine.sheet('Customers').appendRows([{ status: 'FAILED' }])
    expect(await engine.sheet('Escalations').getAllRows()).toHaveLength(1)
  })

  it('for queues instead of executing, drainDue fires when still true', async () => {
    const { engine, clock } = setup()
    engine.register(
      new Sheet('T')
        .column('idle', { type: Types.Boolean })
        .column('nudge', {
          type: Types.String,
          deps: ['idle'],
          when: (row) => row.idle === true,
          for: '48h',
          do: () => 'NUDGED',
        }),
    )
    const [id] = await engine.sheet('T').appendRows([{ idle: true }])
    expect((await engine.sheet('T').getRow(id!))?.nudge).toBeUndefined()
    expect(engine.dueQueue()).toHaveLength(1)
    clock.tick(49 * 3600_000)
    const fired = await engine.drainDue()
    expect(fired).toHaveLength(1)
    expect((await engine.sheet('T').getRow(id!))?.nudge).toBe('NUDGED')
  })

  it('drainDue skips when no longer true', async () => {
    const { engine, clock } = setup()
    engine.register(
      new Sheet('T')
        .column('idle', { type: Types.Boolean })
        .column('nudge', {
          type: Types.String,
          deps: ['idle'],
          when: (row) => row.idle === true,
          for: '1h',
          do: () => 'NUDGED',
        }),
    )
    const [id] = await engine.sheet('T').appendRows([{ idle: true }])
    await engine.sheet('T').updateRow(id!, { idle: false })
    clock.tick(2 * 3600_000)
    expect(await engine.drainDue()).toHaveLength(0)
    expect((await engine.sheet('T').getRow(id!))?.nudge).toBeUndefined()
  })

  it('deps limit evaluation to dirty columns', async () => {
    const { engine } = setup()
    const expensive = vi.fn((row: Record<string, unknown>) => row.a)
    engine.register(
      new Sheet('T')
        .column('a', { type: Types.Number })
        .column('b', { type: Types.Number })
        .column('fromA', { type: Types.Number, deps: ['a'], do: expensive }),
    )
    const [id] = await engine.sheet('T').appendRows([{ a: 1, b: 2 }])
    const callsAfterAppend = expensive.mock.calls.length
    await engine.sheet('T').updateRow(id!, { b: 3 })
    // fromA filled on append; updating unrelated b must not re-run it.
    expect(expensive.mock.calls.length).toBe(callsAfterAppend)
  })

  it('compare-before-write suppresses phantom traffic', async () => {
    const { engine, events } = setup()
    engine.register(
      new Sheet('T')
        .column('a', { type: Types.Number })
        .column('steady', { type: Types.Number, deps: ['a'], do: () => 7 }),
    )
    const [id] = await engine.sheet('T').appendRows([{ a: 1 }])
    const cellEvents = events.filter((e) => e.type === 'CELL_UPDATED' && (e as { column: string }).column === 'steady')
    expect(cellEvents).toHaveLength(1)
    await engine.sheet('T').updateRow(id!, { a: 2 })
    expect(events.filter((e) => e.type === 'CELL_UPDATED' && (e as { column: string }).column === 'steady')).toHaveLength(1)
  })

  it('column ops emit column streams', () => {
    const { engine, events } = setup()
    engine.register(new Sheet('T'))
    engine.addColumn('T', 'age', { type: Types.Number })
    engine.dropColumn('T', 'age')
    expect(events.map((e) => e.type)).toEqual([
      HotsheetEvents.SHEET_CREATED,
      HotsheetEvents.COLUMN_ADDED,
      HotsheetEvents.COLUMN_REMOVED,
    ])
  })

  it('deleteRow emits ROW_REMOVED', async () => {
    const { engine, events } = setup()
    engine.register(new Sheet('T'))
    const [id] = await engine.sheet('T').appendRows([{}])
    await engine.sheet('T').deleteRow(id!)
    expect(events.at(-1)).toEqual({ type: 'ROW_REMOVED', sheet: 'T', rowId: id })
  })

  it('parseDuration rejects garbage', () => {
    expect(() => parseDuration('soon')).toThrow()
    expect(parseDuration('48h')).toBe(48 * 3600_000)
  })

  it('string behaviours run through invoke, with sheet/column/kind refs', async () => {
    const calls: Array<{ ref: BehaviorRef; row: unknown }> = []
    const storage = createMemoryStorage()
    const engine = new Engine({
      storage,
      makeId: createCounterIds('r'),
      invoke: async (ref, row) => {
        calls.push({ ref, row: { ...row } })
        if (ref.kind === 'when') return (row as { plan: string }).plan === 'Pro'
        return { action: 'SEND_DISCOUNT' }
      },
    })
    engine.register(
      new Sheet('T')
        .column('plan', { type: Types.String })
        .column('proposal', { type: Types.JSON, deps: ['plan'], when: 'checkPlan', do: 'makeProposal' }),
    )
    const [pro] = await engine.sheet('T').appendRows([{ plan: 'Pro' }])
    const [free] = await engine.sheet('T').appendRows([{ plan: 'Free' }])
    expect((await engine.sheet('T').getRow(pro!))?.proposal).toEqual({ action: 'SEND_DISCOUNT' })
    expect((await engine.sheet('T').getRow(free!))?.proposal).toBeUndefined()
    expect(calls[0]!.ref).toMatchObject({ sheet: 'T', column: 'proposal', kind: 'when', behaviour: 'checkPlan' })
    expect(calls.find((c) => c.ref.kind === 'do')?.ref.behaviour).toBe('makeProposal')
  })

  it('a stored behaviour with no bridge fails loudly, not silently empty', async () => {
    const { engine } = setup()
    engine.register(
      new Sheet('T')
        .column('a', { type: Types.Number })
        .column('b', { type: Types.Number, deps: ['a'], do: 'missingBridge' }),
    )
    await expect(engine.sheet('T').appendRows([{ a: 1 }])).rejects.toThrow(/no invoke bridge/)
  })

  it('functions and names mix in one sheet', async () => {
    const storage = createMemoryStorage()
    const engine = new Engine({
      storage,
      makeId: createCounterIds('r'),
      invoke: async () => 99,
    })
    engine.register(
      new Sheet('T')
        .column('a', { type: Types.Number })
        .column('local', { type: Types.Number, deps: ['a'], do: (row) => (row.a as number) + 1 })
        .column('remote', { type: Types.Number, deps: ['a'], do: 'fetchNumber' }),
    )
    const [id] = await engine.sheet('T').appendRows([{ a: 1 }])
    const row = await engine.sheet('T').getRow(id!)
    expect(row?.local).toBe(2)
    expect(row?.remote).toBe(99)
  })

  it('restoreDue rehydrates waits after a restart', async () => {
    const storage = createMemoryStorage()
    const mk = (onEvent?: (e: RawStreamEvent) => void) =>
      new Engine({ storage, now: () => 1_000_000, makeId: createCounterIds('r'), onEvent })
    const events: RawStreamEvent[] = []
    const e1 = mk((e) => void events.push(e))
    e1.register(
      new Sheet('T')
        .column('idle', { type: Types.Boolean })
        .column('nudge', {
          type: Types.String,
          deps: ['idle'],
          when: (row) => row.idle === true,
          for: '1h',
          do: () => 'NUDGED',
        }),
    )
    const [id] = await e1.sheet('T').appendRows([{ idle: true }])
    const queued = e1.dueQueue()
    expect(queued).toHaveLength(1)
    // Fresh engine, same storage: nothing fires without the queue.
    const e2 = mk()
    e2.register(
      new Sheet('T')
        .column('idle', { type: Types.Boolean })
        .column('nudge', {
          type: Types.String,
          deps: ['idle'],
          when: (row) => row.idle === true,
          for: '1h',
          do: () => 'NUDGED',
        }),
    )
    expect(await e2.drainDue(2_000_000 + 2 * 3600_000)).toHaveLength(0)
    // Restored: the wait fires.
    e2.restoreDue(queued)
    const e3events: RawStreamEvent[] = []
    const e3 = new Engine({
      storage,
      now: () => 1_000_000 + 2 * 3600_000,
      makeId: createCounterIds('r'),
      onEvent: (e) => void e3events.push(e),
    })
    e3.register(
      new Sheet('T')
        .column('idle', { type: Types.Boolean })
        .column('nudge', {
          type: Types.String,
          deps: ['idle'],
          when: (row) => row.idle === true,
          for: '1h',
          do: () => 'NUDGED',
        }),
    )
    e3.restoreDue(queued)
    expect(await e3.drainDue()).toHaveLength(1)
    expect((await e3.sheet('T').getRow(id!))?.nudge).toBe('NUDGED')
  })

  it('a write fills matching cells in OTHER rows (same sheet)', async () => {
    const { engine } = setup()
    engine.register(
      new Sheet('Orders')
        .column('amount', { type: Types.Number })
        .column('big', {
          type: Types.Boolean,
          deps: ['amount'],
          when: (row) => (row.amount as number) > 100,
          do: () => true,
        }),
    )
    const api = engine.sheet('Orders')
    const [small] = await api.appendRows([{ amount: 10 }])
    const [big] = await api.appendRows([{ amount: 500 }])
    // The second write re-checked the first row too — still false, stays empty.
    expect((await api.getRow(small!))?.big).toBeUndefined()
    expect((await api.getRow(big!))?.big).toBe(true)
  })

  it('a write fills cells in OTHER sheets, then cascades', async () => {
    const { engine } = setup()
    engine.register(new Sheet('Orders').column('amount', { type: Types.Number }))
    engine.register(new Sheet('Summary').column('flag', { type: Types.String }).column('note', {
      type: Types.String,
      deps: ['flag'],
      when: (row) => row.flag === 'HOT',
      do: () => 'escalated',
    }))
    // Cross-sheet rule: a big order flags every summary row.
    engine.register(
      new Sheet('Watch').column('seen', { type: Types.Boolean }).column('trip', {
        type: Types.Boolean,
        do: async (_row, ctx) => {
          const orders = await ctx.sheet('Orders').getAllRows()
          const hot = orders.some((o) => (o.amount as number) > 100)
          if (!hot) return undefined
          const summaries = await ctx.sheet('Summary').getAllRows()
          for (const s of summaries) {
            await ctx.sheet('Summary').updateRow(s.id as string, { flag: 'HOT' })
          }
          return true
        },
      }),
    )
    await engine.sheet('Summary').appendRows([{}])
    await engine.sheet('Watch').appendRows([{}])
    await engine.sheet('Orders').appendRows([{ amount: 500 }])
    const summaries = await engine.sheet('Summary').getAllRows()
    expect(summaries[0]?.flag).toBe('HOT')
    expect(summaries[0]?.note).toBe('escalated')
  })

  it('deps narrow the scan: unrelated writes add no re-evaluation', async () => {
    const { engine } = setup()
    const probe = vi.fn(() => false)
    engine.register(
      new Sheet('T')
        .column('a', { type: Types.Number })
        .column('b', { type: Types.Number })
        .column('watched', { type: Types.Boolean, deps: ['a'], when: probe, do: () => true }),
    )
    await engine.sheet('T').appendRows([{ a: 1, b: 2 }])
    const calls = probe.mock.calls.length
    const [id] = await engine.sheet('T').getAllRows().then((rows) => [rows[0]!.id as string])
    await engine.sheet('T').updateRow(id, { b: 3 })
    expect(probe.mock.calls.length).toBe(calls)
  })
})
