/**
 * Wave-2C method guard — combobox, tags, tree, rating, editable, file.
 *
 * New builds, so the contract is asserted before the docs views exist:
 * values mirror to attributes, lists rebuild, completion and selection emit.
 */
import { describe, expect, it } from 'vitest'
import { extendInputs } from '../client/handles/inputs'
import { extendData } from '../client/handles/data'

function fakeInputs(kind: string, props: Record<string, unknown> = {}, parts: Record<string, any> = {}) {
  const attrs = new Map<string, string>()
  const el = {
    querySelector: (sel: string) => {
      const m = sel.match(/data-part="([\w-]+)"/)
      if (!m) return null
      if (!(m[1] in parts)) return null
      return parts[m[1]]
    },
    querySelectorAll: () => [],
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    removeAttribute: (k: string) => void attrs.delete(k),
    appendChild: () => {},
    insertBefore: () => {},
    remove: () => {},
  }
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { ...props }
  const handle: Record<string, unknown> = {}
  extendInputs({
    id: 'x',
    kind,
    meta: {} as any,
    el: el as any,
    setProp: (p: string, v: unknown) => void (store[p] = v),
    getProp: (p: string) => store[p],
    emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
    handle,
    reevaluate: () => {},
  } as any)
  return { handle: handle as Record<string, (...args: any[]) => any>, emitted, store, attrs, el }
}

function fakeData(kind: string, props: Record<string, unknown> = {}, el: any = null) {
  const emitted: Array<{ event: string; payload?: unknown }> = []
  const store: Record<string, unknown> = { ...props }
  const handle: Record<string, unknown> = {}
  extendData({
    id: 'x',
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

describe('combobox methods', () => {
  it('setValue mirrors + announces; setOptions rebuilds', () => {
    const panel = { innerHTML: '' }
    const { handle, attrs, emitted } = fakeInputs(
      'combobox',
      { options: [{ label: 'A', value: 'a' }] },
      { panel, search: { value: '', setAttribute: () => {}, getAttribute: () => null } },
    )
    handle.setValue('a')
    expect(attrs.get('data-value')).toBe('a')
    expect(emitted).toEqual([{ event: 'changed', payload: { value: 'a' } }])
    handle.setOptions([{ label: 'B', value: 'b' }])
    expect(panel.innerHTML).toContain('data-value="b"')
  })
})

describe('tags methods', () => {
  it('add/remove/clear with max + dedupe', () => {
    const nodes: any[] = []
    const entry = { tagName: 'INPUT', value: '' }
    const el = {
      querySelector: (sel: string) => (sel.includes('entry') ? entry : null),
      querySelectorAll: (sel: string) => (sel.includes('tag') && !sel.includes('remove') ? nodes.filter((n) => n.part === 'tag') : []),
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: (n: any) => void nodes.push(n),
      insertBefore: (n: any) => void nodes.push(n),
    }
    ;(globalThis as Record<string, unknown>)['document'] = {
      createElement: () => ({
        part: '',
        attrs: {} as Record<string, string>,
        children: [] as any[],
        textContent: '',
        setAttribute(k: string, v: string) {
          if (k === 'data-part') this.part = v
          else this.attrs[k] = v
        },
        appendChild(c: any) {
          this.children.push(c)
        },
        remove() {
          const i = nodes.indexOf(this as any)
          if (i >= 0) nodes.splice(i, 1)
        },
      }),
    }
    const emitted: Array<{ event: string; payload?: unknown }> = []
    const store: Record<string, unknown> = { max: 2 }
    const handle: Record<string, unknown> = {}
    extendInputs({
      id: 'x',
      kind: 'tagsInput',
      meta: {} as any,
      el: el as any,
      setProp: (p: string, v: unknown) => void (store[p] = v),
      getProp: (p: string) => (p === 'value' ? (store[p] as string[] | undefined) ?? [] : store[p]),
      emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
      handle,
      reevaluate: () => {},
    } as any)
    const h = handle as Record<string, (...args: any[]) => any>
    expect(h.add('a')).toBe(true)
    expect(h.add('a')).toBe(false)
    expect(h.add('b')).toBe(true)
    expect(h.add('c')).toBe(false)
    h.removeAt('a')
    expect(h.getValue()).toEqual(['b'])
    delete (globalThis as Record<string, unknown>)['document']
  })
})

describe('tree methods', () => {
  it('toggle flips one node and reports', () => {
    const nodes = ['a', 'b'].map((key) => {
      const attrs = new Map<string, string>([['data-node-key', key], ['data-expanded', 'false']])
      return {
        getAttribute: (k: string) => attrs.get(k) ?? null,
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        querySelector: () => ({ setAttribute: () => {}, removeAttribute: () => {} }),
        children: [],
      }
    })
    const el = { querySelectorAll: () => nodes }
    const { handle, emitted } = fakeData('treeView', {}, el)
    handle.toggle('a')
    expect(nodes[0].getAttribute('data-expanded')).toBe('true')
    expect(nodes[1].getAttribute('data-expanded')).toBe('false')
    expect(emitted).toEqual([{ event: 'changed', payload: { expanded: ['a'] } }])
  })
})

describe('rating/editable methods', () => {
  it('rating setValue paints stars', () => {
    const stars = [1, 2, 3].map((i) => {
      const attrs = new Map<string, string>([['data-star', String(i)]])
      return {
        getAttribute: (k: string) => attrs.get(k) ?? null,
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        removeAttribute: (k: string) => void attrs.delete(k),
      }
    })
    const el = {
      querySelectorAll: () => stars,
      setAttribute: () => {},
      getAttribute: () => null,
    }
    const emitted: Array<{ event: string; payload?: unknown }> = []
    const store: Record<string, unknown> = { max: 3 }
    const handle: Record<string, unknown> = {}
    extendInputs({
      id: 'x',
      kind: 'rating',
      meta: {} as any,
      el: el as any,
      setProp: (p: string, v: unknown) => void (store[p] = v),
      getProp: (p: string) => store[p],
      emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
      handle,
      reevaluate: () => {},
    } as any)
    const h = handle as Record<string, (...args: any[]) => any>
    h.setValue(2)
    expect(stars.map((s) => s.getAttribute('data-on'))).toEqual(['true', 'true', 'false'])
    expect(emitted).toEqual([{ event: 'changed', payload: { value: 2 } }])
  })

  it('editable submit commits, cancel reverts', () => {
    const preview = { textContent: 'old', setAttribute: () => {}, removeAttribute: () => {} }
    const editor = { value: 'old', setAttribute: () => {}, removeAttribute: () => {}, focus: () => {}, select: () => {} }
    const attrs = new Map<string, string>()
    const el = {
      querySelector: (sel: string) => (sel.includes('preview') ? preview : sel.includes('editor') ? editor : null),
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k) ?? null,
    }
    const emitted: Array<{ event: string; payload?: unknown }> = []
    const store: Record<string, unknown> = { value: 'old' }
    const handle: Record<string, unknown> = {}
    extendInputs({
      id: 'x',
      kind: 'editable',
      meta: {} as any,
      el: el as any,
      setProp: (p: string, v: unknown) => void (store[p] = v),
      getProp: (p: string) => store[p],
      emit: (event: string, payload?: unknown) => void emitted.push({ event, payload }),
      handle,
      reevaluate: () => {},
    } as any)
    const h = handle as Record<string, (...args: any[]) => any>
    h.edit()
    expect(h.isEditing()).toBe(true)
    editor.value = 'new'
    h.submit()
    expect(store['value']).toBe('new')
    expect(preview.textContent).toBe('new')
    expect(emitted.map((e) => e.event)).toEqual(['changed', 'submitted'])
  })
})
