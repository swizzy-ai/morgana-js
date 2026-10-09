/**
 * Display-methods guard — steps advance, stat/tag write parts.
 *
 * The gap this locks in: display kinds rendered once at compile and went
 * stale on any write. Steps recompute per-step state from current, stat and
 * tag write their parts directly.
 */
import { describe, expect, it } from 'vitest'
import { extendData } from '../client/handles/data'

function fakeCtx(kind: string, props: Record<string, unknown>, el: any) {
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { ...props }
  const handle: Record<string, unknown> = {}
  extendData({
    id: 'd',
    kind,
    meta: {} as any,
    el,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, store }
}

function fakeSteps() {
  const steps = [0, 1, 2].map((i) => {
    const attrs = new Map<string, string>([['data-step-index', String(i)]])
    const marker = { textContent: String(i + 1) }
    return {
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      querySelector: (sel: string) => (sel.includes('marker') ? marker : null),
      __marker: marker,
    }
  })
  const attrs = new Map<string, string>()
  const el = {
    querySelectorAll: () => steps,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  return { steps, el }
}

describe('steps methods', () => {
  it('setCurrent repaints every step state', () => {
    const { steps, el } = fakeSteps()
    const { handle, emitted } = fakeCtx('steps', { items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], current: 0 }, el)
    handle.setCurrent(2)
    expect(steps.map((s) => s.getAttribute('data-state'))).toEqual(['done', 'done', 'current'])
    expect(steps[0].__marker.textContent).toBe('✓')
    expect(emitted).toEqual([{ event: 'changed', payload: { current: 2 } }])
  })

  it('next()/prev() clamp at the ends', () => {
    const { steps, el } = fakeSteps()
    const { handle } = fakeCtx('steps', { items: [{ title: 'a' }, { title: 'b' }], current: 1 }, el)
    handle.next()
    expect(steps[1].getAttribute('data-state')).toBe('current')
    handle.prev()
    handle.prev()
    expect(steps[0].getAttribute('data-state')).toBe('current')
  })
})

describe('stat/tag methods', () => {
  it('setValue/setLabel/setDelta write parts', () => {
    const parts: Record<string, { textContent: string; attrs: Map<string, string>; setAttribute(k: string, v: string): void }> = {}
    const el = {
      querySelector: (sel: string) => {
        const m = sel.match(/data-part="([\w-]+)"/)
        if (!m) return null
        return (parts[m[1]] ??= {
          textContent: '',
          attrs: new Map(),
          setAttribute(k: string, v: string) {
            this.attrs.set(k, v)
          },
        });
      },
    }
    const { handle } = fakeCtx('stat', {}, el)
    handle.setValue('42')
    handle.setDelta('-3%', 'down')
    expect(parts['stat-value'].textContent).toBe('42')
    expect(parts['stat-delta'].textContent).toBe('↓-3%')
    expect(parts['stat-delta'].attrs.get('data-trend')).toBe('down')
  })

  it('tag close removes the element', () => {
    let removed = false
    const el = { remove: () => void (removed = true), querySelector: () => null, setAttribute: () => {}, getAttribute: () => null }
    const { handle } = fakeCtx('tag', { label: 'x' }, el)
    handle.setLabel('y')
    handle.close()
    expect(removed).toBe(true)
  })
})
