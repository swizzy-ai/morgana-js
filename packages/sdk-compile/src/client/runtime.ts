/**
 * Page runtime — live object handles and the rest of `ctx.ui`.
 *
 * This module is bundled into `client.js` by the same bundler that handles
 * author actions, and it resolves props with the *same* `resolvePropsToCss`
 * the stylesheet was generated from. One resolver, so a value written at
 * runtime lays out exactly like one written at compile time.
 *
 * The manifest (`#__MORGANA_OBJECTS__`) is the source of truth for what
 * exists; the DOM is where writes land. Structure-changing operations have no
 * meaning once the page is built, so they raise rather than pretend.
 */

import { hydrateStyleCtx, resolvePropsToCss, type StyleCtx, type StyleCtxJSON } from '../style/props'
import { resolveMakeToken } from '../compile-ctx/tokens'
import { wrapElement } from './dom-handle'
import { extendHandle } from './handles'
import { hasRuntimeCode, mountCustomObject, type MountedCustomObject } from './custom-objects'
import type { PageManifest } from '../render/manifest'

/** What the string-built runtime hands over so this module can share its state. */
export interface RuntimeDeps {
  readState(): Record<string, unknown>
  commitState(path: string, mut: (root: Record<string, unknown>) => void): Record<string, unknown>
  subscribePath(path: string, fn: (path: string, value: unknown, oldValue: unknown, root: Record<string, unknown>) => void): () => void
  /** Join the binding index — elements added after first paint. Returns records added. */
  indexElement(el: Element): number
  /** Leave the binding index, dropping the element's subscriptions. */
  forgetElement(el: Element): void
  dispatchPageEvent(event: string, origin: string, el: Element | null, payload: unknown): void
  logEvent(entry: Record<string, unknown>): unknown
  makeTheme(): { get(): { mode: string }; set(mode: string): { mode: string } }
  onPageEvent(fn: (event: string, origin: string, el: Element | null, payload: unknown) => void): () => void
  navigate(url: string, opts?: { params?: Record<string, string>; transition?: string }): void
  /** Emit a `prop:changed` page event, for `on: 'id.prop.changed'` bindings. */
  dispatchPropChange?(origin: string, prop: string, value: unknown, oldValue: unknown, el: Element | null): void
}

const MANIFEST_EL_ID = '__MORGANA_OBJECTS__'
const RUNTIME_STYLE_ID = '__MORGANA_RUNTIME__'

/** Text props write textContent — destructive on a container, refused below. */
const TEXT_PROPS = new Set(['content', 'label', 'text', 'title', 'placeholder', 'description'])
/** Props that land on the element as a DOM property, not an attribute. */
const VALUE_PROPS = new Set(['value', 'checked', 'selected', 'indeterminate'])
/** Boolean props reflect presence/absence. */
const FLAG_PROPS = new Set(['disabled', 'hidden', 'open', 'readonly', 'required', 'multiple', 'autofocus'])
/** Props written verbatim as attributes. */
const ATTR_PROPS = new Set([
  'src', 'href', 'alt', 'name', 'type', 'rows', 'cols', 'target', 'rel', 'lang', 'role',
  'colspan', 'rowspan', 'min', 'max', 'step', 'pattern', 'accept', 'for', 'id', 'class', 'className',
  'srcset', 'sizes', 'loading', 'decoding', 'download', 'hreflang', 'media', 'integrity',
])

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

function compileOnly(op: string, id: string): Error {
  return new Error(
    `${op}() is a compile-time operation — "${id}" is built into the page before it runs. ` +
      `Move the call into an action with config.on: "compile".`,
  )
}

let cachedManifest: PageManifest | null = null
let cachedCtx: StyleCtx | null = null
let cachedElements: Map<string, HTMLElement> | null = null

/**
 * Re-read the manifest from the document. Cached for the lifetime of one
 * `makeUi` call — which the runtime calls once per page load — and reset on
 * entry so a fresh document is never served from a previous one.
 */
function loadManifest(): PageManifest {
  const el = document.getElementById(MANIFEST_EL_ID)
  if (!el || !el.textContent) {
    throw new Error('[Morgana] object manifest missing — the page was not built by @morgana/sdk-compile')
  }
  const parsed = JSON.parse(el.textContent) as PageManifest
  cachedManifest = parsed
  cachedCtx = hydrateStyleCtx(parsed.style as StyleCtxJSON)
  cachedElements = null
  return parsed
}

function manifest(): PageManifest {
  return cachedManifest ?? loadManifest()
}

function styleCtx(): StyleCtx {
  if (!cachedCtx) manifest()
  return cachedCtx as StyleCtx
}

/** The rendered tree is static, so one scan indexes every entity for good. */
function elementIndex(): Map<string, HTMLElement> {
  if (cachedElements) return cachedElements
  const map = new Map<string, HTMLElement>()
  const nodes = document.querySelectorAll('[data-entity]')
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i] as HTMLElement
    const id = el.getAttribute('data-entity')
    if (id !== null && !map.has(id)) map.set(id, el)
  }
  cachedElements = map
  return map
}

function elementFor(id: string): HTMLElement | null {
  return elementIndex().get(id) ?? null
}

/** NodeList has no iterator under this package's lib, so copy it by index. */
function queryAll(selector: string): Element[] {
  const found = document.querySelectorAll(selector)
  const out: Element[] = []
  for (let i = 0; i < found.length; i++) out.push(found[i] as Element)
  return out
}

function requireElement(id: string): HTMLElement {
  const el = elementFor(id)
  if (!el) {
    const known = [...elementIndex().keys()].slice(0, 8).join(', ')
    throw new Error(
      `[Morgana] no rendered object "${id}" on this page` +
        (known ? ` (on this page: ${known}${elementIndex().size > 8 ? ', …' : ''})` : ''),
    )
  }
  return el
}

// ── writing props ─────────────────────────────────────────────────────────

function applyCss(el: HTMLElement, kind: string, prop: string, value: unknown): void {
  if (value === null || value === undefined || value === '') {
    el.style.removeProperty(kebab(prop))
    return
  }
  const css = resolvePropsToCss({ [prop]: value }, kind, styleCtx())
  for (const [cssProp, cssValue] of Object.entries(css)) {
    el.style.setProperty(cssProp, cssValue)
  }
}

function applyText(el: HTMLElement, id: string, prop: string, value: unknown): void {
  // A container's children are the page — never replace them with a string.
  if (el.children.length > 0) {
    throw new Error(
      `[Morgana] cannot set "${prop}" on "${id}": it renders ${el.children.length} child object(s). ` +
        `Set the prop on a leaf, or use ctx.ui.state + bind().`,
    )
  }
  const text = value === null || value === undefined ? '' : String(value)
  if (prop === 'title') {
    el.setAttribute('title', text)
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') (el as HTMLInputElement).value = text
    else el.textContent = text
    return
  }
  el.textContent = text
}

function applyValue(el: HTMLElement, prop: string, value: unknown): void {
  ;(el as unknown as Record<string, unknown>)[prop] =
    value === null || value === undefined ? false : value
}

function applyFlag(el: HTMLElement, prop: string, value: unknown): void {
  const on = value !== false && value !== null && value !== undefined && value !== 0 && value !== 'false'
  if (on) el.setAttribute(prop, '')
  else el.removeAttribute(prop)
  if (prop === 'hidden') el.style.display = on ? 'none' : ''
}

function applyAttr(el: HTMLElement, prop: string, value: unknown): void {
  const name = prop === 'className' ? 'class' : prop
  if (value === null || value === undefined || value === false) el.removeAttribute(name)
  else el.setAttribute(name, String(value))
}

/** Write one prop to the page. Structural props go through the resolver. */
function applyProp(id: string, kind: string, el: HTMLElement, prop: string, value: unknown): void {
  if (prop === 'id' || prop === 'data-entity') return
  if (TEXT_PROPS.has(prop)) return applyText(el, id, prop, value)
  if (VALUE_PROPS.has(prop)) return applyValue(el, prop, value)
  if (FLAG_PROPS.has(prop)) return applyFlag(el, prop, value)
  if (ATTR_PROPS.has(prop)) return applyAttr(el, prop, value)
  return applyCss(el, kind, prop, value)
}

// ── runtime stylesheet (breakpoint writes) ─────────────────────────────────

function mediaQueryFor(bp: string): string | null {
  const shape = manifest().breakpoints[bp]
  if (!shape) {
    throw new Error(`[Morgana] unknown breakpoint "${bp}" — define it with ctx.ui.breakpoints.define() in a compile action`)
  }
  const conds: string[] = []
  if (typeof shape.minWidth === 'number') conds.push(`(min-width:${shape.minWidth}px)`)
  if (typeof shape.maxWidth === 'number') conds.push(`(max-width:${shape.maxWidth}px)`)
  return conds.length ? conds.join(' and ') : null
}

function selectorFor(id: string): string {
  return `[data-entity="${id.replace(/["\\]/g, '\\$&')}"]`
}

/**
 * Rewrite the runtime sheet from the manifest so injected rules can never
 * drift from what the handles recorded. A handful of rules; correctness beats
 * incremental patching.
 */
function flushRuntimeSheet(): void {
  const m = manifest()
  const out: string[] = []
  for (const [id, meta] of Object.entries(m.objects)) {
    for (const [bp, props] of Object.entries(meta.breakpoints ?? {})) {
      const query = mediaQueryFor(bp)
      if (!query) continue
      const css = resolvePropsToCss(props, meta.kind, styleCtx())
      const decls = Object.entries(css).map(([k, v]) => `${k}:${v}`).join(';')
      if (decls) out.push(`@media ${query}{${selectorFor(id)}{${decls}}}`)
    }
  }
  let styleEl = document.getElementById(RUNTIME_STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = RUNTIME_STYLE_ID
    const head = document.head || document.documentElement
    head.appendChild(styleEl)
  }
  styleEl.textContent = out.join('\n')
}

function escapeId(id: string): string {
  return id.replace(/["\\]/g, '\\$&')
}

/** Bind spec currently on the element, as a list of [prop, source] pairs. */
function readBindSpec(el: HTMLElement): Array<[string, string]> {
  const spec = el.getAttribute('data-bind')
  if (!spec) return []
  return spec
    .split(';')
    .map((part) => part.split(':'))
    .filter((kv) => kv.length >= 2)
    .map((kv) => [kv[0] as string, kv.slice(1).join(':') as string])
}

function writeBindSpec(el: HTMLElement, pairs: Array<[string, string]>): void {
  if (pairs.length === 0) el.removeAttribute('data-bind')
  else el.setAttribute('data-bind', pairs.map(([p, s]) => `${p}:${s}`).join(';'))
}

// ── handles ───────────────────────────────────────────────────────────────

type EventName = string
type Handler = (event: unknown) => void | Promise<void>

export function makeUi(deps: RuntimeDeps): Record<string, unknown> {
  const m = loadManifest()
  const handles = new Map<string, Record<string, unknown>>()
  /**
   * Objects that have at least one derived (function-valued) prop. Re-evaluated
   * on every state commit so a resolver never freezes at its initial value.
   */
  const derivedHandlers = new Map<string, () => void>()
  /** Mounted custom object components, so their teardown runs exactly once. */
  const mountedComponents = new Map<string, MountedCustomObject>()

  function makeObject(id: string): Record<string, unknown> | undefined {
    const meta = m.objects[id]
    if (!meta) return undefined
    const existing = handles.get(id)
    if (existing) return existing
    const el = elementFor(id)
    const kind = meta.kind

    /**
     * Derived-value resolvers. `Resolver<T>` (sdk/handles.ts) is
     * `T | ((objects: ObjectLookup) => T)`; a function is kept here and
     * re-evaluated whenever the object graph changes, which is what makes a
     * prop reactive rather than a one-time stringification.
     */
    const lookup = {
      get(name: string): Record<string, unknown> | undefined {
        return makeObject(name)
      },
    }

    /** Derived (function-valued) props on this object. */
    const resolvers: Array<{ prop: string; fn: (o: typeof lookup) => unknown }> = []
    let derivedWatch: (() => void) | null = null

    const dispatchPropChange = (prop: string, value: unknown, oldValue: unknown): void => {
      const d = deps as unknown as { dispatchPropChange?: (o: string, p: string, v: unknown, ov: unknown, el: Element | null) => void }
      d.dispatchPropChange?.(id, prop, value, oldValue, el)
    }

    const setProp = (prop: string, value: unknown): void => {
      if (typeof value === 'function') {
        const fn = value as (o: typeof lookup) => unknown
        meta.props[prop] = fn(lookup)
        resolvers.push({ prop, fn })
        derivedHandlers.set(id, reevaluate)
        if (el) applyProp(id, kind, el, prop, meta.props[prop])
        if (resolvers.length === 1) watchDerived()
        return
      }
      const idx = resolvers.findIndex((r) => r.prop === prop)
      if (idx >= 0) resolvers.splice(idx, 1)
      const oldValue = meta.props[prop]
      meta.props[prop] = value
      if (el) applyProp(id, kind, el, prop, value)
      // A component reads its props through onUpdate, not by re-inspecting.
      mountedComponents.get(id)?.update({ ...meta.props })
      // A prop watcher is a real change, not a state echo — set() fires it
      // whether or not anything is bound to it.
      if (oldValue !== value) dispatchPropChange(prop, value, oldValue)
    }
    const setMany = (props: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(props ?? {})) setProp(key, value)
    }

    // Re-run every derived prop on this object.
    const reevaluate = (): void => {
      for (const r of resolvers.slice()) {
        meta.props[r.prop] = r.fn(lookup)
        if (el) applyProp(id, kind, el, r.prop, meta.props[r.prop])
      }
    }

    // One subscription for the whole page, created with the first derived prop.
    // Subscribing to '' matches every commit (pathOverlaps treats "" as a
    // wildcard), so a resolver re-evaluates whenever anything it might read has
    // changed.
    const watchDerived = (): void => {
      if (derivedWatch) return
      derivedWatch = deps.subscribePath('', () => {
        for (const fn of derivedHandlers.values()) {
          try {
            fn()
          } catch (err) {
            deps.logEvent({ level: 'error', message: `derived prop failed: ${String(err)}` })
          }
        }
      })
    }

    const handle: Record<string, unknown> = {
      __nodeId: id,
      get name() {
        return id
      },
      get type() {
        return kind
      },
      get family() {
        return kind
      },
      get(prop: string) {
        return meta.props[prop]
      },
      set(prop: string, value: unknown) {
        setProp(prop, value)
        return handle
      },
      setProps(props: Record<string, unknown>) {
        setMany(props)
        return handle
      },
      make(...args: unknown[]) {
        // Three documented forms (sdk/handles.ts:230-238):
        //   make('red')                      bare token
        //   make('radius', 'lg')             explicit property + value
        //   make({ bg: 'red', radius: 'lg' }) bulk props
        if (args.length === 2 && typeof args[0] === 'string') {
          setProp(args[0] as string, args[1])
          return handle
        }
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
          setMany(args[0] as Record<string, unknown>)
          return handle
        }
        if (args.length === 1 && typeof args[0] === 'string') {
          const token = args[0] as string
          const resolved = resolveMakeToken(kind, token)
          if (!Object.keys(resolved).length) {
            throw new Error(
              `[Morgana] make("${token}") is not a known token — it would set nothing. ` +
                `Use make('prop', value) or make({ prop: value }) for anything else.`,
            )
          }
          setMany(resolved)
          return handle
        }
        throw new Error('[Morgana] make() takes a token, a prop+value pair, or a props object')
      },
      /** Re-evaluate every derived prop on this object. */
      reevaluate,
      setWithBreakpoint(bp: string, propOrProps: string | Record<string, unknown>, value?: unknown) {
        const scope = (meta.breakpoints[bp] ??= {})
        if (typeof propOrProps === 'string') scope[propOrProps] = value
        else Object.assign(scope, propOrProps)
        flushRuntimeSheet()
        return handle
      },
      getWithBreakpoint(bp: string, prop: string) {
        return meta.breakpoints[bp]?.[prop]
      },
      breakpointProps() {
        return meta.breakpoints
      },
      clearBreakpoint(bp: string, prop?: string) {
        if (prop === undefined) delete meta.breakpoints[bp]
        else if (meta.breakpoints[bp]) delete meta.breakpoints[bp][prop]
        flushRuntimeSheet()
        return handle
      },
      place() {
        throw compileOnly('place', id)
      },
      addContent() {
        throw compileOnly('addContent', id)
      },
      clone() {
        throw compileOnly('clone', id)
      },
      copy() {
        throw compileOnly('copy', id)
      },
      bind(source: string, shape?: { key?: string; fields?: Record<string, string> }) {
        if (typeof source !== 'string') throw new Error('[Morgana] bind() takes a state path string')
        if (!el) return handle
        const pairs = readBindSpec(el)
        const existing = pairs.findIndex(([, s]) => s === source)
        if (existing >= 0) pairs.splice(existing, 1)
        const spec = shape?.key && shape?.fields ? `${shape.key}:${source}` : source
        pairs.push(['*', spec])
        writeBindSpec(el, pairs)
        return handle
      },
      move(to: unknown) {
        setProp('placement', to)
        return handle
      },
      remove() {
        // Release anything the component started before the node goes away.
        mountedComponents.get(id)?.destroy()
        mountedComponents.delete(id)
        el?.parentNode?.removeChild(el)
        handles.delete(id)
        delete m.objects[id]
        return handle
      },
      when(event: EventName, handler: Handler) {
        if (typeof event !== 'string') throw new Error('[Morgana] when() takes an event name')
        return deps.onPageEvent((name, origin, target, payload) => {
          if (name !== event) return
          if (origin !== id && origin !== '') return
          void handler({
            name,
            origin,
            element: target,
            payload,
            timestamp: Date.now(),
          })
        })
      },
      track(event: string) {
        if (typeof event === 'string' && !meta.tracked.includes(event)) meta.tracked.push(event)
        return { name: event, origin: { name: id } }
      },
      animate() {
        throw new Error(
          `[Morgana] animate() is not implemented for "${id}" — set a style prop or drive it from state.`,
        )
      },
      emit(event: string, payload?: unknown) {
        deps.dispatchPageEvent(event, id, el, payload ?? {})
      },
      getElement() {
        return el
      },
      getElements() {
        return el ? [el] : []
      },
    }
    // A custom object component: attach its methods and run its lifecycle. The
    // kind is whatever the component's `render` named, so it already inherited
    // that kind's renderer, behaviors and handle methods.
    if (meta.customObject) {
      const mounted = mountCustomObject({
        objectName: meta.customObject,
        id,
        el,
        props: meta.props,
        handle,
        ui,
        commitState: deps.commitState,
        readState: deps.readState,
        subscribePath: deps.subscribePath,
        dispatchPageEvent: deps.dispatchPageEvent,
        logEvent: deps.logEvent,
        onPropSet: () => {},
      })
      if (mounted) mountedComponents.set(id, mounted)
    }

    // Layer on the kind-specific methods each typed handle declares.
    extendHandle({
      id,
      kind,
      meta,
      el,
      setProp,
      getProp: (prop: string) => meta.props[prop],
      emit: (event: string, payload?: unknown) => deps.dispatchPageEvent(event, id, el, payload ?? {}),
      handle,
      reevaluate,
    })

    handles.set(id, handle)
    return handle
  }

  const CREATABLE = [
    'box', 'container', 'grid', 'card', 'group', 'stage', 'vstack', 'hstack',
    'tabs', 'accordion', 'dialog', 'dropdown', 'tooltip',
    'form', 'login', 'signup', 'slot',
    'header', 'main', 'footer', 'nav', 'section', 'article',
    'text', 'markdown', 'code', 'label',
    'button', 'input', 'textarea', 'select', 'checkbox', 'radio', 'switch', 'toggle',
    'list', 'lister', 'table', 'chart', 'badge', 'avatar',
    'alert', 'progress', 'skeleton', 'separator',
    'image', 'video', 'audio',
    'link', 'menu', 'breadcrumbs',
  ] as const

  const ui: Record<string, unknown> = {
    get: (name: string) => makeObject(name),
    all: () => Object.keys(manifest().objects).map((id) => makeObject(id)),
  }
  // `ctx.ui.<kind>` is a CREATOR, matching the type and the compile lane. There
  // is no per-kind lookup: `ctx.ui.get(id)` is the one way to reach an object, so
  // the same call cannot mean two different things on two lanes.
  for (const kind of CREATABLE) {
    ui[kind] = (props?: Record<string, unknown>) => {
      throw new Error(
        `[Morgana] ctx.ui.${kind}() creates an object, and creation is a compile-lane act — ` +
          'the object graph is compiled, so a page cannot grow one at runtime. ' +
          `Use ctx.ui.get('${kind}:id') to reach an existing one.`,
      )
    }
  }

  // ── pages ──
  function pageFor(name: string): Record<string, unknown> | undefined {
    const info = m.pages[name]
    if (!info) return undefined
    // A page is itself an object in the graph, so it gets a full handle.
    const base = makeObject(name) ?? {}
    const roots = m.roots[name] ?? []
    return {
      ...base,
      name,
      address: info.address,
      app: info.app,
      children: roots,
      params: {},
      getElement() {
        return roots.length ? elementFor(roots[0] as string) : null
      },
      getElements() {
        return roots.map((id) => elementFor(id)).filter(Boolean)
      },
    }
  }
  const pages = ((name?: string) =>
    name ? pageFor(name) : pageFor(manifest().page)) as unknown as Record<string, unknown>
  pages['get'] = (name: string) => pageFor(name)
  pages['all'] = () => Object.keys(manifest().pages).map((n) => pageFor(n)).filter(Boolean)
  pages['list'] = pages['all']
  pages['active'] = pageFor(manifest().page)
  pages['current'] = pages['active']
  pages['create'] = () => {
    throw new Error('[Morgana] pages.create() is compile-time only — declare pages in an action with config.on: "compile"')
  }
  pages['navigate'] = (addressOrName: string, opts?: { params?: Record<string, string>; transition?: string }) => {
    if (typeof addressOrName !== 'string' || addressOrName === '') {
      throw new Error('[Morgana] navigate() takes a page name or address')
    }
    const byName = manifest().pages[addressOrName]
    const byAddress = Object.keys(manifest().pages).find(
      (n) => manifest().pages[n]?.address === addressOrName,
    )
    const name = byName ? addressOrName : byAddress
    if (!name) {
      const known = Object.keys(manifest().pages).map((n) => manifest().pages[n]?.address).join(', ')
      throw new Error(`[Morgana] no page "${addressOrName}" (pages: ${known || 'none'})`)
    }
    // Check if this is an SPA page.
    //
    // `isSpa` is on the manifest at runtime for a page the router owns, but it is
    // not on the declared page shape — so it is read through a widened view rather
    // than by adding an optional field to a type that is built in several places.
    // The two object props are the fallback the compiler uses when the flag is
    // not written into the manifest.
    const pageInfo = manifest().pages[name] as { address: string; isSpa?: boolean } | undefined
    const isSpa = pageInfo && (pageInfo.isSpa === true || m.objects[name]?.props?.['isSpa'] === true || m.objects[name]?.props?.['spa'] === true)
    
    if (isSpa) {
      // SPA navigation: use router's navigate with address, not /pages/*.html
      deps.navigate(pageInfo.address, opts)
    } else {
      // Static page navigation: full page load
      deps.navigate(`/pages/${escapeId(name)}.html`)
    }
  }
  ui['pages'] = pages
  
  // ctx.ui.page with reactive params populated from router
  // `&&` narrows this to `false | …`, so `|| null` is what turns "no window" and
  // "no route" into the one value the reads below expect.
  const currentRoute = ((typeof window !== 'undefined' && (window as any).__morgana_router?.getCurrentRoute?.()) || null) as { params?: Record<string, string>; query?: Record<string, string> } | null
  ui['page'] = {
    name: manifest().page,
    address: manifest().address,
    url: typeof location !== 'undefined' ? location.pathname : manifest().address,
    params: { ...(currentRoute?.params ?? {}), ...(currentRoute?.query ?? {}) },
    keys: Object.keys(m.objects),
    getElement() {
      return elementFor(manifest().page)
    },
    getElements() {
      return (m.roots[manifest().page] ?? []).map((id) => elementFor(id)).filter(Boolean)
    },
  }

  // ── read-only compile-time registries ──
  const readOnly = (what: string) => () => {
    throw new Error(`[Morgana] ${what} is compile-time only — it is baked into the page at build time`)
  }
  ui['icons'] = {
    get: (name: string) => manifest().icons[name],
    has: (name: string) => Object.prototype.hasOwnProperty.call(manifest().icons, name),
    entries: () => Object.entries(manifest().icons),
    define: readOnly('icons.define()'),
    remove: readOnly('icons.remove()'),
  }
  const measures = manifest().style.measures ?? {}
  ui['measure'] = {
    unit: 4,
    get: (name: string) => measures[name],
    has: (name: string) => Object.prototype.hasOwnProperty.call(measures, name),
    entries: () => Object.entries(measures),
    define: readOnly('measure.define()'),
    remove: readOnly('measure.remove()'),
  }
  const bps = manifest().breakpoints ?? {}
  ui['breakpoints'] = {
    get: (name: string) => bps[name],
    has: (name: string) => Object.prototype.hasOwnProperty.call(bps, name),
    entries: () => Object.entries(bps),
    define: readOnly('breakpoints.define()'),
    remove: readOnly('breakpoints.remove()'),
  }
  const domain = (name: string) => ({
    has: () => false,
    get: () => undefined,
    entries: () => [],
    add: readOnly(`transformers.${name}.add()`),
    update: readOnly(`transformers.${name}.update()`),
    remove: readOnly(`transformers.${name}.remove()`),
  })
  ui['transformers'] = Object.fromEntries(
    ['effects', 'radius', 'spacing', 'dimensions', 'fonts', 'surfaces', 'layout', 'alignment', 'shorthands', 'colors'].map(
      (name) => [name, domain(name)],
    ),
  )
  // Apps and public vars are declared on BaseContext/ClientContext but were
  // absent from the built ctx, so ctx.apps / ctx.vars were undefined.
  ui['apps'] = {
    list: () => manifest().apps ?? [],
    get: (name: string) => (manifest().apps ?? []).find((a) => a.name === name),
    pages: (name: string) => (manifest().apps ?? []).find((a) => a.name === name)?.pages ?? [],
  }
  ui['vars'] = {
    get: (key: string) => (manifest().vars as Record<string, unknown> | undefined)?.[key],
    all: () => ({ ...(manifest().vars as Record<string, unknown> | undefined) }),
    has: (key: string) => key in ((manifest().vars as Record<string, unknown> | undefined) ?? {}),
  }
  ui['libraries'] = {
    get: (name: string) => manifest().libraries.find((l) => l.name === name),
    has: (name: string) => manifest().libraries.some((l) => l.name === name),
    define: readOnly('libraries.define()'),
  }

  // ── dom ──
  ui['dom'] = {
    get: (name: string) => elementFor(name),
    getElement: (name: string) => elementFor(name),
    getElements: (selector: string) => {
      if (typeof selector !== 'string' || selector === '') {
        throw new Error('[Morgana] dom.getElements() takes a selector')
      }
      return queryAll(selector)
    },
    // The real DomElementHandle (sdk/contexts/client.ts) — previously the
    // identity function, so all 24 of its methods were unreachable.
    wrap: (el: unknown) => {
      if (el && typeof el === 'object' && 'nodeType' in (el as Record<string, unknown>)) {
        return wrapElement(el as Element, { logEvent: deps.logEvent })
      }
      // Accepting a name keeps `wrap('cta')` working, which the previous
      // implementation allowed by accident.
      const byName = elementFor(String(el))
      if (!byName) throw new Error(`[Morgana] dom.wrap("${String(el)}") — no such object`)
      return wrapElement(byName, { logEvent: deps.logEvent })
    },
    getObject: (name: string) => makeObject(name),
    getInterfaceObject: (kind: string, name: string) => makeObject(name),
    setContents: (name: string, html: string) => {
      const el = requireElement(name)
      if (el.children.length > 0) {
        throw new Error(
          `[Morgana] dom.setContents("${escapeId(name)}") would replace ${el.children.length} rendered child object(s) — ` +
            `change those objects instead`,
        )
      }
      el.innerHTML = String(html ?? '')
    },
    setAttributes: (name: string, attrs: Record<string, unknown>) => {
      const el = requireElement(name)
      for (const [k, v] of Object.entries(attrs ?? {})) applyAttr(el, k, v)
    },
    setStyles: (name: string, styles: Record<string, unknown>) => {
      const el = requireElement(name)
      for (const [k, v] of Object.entries(styles ?? {})) {
        if (v === null || v === undefined || v === '') el.style.removeProperty(kebab(k))
        else el.style.setProperty(kebab(k), String(v))
      }
    },
    onEvent: (event: string, fn: Handler) => {
      if (typeof event !== 'string' || event === '') {
        throw new Error('[Morgana] dom.onEvent() takes an event name')
      }
      const listener = fn as EventListener
      document.addEventListener(event, listener)
      return () => document.removeEventListener(event, listener)
    },
  }

  // ── state / theme / events, shared with the string runtime ──
  ui['state'] = {
    get: (p: string) => {
      const root = deps.readState()
      if (!p) return root
      return p.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], root)
    },
    set: (p: string, v: unknown) => {
      const parts = String(p).split('.')
      deps.commitState(p, (root) => {
        let cur = root
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i] as string
          if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {}
          cur = cur[key] as Record<string, unknown>
        }
        cur[parts[parts.length - 1] as string] = v
      })
    },
    append: (p: string, item: unknown) => {
      const ui2 = ui['state'] as { get(path: string): unknown; set(path: string, v: unknown): void }
      const cur = ui2.get(p)
      ui2.set(p, Array.isArray(cur) ? [...cur, item] : [item])
    },
    remove: (p: string) => {
      const parts = String(p).split('.')
      deps.commitState(p, (root) => {
        let cur: Record<string, unknown> | undefined = root
        for (let i = 0; i < parts.length - 1; i++) {
          cur = (cur?.[parts[i] as string] as Record<string, unknown> | undefined) ?? undefined
        }
        if (cur) delete cur[parts[parts.length - 1] as string]
      })
    },
    getAll: () => deps.readState(),
    subscribe: (listener: (path: string, value: unknown, oldValue: unknown, root: Record<string, unknown>) => void) =>
      deps.subscribePath('', listener),
  }
  const theme = deps.makeTheme()
  ui['theme'] = theme
  ui['getTheme'] = theme.get
  ui['setTheme'] = theme.set
  ui['setState'] = (next: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)) => {
    const state = ui['state'] as { set(p: string, v: unknown): void; getAll(): Record<string, unknown> }
    const patch = typeof next === 'function' ? next(state.getAll()) : next
    for (const [k, v] of Object.entries(patch ?? {})) state.set(k, v)
    return state.getAll()
  }
  ui['getState'] = () => deps.readState()
  ui['when'] = (event: string, handler: Handler) => {
    if (typeof event === 'string' && /^state[:.]/.test(event)) {
      const path = event.replace(/^state[:.]/, '')
      return deps.subscribePath(path, (p, value, oldValue, root) => {
        void handler({ name: `state:${path}`, origin: 'state', element: null, payload: { path: p, value, oldValue, root }, timestamp: Date.now() })
      })
    }
    if (typeof event === 'string') return deps.onPageEvent((name, origin, el, payload) => {
      if (name === event) void handler({ name, origin, element: el, payload, timestamp: Date.now() })
    })
    throw new Error('[Morgana] when() takes an event name or "state:<path>"')
  }
  // The one event surface. `__morgana_events` (client/transport.ts) owns the
  // network half — channel streams, refcounted connections, reconnection — and
  // the page bus still owns everything local. Routing through the transport for
  // channels and the bus for everything else is what keeps the two from becoming
  // two systems: a page bus that is also the join point for frames arriving
  // from the network.
  const transport = (deps as unknown as {
    __morgana_events?: {
      subscribe: (event: string, scope?: unknown, handler?: Handler) => () => void
      attach: (stream: string, ticket: string, opts?: unknown) => () => void
      detach: (stream: string) => void
    }
  }).__morgana_events

  ui['events'] = {
    emit: (event: string, payload?: unknown) => deps.dispatchPageEvent(event, '', null, payload ?? {}),
    on: (event: string, handler: Handler) => deps.onPageEvent((name, origin, el, payload) => {
      if (name === event) void handler({ name, origin, element: el, payload, timestamp: Date.now() })
    }),
    // subscribe: local page events stay on the page bus; `channel:<name>`
    // crosses the network through the transport. Both paths return a real
    // unsubscribe and both deliver to the same handler shape.
    subscribe: (event: string, scope?: unknown, handler?: Handler) => {
      if (typeof event !== 'string' || event === '') {
        throw new Error('[Morgana] events.subscribe() takes an event name')
      }
      if (transport && /^channel:/.test(event)) {
        return transport.subscribe(event, scope, handler)
      }
      const onFrame = scope && typeof scope === 'object'
        ? (scope as { onFrame?: (frame: unknown) => void }).onFrame
        : undefined
      return deps.onPageEvent((name, origin, el, payload) => {
        if (name !== event) return
        if (onFrame) onFrame({ stream: `page:${name}`, event: name, data: payload, timestamp: Date.now() })
        if (handler) void handler({ name, origin, element: el, payload, timestamp: Date.now() })
      })
    },
    // observe: same as subscribe, but also receives a descriptor, so a caller
    // can distinguish the origin element without re-reading the DOM.
    observe: (event: string, handler: Handler) => {
      if (typeof event !== 'string' || event === '') {
        throw new Error('[Morgana] events.observe() takes an event name')
      }
      return deps.onPageEvent((name, origin, el, payload) => {
        if (name !== event) return
        void handler({ name, origin, element: el, payload, target: el, timestamp: Date.now() })
      })
    },
    // The ring buffer bus.ts maintains, finally read.
    getLog: (filter?: string | { name?: string; lane?: string }) => {
      const anyDeps = deps as unknown as { getEventLog?: (f?: unknown) => unknown[] }
      if (typeof anyDeps.getEventLog === 'function') return anyDeps.getEventLog(filter)
      return []
    },
    // `channels` on the event surface: which channels this page currently holds
    // a stream for. Useful for a presence indicator, and for asserting in a
    // test that a subscription actually opened a connection rather than
    // silently registering nothing.
    channels: () => (transport ? (transport as unknown as { channels: () => string[] }).channels() : []),
    // Present a ticket and start receiving frames for its stream. Kept
    // separate from `subscribe` because a grant is a decision made somewhere
    // else — see events.ts on the grant/reject permission model.
    attach: transport
      ? (stream: string, ticket: string, opts?: unknown) => transport.attach(stream, ticket, opts)
      : undefined,
    detach: transport ? (stream: string) => transport.detach(stream) : undefined,
  }
  ui['track'] = (event: string) => ({ name: event, origin: { name: manifest().page } })
  // Declared as EventSource[] (sdk/contexts/client.ts) but returned a flat
  // string[] of event names.
  ui['sources'] = (): Array<{ name: string; action?: string; lane: string }> => {
    const anyDeps = deps as unknown as { getEventSources?: () => Array<{ name: string; action?: string; lane: string }> }
    const fromBindings = typeof anyDeps.getEventSources === 'function' ? anyDeps.getEventSources() : []
    const seen = new Set(fromBindings.map((s) => s.name))
    const fromObjects: Array<{ name: string; action?: string; lane: string }> = []
    for (const id of Object.keys(manifest().objects)) {
      for (const name of manifest().objects[id]?.tracked ?? []) {
        if (seen.has(name)) continue
        seen.add(name)
        fromObjects.push({ name, lane: 'object' })
      }
    }
    return [...fromBindings, ...fromObjects]
  }

  return ui
}
