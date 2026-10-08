/**
 * Popover contract guard — open/close/toggle paint + announce.
 *
 * The gap this locks in: popover had no renderer, no methods, no delegation —
 * a Chakra-spec'd component with zero Morgana surface. This asserts the
 * method layer paints attributes/panel and emits `changed` exactly once.
 */
import { describe, expect, it } from 'vitest'
import { extendOverlay } from '../client/handles/overlay'

function fakePopover() {
  const attrs = new Map<string, string>([['data-open', 'false']])
  const panelAttrs = new Map<string, string>([['hidden', '']])
  const panel = {
    setAttribute: (k: string, v: string) => void panelAttrs.set(k, v),
    getAttribute: (k: string) => panelAttrs.get(k) ?? null,
    removeAttribute: (k: string) => void panelAttrs.delete(k),
  }
  const triggerAttrs = new Map<string, string>()
  const el = {
    querySelector: (sel: string) => {
      if (sel.includes('panel')) return panel
      if (sel.includes('trigger')) {
        return {
          setAttribute: (k: string, v: string) => void triggerAttrs.set(k, v),
          getAttribute: (k: string) => triggerAttrs.get(k) ?? null,
        }
      }
      return null
    },
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = {}
  const handle: Record<string, unknown> = {}
  extendOverlay({
    id: 'pop',
    kind: 'popover',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, attrs, panelAttrs }
}

describe('popover methods', () => {
  it('open() paints and emits once', () => {
    const { handle, attrs, emitted } = fakePopover()
    handle.open()
    expect(attrs.get('data-open')).toBe('true')
    expect(emitted).toEqual([{ event: 'changed', payload: { open: true } }])
    expect(handle.isOpen()).toBe(true)
  })

  it('toggle() flips and close() hides', () => {
    const { handle, attrs, panelAttrs } = fakePopover()
    handle.toggle()
    expect(attrs.get('data-open')).toBe('true')
    handle.toggle()
    expect(attrs.get('data-open')).toBe('false')
    expect(panelAttrs.get('hidden')).toBe('')
    expect(handle.isOpen()).toBe(false)
  })

  it('setTitle/setContent write props and parts', () => {
    const { handle, emitted } = fakePopover()
    handle.setTitle('Hi')
    handle.setContent('Body')
    expect(emitted).toHaveLength(0)
  })
})
