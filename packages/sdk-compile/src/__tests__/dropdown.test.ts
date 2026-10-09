/**
 * Dropdown/menu contract guard — open/close, items rebuild, value mirror.
 *
 * The gap this locks in: both kinds rendered and delegated but had no typed
 * surface — setItems/setValue did not exist, and selectItem used a selector
 * that breaks on quoted values.
 */
import { describe, expect, it, vi } from 'vitest'
import { extendOverlay } from '../client/handles/overlay'

function fakeMenu() {
  const attrs = new Map<string, string>([['data-open', 'false']])
  let panelHtml = ''
  const items: Array<{ value: string; active: boolean }> = []
  const panel = {
    set innerHTML(v: string) {
      panelHtml = v
    },
    get innerHTML() {
      return panelHtml
    },
    setAttribute: (_k: string, _v: string) => {},
    removeAttribute: (_k: string) => {},
    querySelectorAll: (_sel: string) => items.map((it) => ({
      getAttribute: (k: string) => (k === 'data-value' ? it.value : null),
      setAttribute: (k: string, _v: string) => {
        if (k === 'data-active') it.active = true
      },
      removeAttribute: (k: string) => {
        if (k === 'data-active') it.active = false
      },
      dispatchEvent: vi.fn(),
    })),
  }
  const el = {
    style: {} as Record<string, string>,
    querySelector: (sel: string) => (sel.includes('panel') ? panel : null),
    querySelectorAll: (sel: string) =>
      sel.includes('dropdown-item') ? (panel.querySelectorAll(sel) as unknown as Element[]) : [],
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = {}
  const handle: Record<string, unknown> = {}
  const kind = 'menu'
  extendOverlay({
    id: 'm',
    kind,
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, el, attrs, panel, items, store }
}

describe('dropdown/menu methods', () => {
  it('open()/close()/toggle() paint display and data-open', () => {
    const { handle, el, attrs } = fakeMenu()
    handle.open()
    expect(el.style.display).toBe('flex')
    expect(attrs.get('data-open')).toBe('true')
    handle.toggle()
    expect(attrs.get('data-open')).toBe('false')
    expect(handle.isOpen()).toBe(false)
  })

  it('setItems() rebuilds the panel', () => {
    const { handle, panel } = fakeMenu()
    handle.setItems([
      { label: 'One', value: '1' },
      { separator: true },
      { label: 'Two', value: '2', disabled: true },
    ])
    expect(panel.innerHTML).toContain('data-value="1"')
    expect(panel.innerHTML).toContain('dropdown-separator')
    expect(panel.innerHTML).toContain('data-disabled="true"')
  })

  it('selectItem() clicks by value, even quoted', () => {
    const { handle, items } = fakeMenu();
    (globalThis as Record<string, unknown>)['MouseEvent'] = class {
      constructor(
        public type: string,
        public init?: Record<string, unknown>,
      ) {}
    }
    items.push({ value: 'a"b', active: false })
    expect(handle.selectItem('a"b')).toBe(true)
    expect(handle.selectItem('missing')).toBe(false)
    delete (globalThis as Record<string, unknown>)['MouseEvent']
  })
})
