/**
 * Tooltip contract guard — show/hide paint visibility + announce.
 *
 * The gap this locks in: tooltip was hover-delegation only, with no typed
 * surface — programmatic show/hide and content writes did not exist.
 */
import { describe, expect, it } from 'vitest'
import { extendOverlay } from '../client/handles/overlay'

function fakeTip() {
  const attrs = new Map<string, string>([['data-visible', 'false']])
  const tip = { textContent: '' }
  const el = {
    querySelector: (sel: string) => (sel.includes('tip') ? tip : null),
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = {}
  const handle: Record<string, unknown> = {}
  extendOverlay({
    id: 'tip',
    kind: 'tooltip',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, attrs, tip }
}

describe('tooltip methods', () => {
  it('show()/hide()/toggle() paint visibility and emit', () => {
    const { handle, attrs, emitted } = fakeTip()
    handle.show()
    expect(attrs.get('data-visible')).toBe('true')
    expect(handle.isVisible()).toBe(true)
    handle.toggle()
    expect(attrs.get('data-visible')).toBe('false')
    expect(emitted).toEqual([
      { event: 'changed', payload: { visible: true } },
      { event: 'changed', payload: { visible: false } },
    ])
  })

  it('setContent() writes the tip node', () => {
    const { handle, tip } = fakeTip()
    handle.setContent('Hello')
    expect(tip.textContent).toBe('Hello')
  })
})
