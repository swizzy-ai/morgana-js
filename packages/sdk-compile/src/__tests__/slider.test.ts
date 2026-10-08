/**
 * Slider contract guard — clamp, step snap, paint, announce.
 *
 * The gap this locks in: without method-level paint the fill, readout and
 * mirror attribute disagree after setValue (the toggle/checked lesson), and
 * without step snapping a min/max/step slider accepts off-grid values.
 */
import { describe, expect, it } from 'vitest'
import { extendInputs } from '../client/handles/inputs'

function fakeSlider(props: Record<string, unknown> = {}) {
  const attrs = new Map<string, string>()
  const parts: Record<string, { style: Record<string, string>; textContent: string; value: string }> = {}
  const part = (name: string) =>
    (parts[name] ??= { style: {}, textContent: '', value: '' })
  const el = {
    querySelector: (sel: string) => {
      if (sel.includes('fill')) return part('fill')
      if (sel.includes('value')) return part('value')
      if (sel.includes('range')) return { get value() { return part('input').value }, set value(v: string) { part('input').value = v } }
      return null
    },
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { min: 0, max: 100, step: 1, ...props }
  const handle: Record<string, unknown> = {}
  extendInputs({
    id: 'sl',
    kind: 'slider',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, store, attrs, parts }
}

describe('slider methods', () => {
  it('clamps to bounds', () => {
    const { handle } = fakeSlider({ min: 10, max: 20 })
    handle.setValue(99)
    expect(handle.getValue()).toBe(20)
    handle.setValue(-5)
    expect(handle.getValue()).toBe(10)
  })

  it('snaps to the step grid', () => {
    const { handle } = fakeSlider({ min: 0, max: 100, step: 5 })
    handle.setValue(23)
    expect(handle.getValue()).toBe(25)
  })

  it('paints fill, readout, mirror attr and the native input', () => {
    const { handle, attrs, parts } = fakeSlider()
    handle.setValue(50)
    expect(attrs.get('data-value')).toBe('50')
    expect(parts['fill'].style.width).toBe('50%')
    expect(parts['input'].value).toBe('50')
  })

  it('emits changed once with the snapped value', () => {
    const { handle, emitted } = fakeSlider({ step: 10 })
    handle.setValue(24)
    expect(emitted).toEqual([{ event: 'changed', payload: { value: 20 } }])
  })

  it('increment/decrement step by step', () => {
    const { handle } = fakeSlider({ step: 5 })
    handle.setValue(10)
    handle.increment()
    expect(handle.getValue()).toBe(15)
    handle.decrement(7)
    expect(handle.getValue()).toBe(10)
  })
})
