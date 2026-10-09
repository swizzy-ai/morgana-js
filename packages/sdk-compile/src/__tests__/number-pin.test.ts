/**
 * Number/pin contract guard — clamp, step, cells, completion.
 *
 * The gaps this locks in: both are new builds with native inputs carrying
 * the interaction — setValue must repaint input + mirror attr, pin setValue
 * must distribute across cells, and completion must be detectable.
 */
import { describe, expect, it } from 'vitest'
import { extendInputs } from '../client/handles/inputs'

function fakeNumber(props: Record<string, unknown> = {}) {
  const attrs = new Map<string, string>()
  const input = { value: '' }
  const el = {
    querySelector: (sel: string) => (sel.includes('number') ? input : null),
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { min: 0, max: 10, step: 2, ...props }
  const handle: Record<string, unknown> = {}
  extendInputs({
    id: 'n',
    kind: 'numberInput',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, attrs, input }
}

function fakePin(length = 4) {
  const cells = Array.from({ length }, () => ({ value: '' }))
  const el = {
    querySelectorAll: () => cells,
    setAttribute: () => {},
    getAttribute: () => null,
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = {}
  const handle: Record<string, unknown> = {}
  extendInputs({
    id: 'p',
    kind: 'pinInput',
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, cells }
}

describe('number input methods', () => {
  it('clamps and repaints input + mirror', () => {
    const { handle, attrs, input } = fakeNumber()
    handle.setValue(99)
    expect(handle.getValue()).toBe(10)
    expect(attrs.get('data-value')).toBe('10')
    expect(input.value).toBe('10')
  })

  it('steps and announces', () => {
    const { handle, emitted } = fakeNumber()
    handle.setValue(4)
    handle.increment()
    expect(handle.getValue()).toBe(6)
    expect(emitted.at(-1)).toEqual({ event: 'changed', payload: { value: 6 } })
  })
})

describe('pin input methods', () => {
  it('distributes setValue across cells and reads back', () => {
    const { handle, cells, emitted } = fakePin()
    handle.setValue('12')
    expect(cells.map((c) => c.value)).toEqual(['1', '2', '', ''])
    expect(handle.getValue()).toBe('12')
    expect(emitted).toEqual([{ event: 'changed', payload: { value: '12' } }])
  })

  it('clears every cell', () => {
    const { handle, cells } = fakePin()
    handle.setValue('9876')
    handle.clear()
    expect(cells.every((c) => c.value === '')).toBe(true)
    expect(handle.getValue()).toBe('')
  })
})
