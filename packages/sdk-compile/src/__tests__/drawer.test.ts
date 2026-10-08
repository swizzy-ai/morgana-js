/**
 * Drawer contract guard — dialog's sibling, edge-anchored.
 *
 * The gap this locks in: drawer had no surface at all while dialog carried
 * the whole overlay load. This asserts open/close paint display + data-open
 * and the structural writers mirror placement/size onto attributes.
 */
import { describe, expect, it } from 'vitest'
import { extendOverlay } from '../client/handles/overlay'

function fakeDrawer() {
  const attrs = new Map<string, string>([['data-open', 'false']])
  const el = {
    style: {} as Record<string, string>,
    querySelector: () => null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = {}
  const handle: Record<string, unknown> = {}
  extendOverlay({
    id: 'dw',
    kind: 'drawer',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, el, attrs }
}

describe('drawer methods', () => {
  it('open()/close() paint display and data-open', () => {
    const { handle, el, attrs } = fakeDrawer()
    handle.open()
    expect(el.style.display).toBe('flex')
    expect(attrs.get('data-open')).toBe('true')
    expect(handle.isOpen()).toBe(true)
    handle.close()
    expect(el.style.display).toBe('none')
    expect(handle.isOpen()).toBe(false)
  })

  it('structural writers mirror attributes', () => {
    const { handle, attrs } = fakeDrawer()
    handle.setPlacement('start')
    expect(attrs.get('data-placement')).toBe('start')
    handle.setSize('lg')
    expect(attrs.get('data-size')).toBe('lg')
  })
})
