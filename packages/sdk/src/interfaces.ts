/**
 * Custom objects — types Morgana does not ship.
 *
 * A custom object is a **named container** with an interior you compose from
 * built-in kinds, its own state, its own control methods, and an optional
 * browser lifecycle. A Three.js scene, a video player, a Monaco editor, a
 * bespoke table.
 *
 * ── The file contract ────────────────────────────────────────────────────────
 *
 * Custom objects live in `src/objects/*.ts`, one per file, each default-exporting
 * a definition:
 *
 *   import { createCustomObject } from '@morgana/sdk'
 *
 *   export default createCustomObject({
 *     name: 'video-player',
 *     define: (handle, ctx) => { handle.place(ctx.ui.video({ id: 'video' })) },
 *   })
 *
 * The compiler bundles that directory into `dist/custom-objects.js`. There is no
 * registration step and no manifest to hand-edit — which is what makes "drop a
 * downloaded component in and use it" work with nothing else to configure. The
 * file *is* the component; you own and edit it, the way you do with shadcn.
 *
 * ── Two lanes, deliberately different ────────────────────────────────────────
 *
 *   COMPILE lane (Node, at build)   — `define`, `state`, `defaultProps`, `render`
 *   BROWSER lane (the page)         — `onPrepare`/`onMount`/`onUpdate`/`onDestroy`
 *
 * `define` has **no DOM surface** — there is no `element` in its context, and no
 * `document` exists when it runs. Anything that touches the DOM belongs in
 * `onMount`. Keeping the two contexts visibly different is the point: the two
 * failure modes look nothing alike and the type signatures make the mistake
 * visible at the call site.
 *
 * `on*` hooks are the browser lifecycle. `define` is not a lifecycle event, which
 * is why it is not named `on*`.
 *
 * ── A component ships nothing unless it needs to ─────────────────────────────
 *
 * A pure-`define` component is compiled into real objects and contributes **zero**
 * bytes of client JavaScript — the interior is a real `video`, with real CSS, real
 * behaviors and working `bind()`. Only a component that declares a browser hook or
 * `methods` puts code in the bundle.
 */

/** A custom object is a container unless it explicitly says otherwise. */
export type CustomObjectRender = string

// ── compile lane ───────────────────────────────────────────────────────────

/** Context passed to `define` — runs in Node at build time. No DOM here. */
export interface CustomObjectDefineContext {
  /** The creator, for building the interior out of built-in kinds. */
  ui: Record<string, any>
  /** This object's handle — the same one `define` receives as its first argument. */
  handle: Record<string, any>
  /** Resolved props: `defaultProps` merged with whatever the caller passed. */
  props: Record<string, any>
  /** This instance's state, already seeded from `state`. Namespaced, bindable. */
  state: Record<string, any>
  /** The object name (its type). */
  name: string
  /** This instance's id. Interior ids are namespaced under it. */
  id: string
}

// ── browser lane ───────────────────────────────────────────────────────────

/** Context passed to every `on*` hook — runs in the page. */
export interface CustomObjectClientContext {
  /** The live `ctx.ui` — reach and drive every other object on the page. */
  ui: Record<string, any>
  /** This object's live handle, with its own methods attached. */
  handle: Record<string, any>
  /** The element Morgana rendered for this object. */
  element: HTMLElement
  /** The element, for the common case where you only need it. */
  el: HTMLElement
  /** Current props. */
  props: Record<string, any>
  /** This instance's state, scoped: `get`/`set`/`append`/`remove`/`subscribe`. */
  state: {
    get(key: string): unknown
    set(key: string, value: unknown): void
    append(key: string, item: unknown): void
    remove(key: string): void
    getAll(): Record<string, unknown>
    subscribe(listener: (key: string, value: unknown, oldValue: unknown) => void): () => void
  }
  /** Emit one of this definition's declared `events`. */
  emit(event: string, payload?: unknown): void
  /**
   * Register teardown for anything the hook starts — animation loops,
   * observers, listeners, GPU contexts. Runs on `onDestroy`, and on unmount even
   * if `onDestroy` is absent. This is the difference between a component that
   * works and one that works until you reload five times.
   */
  onCleanup(fn: () => void): void
  /** Object name and instance id. */
  name: string
  id: string
}

export interface CustomObjectDefinition<
  P extends Record<string, any> = Record<string, any>,
  Events extends string = string
> {
  /**
   * The object's name. This is the whole identifier — there is no family, no
   * category, no namespace. It becomes `ctx.ui.<camelCased name>`.
   */
  name: string

  /**
   * Which built-in kind this object **is**. Defaults to `'box'`, which is right
   * for nearly every component, because a container composed of built-ins gets
   * their full behaviour for free.
   *
   * Set it only when you want the object to genuinely *be* a built-in kind — a
   * single element rather than a wrapper, with that kind's handle. `render: 'table'`
   * gives you a real table with all 24 `TableHandle` methods and no wrapper node.
   *
   * The trade: this couples the component to that built-in's contract. If the
   * built-in changes, the component moves with it. Opt in deliberately.
   */
  render?: CustomObjectRender

  /**
   * Build the interior. Runs in the compile lane with the real `ctx.ui`, so the
   * objects you place are ordinary built-ins — real CSS, real behaviors, real
   * `bind()`. The returned object is ignored; place onto `handle` instead.
   */
  define?(handle: Record<string, any>, ctx: CustomObjectDefineContext): void

  /**
   * Component-owned state, seeded per instance. Lands in the page state root
   * under the instance id, so it is visible to `ctx.getState()`, subscribable,
   * and **bindable by the user** — `bind('hero.open')` just works.
   */
  state?: Record<string, unknown>

  /**
   * Every prop this object accepts, with its default. Undeclared props still
   * reach the hooks, but declaring them is what makes them documented and
   * inspectable.
   */
  defaultProps?: Partial<P>
  /** Alias for `defaultProps`, for authors who prefer it. `defaultProps` wins. */
  props?: Partial<P>

  /** Events this object emits. Declared so `when()` and trackables know them. */
  events?: readonly Events[] | Events[]

  /** Free-form documentation, carried with a downloadable component. */
  description?: string

  // ── browser lifecycle ─────────────────────────────────────────────────────

  /**
   * Preload, before anything is mounted. May be async — the page waits.
   * Use for a library that must be fetched or compiled first.
   */
  onPrepare?(ctx: CustomObjectClientContext): void | Promise<void>

  /** Runs when the element exists, once per instance. */
  onMount?(el: HTMLElement, ctx: CustomObjectClientContext): void

  /** Runs when the object's props change after mount. */
  onUpdate?(nextProps: P, ctx: CustomObjectClientContext): void

  /** Runs when the object leaves the page. Always registered as cleanup. */
  onDestroy?(ctx: CustomObjectClientContext): void

  /**
   * Methods attached to the handle, additively — a custom object whose
   * `render` is `'table'` keeps all 24 `TableHandle` methods and adds these.
   *
   * The handle is the first argument, so a method can read props (`h.get`) and
   * drive state (`h.state.set`) the same way built-in methods do.
   */
  methods?: Record<string, (handle: any, ...args: any[]) => any>
}

// ── registry ───────────────────────────────────────────────────────────────

/**
 * Populated when a custom-object module is evaluated — on the client at page
 * load, and in Node when a compile action imports the same module. A
 * pure-`define` component never reaches either, because it ships no code.
 */
const registry = new Map<string, CustomObjectDefinition<any, any>>()

/** Internal: provenance, so two components claiming one name is a real error. */
interface WithSource {
  __sourceModule?: string
}

function camelCase(name: string): string {
  return name.replace(/[-_.]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))
}

/** `video-player` → `videoPlayer`, the creator suffix on `ctx.ui`. */
export function creatorNameFor(objectName: string): string {
  return camelCase(objectName)
}

export function registerCustomObject(definition: CustomObjectDefinition): CustomObjectDefinition {
  if (!definition || typeof definition.name !== 'string' || definition.name.trim() === '') {
    throw new Error('[Morgana] a custom object needs a non-empty `name`')
  }
  if (!/^[a-z][a-z0-9-]*$/i.test(definition.name)) {
    throw new Error(
      `[Morgana] custom object name "${definition.name}" is not usable — ` +
        'use letters, digits and dashes, starting with a letter (e.g. "video-player")',
    )
  }
  for (const key of ['defaultProps', 'props', 'state'] as const) {
    const v = definition[key]
    if (v !== undefined && (typeof v !== 'object' || v === null || Array.isArray(v))) {
      throw new Error(`[Morgana] "${definition.name}" — \`${key}\` must be a plain object`)
    }
  }
  if (definition.render !== undefined && typeof definition.render !== 'string') {
    throw new Error(`[Morgana] "${definition.name}" — \`render\` must be a built-in kind name`)
  }
  for (const hook of ['onPrepare', 'onMount', 'onUpdate', 'onDestroy'] as const) {
    if (definition[hook] !== undefined && typeof definition[hook] !== 'function') {
      throw new Error(`[Morgana] "${definition.name}" — \`${hook}\` must be a function`)
    }
  }
  if (definition.define !== undefined && typeof definition.define !== 'function') {
    throw new Error(`[Morgana] "${definition.name}" — \`define\` must be a function`)
  }

  const key = definition.name.toLowerCase()
  const previous = registry.get(key) as WithSource | undefined
  if (previous && previous !== definition) {
    const prevSrc = previous.__sourceModule
    const nextSrc = (definition as WithSource).__sourceModule
    if (prevSrc && nextSrc && prevSrc !== nextSrc) {
      throw new Error(
        `[Morgana] two custom objects both claim the name "${definition.name}": ${prevSrc} and ${nextSrc}`,
      )
    }
  }
  registry.set(key, definition)
  return definition
}

/** Look up a registered custom object by name. */
export function getCustomObject(name: string): CustomObjectDefinition | undefined {
  return registry.get(name.toLowerCase())
}

/** Every registered custom object. */
export function getAllCustomObjects(): CustomObjectDefinition[] {
  return [...registry.values()]
}

/** True when a name belongs to a custom object rather than a built-in kind. */
export function isCustomObject(name: string): boolean {
  return registry.has(name.toLowerCase())
}

/** Clear the registry (tests, teardown). */
export function clearCustomObjects(): void {
  registry.clear()
}

/** Internal: record which module a definition came from, for conflict detection. */
export function markCustomObjectSource(definition: unknown, module: string): void {
  if (definition && typeof definition === 'object') (definition as WithSource).__sourceModule = module
}

/**
 * Define a custom object. This is what a component file default-exports.
 *
 * @example
 * export default createCustomObject({
 *   name: 'badge-counter',
 *   state: { count: 0 },
 *   events: ['reached'],
 *   methods: {
 *     increment: (h, by = 1) => h.state.set('count', Number(h.state.get('count') ?? 0) + by),
 *   },
 *   define: (handle, ctx) => {
 *     handle.place(ctx.ui.badge({ id: 'b', content: String(ctx.state.count ?? 0) }))
 *   },
 * })
 */
export function createCustomObject<
  P extends Record<string, any> = Record<string, any>,
  Events extends string = string
>(definition: CustomObjectDefinition<P, Events>): CustomObjectDefinition<P, Events> {
  return registerCustomObject(definition) as CustomObjectDefinition<P, Events>
}

// ── legacy names ───────────────────────────────────────────────────────────

/** @deprecated Use {@link createCustomObject}. */
export const defineInterfaceObject = createCustomObject
/** @deprecated Use {@link createCustomObject}. */
export const defineObjectHandle = createCustomObject
/** @deprecated Use {@link createCustomObject}. */
export const registerInterfaceObject = registerCustomObject
/** @deprecated Use {@link getCustomObject}. */
export const getInterfaceObjectDefinition = getCustomObject
/** @deprecated Use {@link getAllCustomObjects}. */
export const getAllInterfaceObjectDefinitions = getAllCustomObjects
/** @deprecated Use {@link clearCustomObjects}. */
export const clearInterfaceObjectDefinitions = clearCustomObjects
