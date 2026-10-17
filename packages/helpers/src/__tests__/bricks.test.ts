import { describe, expect, it, vi } from 'vitest'
import { Bricks, type BrickVerbs } from '../bricks'

type AnyHandle = { setProps: (p: Record<string, unknown>) => unknown; clone?: (opts?: Record<string, unknown>) => AnyHandle }

/** A small fake: creation makes tagged nodes and logs; make is a recording chain. */
function fakeVerbs() {
  const log: string[] = []
  const chain = (what: string): never => {
    const step = new Proxy(() => undefined, {
      get: (_t, prop) => {
        if (prop === 'hidden') return () => { log.push(`hidden:${what}`); return step }
        if (prop === 'shown') return () => { log.push(`shown:${what}`); return step }
        if (prop === 'while') return (p: string) => { log.push(`while:${what}:${p}`); return step }
        if (prop === 'appearance') return (l: string) => { log.push(`appearance:${what}:${l}`); return step }
        if (prop === 'then') return undefined
        return () => step
      },
    }) as never
    return step
  }
  const made = (kind: string, id: string) => {
    log.push(`create:${kind}:${id}`)
    const h: AnyHandle = { setProps: (p: Record<string, unknown>) => { log.push(`setProps:${id}:${JSON.stringify(p)}`) } }
    return h as never
  }
  const placed: string[] = []
  const verbs: BrickVerbs = {
    create: { box: (id: string) => made('box', id), text: (id: string) => made('text', id), button: (id: string) => made('button', id), list: (id: string) => made('list', id), kind: (k: string, id: string) => made(k, id) } as never,
    place: ((thing: unknown) => {
      const t = (thing as AnyHandle).setProps ? String((thing as unknown as { id?: string }).id ?? 'node') : String(thing)
      return { in: (parent: unknown) => { const line = `place:${t}:in:${typeof parent}`; log.push(line); placed.push(line) } }
    }) as never,
    make: (thing: unknown) => chain(`make:${typeof thing === 'string' ? thing : 'node'}`),
    set: ((thing: unknown) => ({ textFrom: (p: string) => { log.push(`set textFrom:${p}`) }, valueFrom: () => undefined, labelFrom: () => undefined, placeholderFrom: () => undefined })) as never,
    fill: ((list: unknown) => ({ with: () => undefined, from: (p: string) => { log.push(`fill:node:${p}`) } })) as never,
  }
  return { verbs, log, made }
}

describe('Bricks', () => {
  it('repeat builds the first part once and clones the rest, configure fixes ids per index', () => {
    const { verbs, log } = fakeVerbs()
    const b = new Bricks(verbs)
    const base = { setProps: vi.fn(), clone: vi.fn(() => ({ setProps: vi.fn(), clone: () => ({ setProps: vi.fn() }) })) } as unknown as AnyHandle
    const build = vi.fn(() => base)
    const parts = b.repeat(3, build as never, (c, i) => { expect(i).toBeGreaterThan(0); (c as AnyHandle).setProps({ id: `seg-${i}` }) })
    expect(build).toHaveBeenCalledTimes(1)
    expect(base.clone).toHaveBeenCalledTimes(2)
    expect((base.clone as unknown as ReturnType<typeof vi.fn>).mock.calls.every((c) => c[0] === undefined)).toBe(true) // ids stay fresh until configure
    expect(parts).toHaveLength(3)
    expect(log.filter((l) => l.startsWith('setProps:')).every((l) => l.includes('"id":"seg-1"') || l.includes('"id":"seg-2"'))).toBe(true)
  })

  it('repeat of one makes no clones', () => {
    const { verbs } = fakeVerbs()
    const base = { setProps: vi.fn(), clone: vi.fn() } as unknown as AnyHandle
    const parts = new Bricks(verbs).repeat(1, () => base as never)
    expect(parts).toHaveLength(1)
    expect(base.clone).not.toHaveBeenCalled()
  })

  it('onlyWhile hides, then shows while the state value holds — in that order', () => {
    const { verbs, log } = fakeVerbs()
    const b = new Bricks(verbs)
    b.onlyWhile({ setProps: vi.fn() } as never, 'authStep', ['code', 'name'])
    const hiddenAt = log.indexOf('hidden:make:node')
    const shownAt = log.findIndex((l) => l === 'shown:make:node' && log.indexOf(l) > hiddenAt)
    expect(log[hiddenAt]).toBeDefined()
    expect(shownAt).toBeGreaterThan(hiddenAt)
  })

  it('cells make a caption + a state-bound value inside their cell, and the cell goes into the parent', () => {
    const { verbs, log } = fakeVerbs()
    const b = new Bricks(verbs)
    const meter = { setProps: vi.fn() } as unknown as AnyHandle
    const [cell] = b.cells(meter as never, [['m-time', 'Time', 'meter.time']], { cell: 'cell', label: 'cap', value: 'cellValue' })
    expect(cell).toBeDefined()
    expect(log.some((l) => l.startsWith('create:text:m-time-label'))).toBe(true)
    expect(log).toContain('set textFrom:meter.time')
    // One brick, three placements: the caption and the value into their cell, the cell into the meter.
    expect(log.filter((l) => l.startsWith('place:node:in:'))).toHaveLength(3)
  })

  it('segmented builds one key per member and lights the member its state names', () => {
    const { verbs, log } = fakeVerbs()
    const b = new Bricks(verbs)
    const keys = b.segmented({ setProps: vi.fn() } as never, 'theme.mode', [['dark', 'Dark'], ['light', 'Light']], 'segKey', 'segOn')
    expect(keys).toHaveLength(2)
    expect(log).toContain('create:button:dark')
    expect(log).toContain('appearance:make:node:segOn')
  })

  it('rows stamps the row into the list and fills the list from the state path', () => {
    const { verbs, log } = fakeVerbs()
    const b = new Bricks(verbs)
    b.rows('log', { setProps: vi.fn() } as never, 'log', 'time')
    expect(log).toContain('create:list:log')
    expect(log.some((l) => l.startsWith('fill:') && l.endsWith(':log'))).toBe(true)
  })
})
