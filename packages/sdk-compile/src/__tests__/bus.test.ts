/**
 * Dispatch registry guard.
 *
 * The page bus used to scan the whole flat binding list on every dispatch —
 * an O(all bindings) loop on the per-animation hot path. The compiler now
 * emits one dispatch function per event (`__handlers`), runtime subscribers
 * are keyed by event and composed at subscribe time, and the event log is a
 * circular buffer. Dispatch is two key lookups and two calls.
 *
 * This locks in both halves: the emitted shape (no scan, guards unrolled)
 * and the behavior (scoped/prop matching, keyed subscribers, sources parity).
 */
import { describe, expect, it } from 'vitest'
import { busPart } from '../client/bus'

interface Run {
  action: string
  ev: { name: string; origin: string; payload: unknown }
}

function loadBus(bindings: Array<Record<string, string>>) {
  const src = busPart(JSON.stringify(bindings)).join('\n')
  const runs: Run[] = []
  const errors: unknown[][] = []
  const pathOverlaps = (a: string, b: string): boolean =>
    a === '' || b === '' || a === b || a.indexOf(`${b}.`) === 0 || b.indexOf(`${a}.`) === 0
  const factory = new Function(
    'window',
    'console',
    'pathOverlaps',
    `${src}\nreturn { dispatchPageEvent, onPageEvent, getEventSources, getEventLog, dispatchStateEvent };`,
  ) as (
    w: unknown,
    c: unknown,
    p: unknown,
  ) => {
    dispatchPageEvent: (event: string, target: string, el: unknown, raw: unknown) => void
    onPageEvent: (event: string, fn: (...args: unknown[]) => void) => () => void
    getEventSources: () => Array<{ name: string; action?: string; lane: string }>
    getEventLog: () => Array<{ name: string }>
    dispatchStateEvent: (path: string, value: unknown, oldValue: unknown) => void
  }
  const api = factory(
    { __morgana_run: (action: string, _p: unknown, ev: Run['ev']) => runs.push({ action, ev }) },
    { error: (...a: unknown[]) => errors.push(a) },
    pathOverlaps,
  )
  return { api, runs, errors, src }
}

describe('emitted bus shape', () => {
  it('dispatches by key — no flat binding scan', () => {
    const { src } = loadBus([{ event: 'clicked', action: 'a', origin: 'cta' }])
    expect(src).toContain('__handlers')
    expect(src).toContain('ev.origin===')
    expect(src).not.toContain('__bindings.length')
    expect(src).not.toContain('__bindings = ')
  })

  it('keeps an introspection copy of the binding records', () => {
    const { src } = loadBus([{ event: 'clicked', action: 'a', origin: 'cta' }])
    expect(src).toContain('__bindingDefs')
  })
})

describe('dispatch behavior parity', () => {
  it('a bare event fires for any origin; a scoped one only for its object', () => {
    const { api, runs } = loadBus([
      { event: 'clicked', action: 'any' },
      { event: 'clicked', action: 'scoped', origin: 'cta' },
    ])
    api.dispatchPageEvent('clicked', 'cta', null, {})
    expect(runs.map((r) => r.action).sort()).toEqual(['any', 'scoped'])
    runs.length = 0
    api.dispatchPageEvent('clicked', 'other', null, {})
    expect(runs.map((r) => r.action)).toEqual(['any'])
  })

  it('prop-scoped bindings fire only on the matching prop', () => {
    const { api, runs } = loadBus([{ event: 'prop:changed', action: 'sync', origin: 't-new', prop: 'value' }])
    api.dispatchPageEvent('prop:changed', 't-new', null, { prop: 'value' })
    expect(runs).toHaveLength(1)
    api.dispatchPageEvent('prop:changed', 't-new', null, { prop: 'label' })
    api.dispatchPageEvent('prop:changed', 'other', null, { prop: 'value' })
    expect(runs).toHaveLength(1)
  })

  it('an event with no bindings fires nothing and does not throw', () => {
    const { api, runs, errors } = loadBus([{ event: 'clicked', action: 'a' }])
    api.dispatchPageEvent('resize', '', null, {})
    expect(runs).toEqual([])
    expect(errors).toEqual([])
  })

  it('subscribers are keyed by event and unsubscribable', () => {
    const { api } = loadBus([])
    const seen: string[] = []
    const off = api.onPageEvent('loaded', (origin: unknown) => seen.push(`loaded:${String(origin)}`))
    api.onPageEvent('clicked', () => seen.push('clicked'))
    api.dispatchPageEvent('loaded', 'home', null, {})
    api.dispatchPageEvent('clicked', 'cta', null, {})
    expect(seen).toEqual(['loaded:home', 'clicked'])
    off()
    api.dispatchPageEvent('loaded', 'home', null, {})
    expect(seen).toEqual(['loaded:home', 'clicked'])
  })

  it('sources keep the introspection contract', () => {
    const { api } = loadBus([
      { event: 'clicked', action: 'a', origin: 'cta' },
      { event: 'clicked', action: 'b', origin: 'hero' },
      { event: 'state:cart.open', action: 'c' },
    ])
    expect(api.getEventSources()).toEqual([
      { name: 'clicked', action: 'a', lane: 'page' },
      { name: 'state:cart.open', action: 'c', lane: 'page' },
    ])
  })

  it('state bindings live off the page path and match on overlap', () => {
    const { api, runs, src } = loadBus([
      { event: 'clicked', action: 'a' },
      { event: 'state:cart.open', action: 'watch' },
    ])
    // The page registry carries no state entries.
    expect(src).toContain('"state:cart.open"')
    api.dispatchPageEvent('clicked', '', null, {})
    expect(runs.map((r) => r.action)).toEqual(['a'])
    api.dispatchStateEvent('cart.open', true, false)
    expect(runs.map((r) => r.action)).toEqual(['a', 'watch'])
  })

  it('the log is a capped ring that still reads in order', () => {
    const { api } = loadBus([])
    for (let i = 0; i < 250; i++) api.dispatchPageEvent(`e${i}`, '', null, {})
    const log = api.getEventLog()
    expect(log).toHaveLength(200)
    expect(log[0]?.name).toBe('e50')
    expect(log[199]?.name).toBe('e249')
  })
})

describe('object events: a client action on one live instance', () => {
  function loadObjectBus(bindings: Array<Record<string, string>>) {
    const src = busPart(JSON.stringify(bindings)).join('\n')
    const runs: Run[] = []
    const subs: Array<{ type: string; name: string; fn: (e: string, d: unknown) => void }> = []
    const factory = new Function(
      'window',
      'console',
      'pathOverlaps',
      `${src}\nreturn { dispatchPageEvent };`,
    ) as (w: unknown, c: unknown, p: unknown) => { dispatchPageEvent: (event: string, target: string, el: unknown, raw: unknown) => void }
    const api = factory(
      {
        __morgana_run: (action: string, _p: unknown, ev: Run['ev']) => runs.push({ action, ev }),
        __morgana_objectEvents: (type: string, name: string, fn: (e: string, d: unknown) => void) => subs.push({ type, name, fn }),
      },
      { error: () => {} },
      () => false,
    )
    return { api, runs, subs }
  }

  it('subscribes once per instance, fanning every matching selector onto the bus', () => {
    const { runs, subs } = loadObjectBus([
      { event: 'object:chat-room/lobby.messages.added', action: 'roomFeed' },
      { event: 'object:chat-room/lobby.messages.added', action: 'alsoFeed' },
      { event: 'object:chat-room/lobby.messages.removed', action: 'roomPurge' },
    ])
    // One subscription for the instance, even across two distinct events.
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ type: 'chat-room', name: 'lobby' })

    subs[0]!.fn('messages.added', { text: 'hi' })
    expect(runs.map((r) => r.action).sort()).toEqual(['alsoFeed', 'roomFeed'])
    expect(runs[0]!.ev.name).toBe('object:chat-room/lobby.messages.added')
    expect(runs[0]!.ev.origin).toBe('lobby')
    expect(runs[0]!.ev.payload).toEqual({ type: 'chat-room', name: 'lobby', event: 'messages.added', data: { text: 'hi' } })

    runs.length = 0
    subs[0]!.fn('messages.removed', null)
    expect(runs.map((r) => r.action)).toEqual(['roomPurge'])
  })

  it('ships no subscription code when no client action listens to an object', () => {
    const { subs } = loadObjectBus([{ event: 'clicked', action: 'a' }])
    expect(subs).toEqual([])
  })

  it('does nothing when the page has no object transport', () => {
    const src = busPart(JSON.stringify([{ event: 'object:chat-room/lobby.messages.added', action: 'roomFeed' }])).join('\n')
    expect(() =>
      new Function('window', 'console', 'pathOverlaps', src)({ __morgana_run: () => {} }, { error: () => {} }, () => false),
    ).not.toThrow()
  })
})
