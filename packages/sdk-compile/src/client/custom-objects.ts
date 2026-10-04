/**
 * Custom object runtime — the browser half of a component.
 *
 * A component's `define` already ran at build time and stamped real objects
 * into the graph, so most of what happens here is attaching the *code* the
 * component declared: its `on*` lifecycle and its `methods`.
 *
 * The two lanes are kept apart deliberately. `define` ran in Node and touched no
 * DOM; everything that needs an element, a timer, or a GPU context is here.
 */

/** The component shape, as the bundle exposes it. */
export interface RuntimeCustomObject {
  name: string
  onPrepare?(ctx: Record<string, unknown>): void | Promise<void>
  onMount?(el: HTMLElement, ctx: Record<string, unknown>): void
  onUpdate?(nextProps: Record<string, unknown>, ctx: Record<string, unknown>): void
  onDestroy?(ctx: Record<string, unknown>): void
  methods?: Record<string, (handle: unknown, ...args: unknown[]) => unknown>
}

interface Registry {
  get(name: string): RuntimeCustomObject | undefined
  runtime(): RuntimeCustomObject[]
}

/** The registry the component bundle attached, or null when there are none. */
export function customObjectRegistry(): Registry | null {
  const w = globalThis as unknown as { __morgana_custom?: Registry }
  return w.__morgana_custom ?? null
}

/** Look up a component by name, or undefined. */
export function lookupCustomObject(name: string | undefined): RuntimeCustomObject | undefined {
  if (!name) return undefined
  const registry = customObjectRegistry()
  return registry?.get(name)
}

export interface MountInput {
  /** The component name — recorded on the object at compile time. */
  objectName: string
  /** The instance id. Also this instance's state namespace. */
  id: string
  el: HTMLElement | null
  props: Record<string, unknown>
  /** The live handle, before this object's methods are attached. */
  handle: Record<string, unknown>
  /** The live `ctx.ui`, so a component can reach every other object. */
  ui: Record<string, unknown>
  /** Read/write a state path on the page. */
  commitState(path: string, mut: (root: Record<string, unknown>) => void): Record<string, unknown>
  readState(): Record<string, unknown>
  subscribePath(
    path: string,
    fn: (changed: string, value: unknown, oldValue: unknown, root: Record<string, unknown>) => void,
  ): () => void
  dispatchPageEvent(event: string, origin: string, el: Element | null, payload: unknown): void
  logEvent(entry: Record<string, unknown>): unknown
  /** Called when a prop is set after mount. */
  onPropSet(prop: string, value: unknown): void
}

export interface MountedCustomObject {
  /** Prop changes after mount. */
  update(nextProps: Record<string, unknown>): void
  /** The object left the page. Always safe to call. */
  destroy(): void
}

/** True when the object has anything to do at runtime at all. */
export function hasRuntimeCode(def: RuntimeCustomObject | undefined): boolean {
  if (!def) return false
  return (
    typeof def.onMount === 'function' ||
    typeof def.onUpdate === 'function' ||
    typeof def.onDestroy === 'function' ||
    (!!def.methods && Object.keys(def.methods).length > 0)
  )
}

/**
 * Attach a component to a live object: run `onMount`, wire `onUpdate`, and
 * register teardown.
 *
 * Teardown is the important part. Anything a component starts — an animation
 * loop, an observer, a WebGL context — is registered with `onCleanup`, so
 * leaving the page releases it. A component that forgets gets a hard throw at
 * `onMount` if it returns cleanup, and a `destroy` is wired whether or not it
 * declares `onDestroy`.
 */
export function mountCustomObject(input: MountInput): MountedCustomObject | null {
  const def = lookupCustomObject(input.objectName)
  if (!hasRuntimeCode(def)) return null
  const component = def as RuntimeCustomObject

  // ── state, scoped to this instance ────────────────────────────────────────
  const scope = input.id
  const state = {
    get(key: string): unknown {
      const root = input.readState()
      const bag = root[scope]
      return bag && typeof bag === 'object' ? (bag as Record<string, unknown>)[key] : undefined
    },
    set(key: string, value: unknown): void {
      input.commitState(`${scope}.${key}`, (root) => {
        const bag = typeof root[scope] === 'object' && root[scope] !== null ? (root[scope] as Record<string, unknown>) : {}
        bag[key] = value
        root[scope] = bag
      })
    },
    append(key: string, item: unknown): void {
      const current = state.get(key)
      state.set(key, Array.isArray(current) ? [...current, item] : [item])
    },
    remove(key: string): void {
      input.commitState(`${scope}.${key}`, (root) => {
        const bag = root[scope]
        if (bag && typeof bag === 'object') delete (bag as Record<string, unknown>)[key]
      })
    },
    getAll(): Record<string, unknown> {
      const bag = input.readState()[scope]
      return bag && typeof bag === 'object' ? { ...(bag as Record<string, unknown>) } : {}
    },
    subscribe(listener: (key: string, value: unknown, oldValue: unknown) => void): () => void {
      return input.subscribePath(
        scope,
        (changed: string, value: unknown, oldValue: unknown) =>
          listener(changed.split('.').pop() ?? '', value, oldValue),
      )
    },
  }

  // `state` on the handle is scoped, so a method can say h.state.set('open', true)
  // without knowing the instance id.
  input.handle['state'] = state

  // ── methods, additive ─────────────────────────────────────────────────────
  for (const [name, fn] of Object.entries(component.methods ?? {})) {
    input.handle[name] = (...args: unknown[]) => fn(input.handle, ...args)
  }

  if (!input.el) {
    // No element — the object is not on this page. Methods still work, because
    // they operate on props and state rather than the DOM.
    return {
      update: (next) => component.onUpdate?.(next, makeCtx()),
      destroy: () => component.onDestroy?.(makeCtx()),
    }
  }

  // ── cleanup registry ──────────────────────────────────────────────────────
  const cleanups: Array<() => void> = []
  let destroyed = false
  const ctx = makeCtx()

  function makeCtx(): Record<string, unknown> {
    return {
      ui: input.ui,
      handle: input.handle,
      element: input.el,
      el: input.el,
      props: input.props,
      state,
      emit: (event: string, payload?: unknown) => {
        input.dispatchPageEvent(event, input.id, input.el, payload ?? {})
      },
      onCleanup: (fn: () => void) => {
        if (destroyed) {
          // Registered after teardown — run it now rather than leak it.
          try {
            fn()
          } catch (err) {
            input.logEvent({ level: 'error', message: `onCleanup after destroy failed: ${String(err)}` })
          }
          return
        }
        cleanups.push(fn)
      },
      name: component.name,
      id: input.id,
    }
  }

  // A rejected onPrepare must not leave the object half-built.
  const prepared = typeof component.onPrepare === 'function' ? component.onPrepare(makeCtx()) : undefined
  const finish = (): void => {
    if (destroyed) return
    destroyed = true
    try {
      component.onDestroy?.(makeCtx())
    } catch (err) {
      input.logEvent({ level: 'error', message: `${component.name} onDestroy failed: ${String(err)}` })
    }
    // Reverse order, so a teardown that depends on an earlier one still works.
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        cleanups[i]!()
      } catch (err) {
        input.logEvent({ level: 'error', message: `${component.name} cleanup failed: ${String(err)}` })
      }
    }
    cleanups.length = 0
  }

  try {
    if (prepared && typeof (prepared as Promise<void>).then === 'function') {
      ;(prepared as Promise<void>).then(() => {
        if (destroyed) return
        try {
          component.onMount?.(input.el!, makeCtx())
        } catch (err) {
          input.logEvent({ level: 'error', message: `${component.name} onMount failed: ${String(err)}` })
        }
      }, (err: unknown) => {
        input.logEvent({ level: 'error', message: `${component.name} onPrepare rejected: ${String(err)}` })
        finish()
      })
    } else {
      component.onMount?.(input.el, makeCtx())
    }
  } catch (err) {
    input.logEvent({ level: 'error', message: `${component.name} onMount failed: ${String(err)}` })
  }

  return {
    update: (next) => {
      if (destroyed) return
      try {
        component.onUpdate?.(next, makeCtx())
      } catch (err) {
        input.logEvent({ level: 'error', message: `${component.name} onUpdate failed: ${String(err)}` })
      }
    },
    destroy: finish,
  }
}
