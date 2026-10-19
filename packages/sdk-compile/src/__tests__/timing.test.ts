/**
 * `config.debounce` and `config.throttle` on browser actions. They used to be
 * read and then ignored; these pin what they do, and that a project using
 * neither ships the same dispatcher as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { busPart } from '../client/bus'

function load(timing: Record<string, { debounce?: number; throttle?: number }>) {
  const bindings = [{ event: 'input', action: 'typed', origin: 'box' }]
  const src = busPart(JSON.stringify(bindings), timing).join('\n')
  const runs: Array<{ action: string; value: unknown }> = []
  const win = { __morgana_run: (action: string, _args: unknown, ev: { payload: unknown }) => { runs.push({ action, value: ev.payload }) } }
  const bus = new Function('window', 'console', 'pathOverlaps', `${src}\nreturn { dispatchPageEvent };`)(
    win, console, () => true,
  ) as { dispatchPageEvent: (event: string, origin: string, el: unknown, payload: unknown) => void }
  const type = (value: string) => bus.dispatchPageEvent('input', 'box', null, value)
  return { runs, type, src }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('action timing', () => {
  it('without timing, every event runs the action, as before', () => {
    const { runs, type, src } = load({})
    expect(src).toContain('function __morgana_fire(a,ev){window.__morgana_run(a,{},ev);}')
    expect(src).not.toContain('__morgana_timing')
    type('a'); type('ab')
    expect(runs.map((r) => r.value)).toEqual(['a', 'ab'])
  })

  it('throttle runs at once, then once per window, and never drops the last event', () => {
    const { runs, type } = load({ typed: { throttle: 500 } })
    type('a')                      // runs now
    vi.advanceTimersByTime(100); type('ab')
    vi.advanceTimersByTime(100); type('abc')
    expect(runs.map((r) => r.value)).toEqual(['a'])
    vi.advanceTimersByTime(300)    // window ends: the latest runs
    expect(runs.map((r) => r.value)).toEqual(['a', 'abc'])
    vi.advanceTimersByTime(1000)
    expect(runs).toHaveLength(2)   // nothing pending
    type('abcd')                   // a new window: runs at once
    expect(runs.map((r) => r.value)).toEqual(['a', 'abc', 'abcd'])
  })

  it('debounce runs once the events stop, with the last one', () => {
    const { runs, type } = load({ typed: { debounce: 300 } })
    type('a'); vi.advanceTimersByTime(200)
    type('ab'); vi.advanceTimersByTime(200)
    expect(runs).toEqual([])
    vi.advanceTimersByTime(100)
    expect(runs.map((r) => r.value)).toEqual(['ab'])
  })

  it('only the timed action is held back', () => {
    const { runs, type } = load({ other: { throttle: 500 } })
    type('a'); type('ab')
    expect(runs.map((r) => r.value)).toEqual(['a', 'ab'])
  })
})
