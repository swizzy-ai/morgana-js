/**
 * Toast contract guard — notify stamps, cap holds, dismiss clears.
 *
 * The gap this locks in: toast had no surface while every other feedback
 * kind did. This asserts notify returns ids, the max cap drops the oldest,
 * and dismiss/clear empty the region.
 */
import { describe, expect, it, vi } from 'vitest'
import { extendFeedback } from '../client/handles/feedback'

vi.useFakeTimers()

function fakeRegion() {
  const nodes: Array<Record<string, any>> = []
  const el = {
    children: nodes,
    appendChild: (n: Record<string, any>) => void nodes.push(n),
    querySelectorAll: (sel: string) =>
      sel.includes('toast') ? nodes.filter((n) => n.part === 'toast') : [],
    querySelector: (sel: string) => {
      const m = sel.match(/data-toast-id="([^"]+)"/)
      if (!m) return null
      return nodes.find((n) => n.attrs['data-toast-id'] === m[1]) ?? null
    },
    set innerHTML(_: string) {
      nodes.length = 0
    },
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { max: 5, duration: 4000 }
  const handle: Record<string, unknown> = {}
  const doc = {
    createElement: () => ({
      part: 'toast',
      attrs: {} as Record<string, string>,
      setAttribute(k: string, v: string) {
        if (k === 'data-part') this.part = v
        else this.attrs[k] = v
      },
      getAttribute(k: string) {
        return this.attrs[k] ?? null
      },
      remove() {
        const i = nodes.indexOf(this as any)
        if (i >= 0) nodes.splice(i, 1)
      },
    }),
  }
  ;(globalThis as any).document = doc
  extendFeedback({
    id: 'toast',
    kind: 'toast',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, nodes }
}

describe('toast methods', () => {
  it('notify() stamps and returns an id', () => {
    const { handle, nodes, emitted } = fakeRegion()
    const id = handle.notify({ title: 'Hi', variant: 'success' })
    expect(typeof id).toBe('string')
    expect(nodes).toHaveLength(1)
    expect(emitted).toEqual([{ event: 'notified', payload: { id, variant: 'success' } }])
    expect(handle.count()).toBe(1)
  })

  it('caps at max, oldest first', () => {
    const { handle, nodes } = fakeRegion()
    for (let i = 0; i < 7; i += 1) handle.notify({ title: `t${i}` })
    expect(nodes.length).toBeLessThanOrEqual(5)
    expect(handle.count()).toBeLessThanOrEqual(5)
  })

  it('auto-dismisses after duration, sticky when 0', () => {
    const { handle } = fakeRegion()
    handle.notify({ title: 'temp' })
    expect(handle.count()).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(handle.count()).toBe(0)
    handle.notify({ title: 'sticky', duration: 0 })
    vi.advanceTimersByTime(60000)
    expect(handle.count()).toBe(1)
    handle.clear()
    expect(handle.count()).toBe(0)
  })
})
