/**
 * Accordion contract guard — single-open, collapsible lock, key mirror.
 *
 * The gaps this locks in: `open(key)` never closed siblings (multiple:false
 * was a lie through the imperative API), nothing enforced `collapsible:false`,
 * and programmatic writes emitted nothing for the docs event log to hear.
 */
import { describe, expect, it } from 'vitest'
import { extendOverlay } from '../client/handles/overlay'

function fakeTrigger(key: string, open: boolean) {
  const attrs = new Map<string, string>([
    ['data-item-key', key],
    ['data-open', open ? 'true' : 'false'],
    ['aria-expanded', open ? 'true' : 'false'],
  ])
  return {
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    parentElement: { querySelector: () => null },
  }
}

function fakeCtx(keys: string[], openIdx: number[], props: Record<string, unknown> = {}) {
  const triggers = keys.map((k, i) => fakeTrigger(k, openIdx.includes(i)))
  const elAttrs = new Map<string, string>()
  const el = {
    querySelectorAll: () => triggers as unknown as Element[],
    querySelector: () => null,
    setAttribute: (k: string, v: string) => void elAttrs.set(k, v),
    getAttribute: (k: string) => elAttrs.get(k) ?? null,
    removeAttribute: (k: string) => void elAttrs.delete(k),
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { ...props }
  const handle: Record<string, unknown> = {}
  extendOverlay({
    id: 'acc',
    kind: 'accordion',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, store, triggers, el }
}

const isOpen = (t: { getAttribute(k: string): string | null }) => t.getAttribute('data-open') === 'true'

describe('accordion methods', () => {
  it('toggle() closes siblings when multiple is not set', () => {
    const { handle, triggers } = fakeCtx(['a', 'b', 'c'], [0])
    handle.toggle('b')
    expect(isOpen(triggers[0])).toBe(false)
    expect(isOpen(triggers[1])).toBe(true)
    expect(handle.isOpen('b')).toBe(true)
  })

  it('open(key) enforces single-open and mirrors value', () => {
    const { handle, triggers, store } = fakeCtx(['a', 'b'], [0])
    handle.open('b')
    expect(isOpen(triggers[0])).toBe(false)
    expect(isOpen(triggers[1])).toBe(true)
    expect(store['value']).toBe('b')
  })

  it('refuses the last close when collapsible is false', () => {
    const { handle, triggers, emitted } = fakeCtx(['a', 'b'], [0], { collapsible: false })
    handle.close('a')
    expect(isOpen(triggers[0])).toBe(true)
    expect(emitted).toHaveLength(0)
    handle.open('b')
    handle.close('a')
    expect(isOpen(triggers[0])).toBe(false)
  })

  it('multiple allows several open and mirrors an array', () => {
    const { handle, store } = fakeCtx(['a', 'b', 'c'], [0], { multiple: true })
    handle.open('c')
    expect(handle.getOpenKeys()).toEqual(['a', 'c'])
    expect(store['value']).toEqual(['a', 'c'])
  })

  it('emits changed on programmatic writes', () => {
    const { handle, emitted } = fakeCtx(['a', 'b'], [])
    handle.toggle('a')
    expect(emitted).toEqual([{ event: 'changed', payload: { key: 'a', open: true, value: 'a' } }])
  })

  it('structural writers sync the attributes the delegation reads', () => {
    const { handle, store, el } = fakeCtx(['a'], [])
    handle.setMultiple(true)
    expect(store['multiple']).toBe(true)
    expect(el.getAttribute('data-multiple')).toBe('true')
    handle.setCollapsible(false)
    expect(el.getAttribute('data-collapsible')).toBe('false')
    handle.setCollapsible(true)
    expect(el.getAttribute('data-collapsible')).toBe(null)
    handle.setVariant('enclosed')
    expect(el.getAttribute('data-prop-variant')).toBe('enclosed')
  })
})
