/**
 * Frontend binding selectors.
 *
 * Every assertion here corresponds to a binding that used to compile, ship, and
 * do nothing:
 *
 *   1. `on: 'clicked'` fired for a click on ANY object, because the object part
 *      of a selector was discarded.
 *   2. `on: 'save.click'` could never fire — the selector form accepted DOM
 *      event names the runtime never dispatches.
 *   3. A custom object's declared events were not recognised and fell through
 *      to a server trigger.
 *
 * And the two things that make the new syntax trustworthy: an object-scoped
 * binding, and a build error when the selector names nothing real.
 */
import { describe, expect, it } from 'vitest'
import { parseSelector, canonicalEvent, resolveBindings, PROP_CHANGED, type BindingGraph } from '../bindings'

/** A graph: two objects, one a component containing the other. */
function graph(over: Partial<BindingGraph> = {}): BindingGraph {
  return {
    objectIds: new Set(['cta', 'panel', 'player', 'video', 'caption', 'orderTitle', 'price']),
    children: new Map([
      ['player', ['video', 'caption']],
      ['video', []],
      ['caption', []],
      ['cta', []],
      ['panel', []],
      ['orderTitle', []],
      ['price', []],
    ]),
    componentNames: new Set(['video-player']),
    componentEvents: new Set(['ready', 'opened']),
    componentOf: new Map([['player', 'video-player']]),
    emittable: new Set(['clicked', 'changed', 'submitted', 'hover', 'focus', 'blur', 'selected']),
    ...over,
  }
}

function resolve(raw: string, action = 'probe'): { bindings: Array<Record<string, unknown>>; errors: string[] } {
  const errors: string[] = []
  const bindings = resolveBindings(parseSelector(raw), action, graph(), errors)
  return { bindings: bindings as unknown as Array<Record<string, unknown>>, errors }
}

describe('event names', () => {
  it('maps DOM names onto what the runtime actually dispatches', () => {
    // The bug: these used to compile and never fire.
    expect(canonicalEvent('click')).toBe('clicked')
    expect(canonicalEvent('change')).toBe('changed')
    expect(canonicalEvent('input')).toBe('changed')
    expect(canonicalEvent('submit')).toBe('submitted')
    expect(canonicalEvent('hovered')).toBe('hover')
    expect(canonicalEvent('focused')).toBe('focus')
    expect(canonicalEvent('blurred')).toBe('blur')
  })

  it('accepts catalog names the runtime emits literally', () => {
    for (const name of ['clicked', 'changed', 'submitted', 'loaded', 'hover', 'focus', 'blur', 'dblclick', 'scroll']) {
      expect(canonicalEvent(name), name).toBe(name)
    }
  })

  it('bridges the catalog/runtime drift: entered and exited', () => {
    // INTERACTION_EVENTS said entered/exited; the runtime dispatches hover/blur.
    expect(canonicalEvent('entered')).toBe('hover')
    expect(canonicalEvent('exited')).toBe('blur')
  })

  it('rejects a name nothing dispatches', () => {
    expect(canonicalEvent('clickked')).toBeNull()
    expect(canonicalEvent('actuated')).toBeNull()
  })
})

describe('selector grammar', () => {
  it('a bare event means any object', () => {
    const p = parseSelector('clicked')
    expect(p).toMatchObject({ kind: 'event', event: 'clicked' })
    expect(p.origin).toBeUndefined()
  })

  it('object.event scopes to one object', () => {
    expect(parseSelector('cta.clicked')).toMatchObject({ kind: 'event', event: 'clicked', origin: 'cta' })
  })

  it('# is accepted and stripped', () => {
    expect(parseSelector('#cta.clicked')).toMatchObject({ origin: 'cta', event: 'clicked' })
  })

  it('object.prop.event is a prop watcher', () => {
    expect(parseSelector('cta.label.changed')).toMatchObject({
      kind: 'event', event: PROP_CHANGED, origin: 'cta', prop: 'label',
    })
  })

  it('arity is fixed, so price.changed is the price object changing', () => {
    // Two segments is object + event. Making it a prop watcher too would make
    // `price.changed` ambiguous, and ambiguity here means a dead binding.
    expect(parseSelector('price.changed')).toMatchObject({
      kind: 'event', event: 'changed', origin: 'price',
    })
  })

  it('a DOM alias in the last position canonicalizes', () => {
    expect(parseSelector('cta.click')).toMatchObject({ origin: 'cta', event: 'clicked' })
    expect(parseSelector('cta.hovered')).toMatchObject({ origin: 'cta', event: 'hover' })
  })

  it('state: is a state path, not an object selector', () => {
    const p = parseSelector('state:cta.open')
    expect(p.kind).toBe('state')
    expect(p.event).toBe('state:cta.open')
  })

  it('a dotted object id parses as object+prop, then resolves back to the id', () => {
    // `nav.item.clicked` first reads as object `nav` + prop `item`. Resolution
    // checks the graph: `nav` is not real but `nav.item` is, so the id has a dot.
    const g = graph({
      objectIds: new Set(['nav.item']),
      children: new Map([['nav.item', []]]),
    })
    const errors: string[] = []
    const bindings = resolveBindings(parseSelector('nav.item.clicked'), 'probe', g, errors)
    expect(errors).toEqual([])
    expect(bindings).toEqual([{ event: 'clicked', action: 'probe', origin: 'nav.item' }])
  })
})

describe('resolution', () => {
  it('a bare event binds once, with no origin', () => {
    const { bindings, errors } = resolve('clicked')
    expect(errors).toEqual([])
    expect(bindings).toEqual([{ event: 'clicked', action: 'probe' }])
  })

  it('an object-scoped event binds to that object only', () => {
    const { bindings, errors } = resolve('cta.clicked')
    expect(errors).toEqual([])
    expect(bindings).toEqual([{ event: 'clicked', action: 'probe', origin: 'cta' }])
  })

  it('a component scope expands to the object and everything inside it', () => {
    // A click on the video fires with the video's id, not the player's. Without
    // this expansion `player.clicked` would silently never fire.
    const { bindings, errors } = resolve('player.clicked')
    expect(errors).toEqual([])
    expect(bindings.map((b) => b['origin']).sort()).toEqual(['caption', 'player', 'video'])
  })

  it('price.changed is an object-scoped change, not a prop watcher', () => {
    const { bindings, errors } = resolve('price.changed', 'recalc')
    expect(errors).toEqual([])
    expect(bindings).toEqual([{ event: 'changed', action: 'recalc', origin: 'price' }])
  })

  it('object.prop.changed scopes to that one prop', () => {
    const { bindings, errors } = resolve('cta.label.changed', 'onLabel')
    expect(errors).toEqual([])
    expect(bindings).toEqual([
      { event: PROP_CHANGED, action: 'onLabel', origin: 'cta', prop: 'label' },
    ])
  })

  it('a custom object declared event is a client binding, not a trigger', () => {
    const { bindings, errors } = resolve('opened')
    expect(errors).toEqual([])
    expect(bindings[0]).toMatchObject({ event: 'opened' })
  })
})

describe('a selector that names nothing real is a build error', () => {
  it('rejects an object that does not exist', () => {
    const { bindings, errors } = resolve('nope.clicked')
    expect(bindings).toEqual([])
    expect(errors[0]).toContain('no object named "nope"')
  })

  it('rejects an event nothing dispatches', () => {
    const { bindings, errors } = resolve('cta.clickked')
    expect(bindings).toEqual([])
    expect(errors[0]).toContain('nothing dispatches')
  })

  it('the error names the action, so it points at the right file', () => {
    const { errors } = resolve('nope.clicked', 'checkout')
    expect(errors[0]).toContain('checkout')
  })

  it('a bare un-emittable event is rejected too', () => {
    const { errors } = resolve('clickked')
    expect(errors[0]).toContain('nothing dispatches')
  })
})
