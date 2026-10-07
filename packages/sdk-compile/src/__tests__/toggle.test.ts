/**
 * Toggle write guard.
 *
 * The gap this locks in: `check()`/`uncheck()`/`toggle()` simulated a click
 * on the track to announce themselves, and the document delegation read that
 * synthetic click as a user gesture — flipping `data-checked` straight back.
 * Every programmatic write silently no-oped (docs switch knob: target stuck
 * at false, zero errors). Programmatic writes now set attributes and emit
 * `changed` directly, never synthesizing input.
 */
import { describe, expect, it, vi } from 'vitest'
import { toggleMethods } from '../client/handles/inputs'

function fakeCtx() {
  const attrs = new Map<string, string>()
  const trackAttrs = new Map<string, string>()
  const track = {
    setAttribute: (k: string, v: string) => void trackAttrs.set(k, v),
    getAttribute: (k: string) => trackAttrs.get(k) ?? null,
    dispatchEvent: vi.fn(),
  }
  const el = {
    querySelector: (sel: string) => (sel.includes('track') ? track : null),
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const props: Record<string, unknown> = {}
  const ctx = {
    el,
    setProp: (p: string, v: unknown) => void (props[p] = v),
    getProp: (p: string) => props[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle: {},
  }
  return { ctx: ctx as any, attrs, track, emitted, props }
}

describe('toggle programmatic writes', () => {
  it('check() sets attributes and emits changed exactly once, without clicking', () => {
    const { ctx, attrs, track, emitted } = fakeCtx()
    const m = toggleMethods(ctx) as { check(): void }
    m.check()
    expect(attrs.get('data-checked')).toBe('true')
    expect(track.getAttribute('aria-checked')).toBe('true')
    expect(emitted).toEqual([{ event: 'changed', payload: { checked: true, value: true } }])
    // The reverted-write bug: a synthetic click on the track.
    expect(track.dispatchEvent).not.toHaveBeenCalled()
  })

  it('uncheck() clears, toggle() flips from the live attribute', () => {
    const { ctx, attrs, emitted } = fakeCtx()
    const m = toggleMethods(ctx) as { uncheck(): void; toggle(): void; isChecked(): boolean }
    attrs.set('data-checked', 'true')
    m.toggle()
    expect(attrs.get('data-checked')).toBe('false')
    m.uncheck()
    expect(attrs.get('data-checked')).toBe('false')
    expect(m.isChecked()).toBe(false)
    expect(emitted.filter((e) => e.event === 'changed')).toHaveLength(2)
  })

  it('falls back to props when detached, still emitting', () => {
    const { ctx, emitted, props } = fakeCtx()
    ;(ctx as any).el = null
    const m = toggleMethods(ctx) as { check(): void; isChecked(): boolean }
    m.check()
    expect(props['checked']).toBe(true)
    expect(m.isChecked()).toBe(true)
    expect(emitted).toHaveLength(1)
  })
})
