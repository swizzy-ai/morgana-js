/**
 * Compile-time registries: transformers, breakpoints, icons, measure,
 * state, vars, apps, pages, ui assembly, object creation.
 */
import type { MorganaConfig } from '@morgana/sdk';
import type { ProjectIR } from '../ir';
import { createKindFn, ensureNode, makeHandle, nextAutoId, type CompileState } from './handles';
import { creatorNameFor } from '@morgana/sdk';

export const CREATABLE_KINDS = [
  'page',
  'box', 'container', 'grid', 'card', 'group', 'stage',
  'vstack', 'hstack',
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

const TRANSFORMER_DOMAINS = [
  'effects', 'radius', 'spacing', 'dimensions', 'fonts',
  'surfaces', 'layout', 'alignment', 'shorthands', 'colors',
] as const

export function buildTransformers(state: CompileState): Record<string, unknown> {
  const api: Record<string, unknown> = {}
  for (const domain of TRANSFORMER_DOMAINS) {
    const store = new Map<string, unknown>()
    api[domain] = {
      add: (key: string, value: unknown) => {
        if (!store.has(key.toLowerCase())) {
          store.set(key.toLowerCase(), value)
          state.ir.transformerMutations.push({ domain, op: 'add', key, value })
        }
      },
      update: (key: string, value: unknown) => {
        store.set(key.toLowerCase(), value)
        state.ir.transformerMutations.push({ domain, op: 'update', key, value })
      },
      remove: (key: string) => {
        store.delete(key.toLowerCase())
        state.ir.transformerMutations.push({ domain, op: 'remove', key })
      },
      has: (key: string) => store.has(key.toLowerCase()),
      get: (key: string) => store.get(key.toLowerCase()),
    }
  }
  return api
}

export function buildBreakpoints(state: CompileState): Record<string, unknown> {
  return {
    define: (name: string, shape: Record<string, unknown>) => {
      state.ir.breakpoints.set(name, shape as { minWidth?: number; maxWidth?: number; label?: string })
    },
    shape: (name: string, shape: Record<string, unknown>) => {
      state.ir.breakpoints.set(name, shape as { minWidth?: number; maxWidth?: number; label?: string })
    },
    get: (name: string) => state.ir.breakpoints.get(name),
    has: (name: string) => state.ir.breakpoints.has(name),
    entries: () => [...state.ir.breakpoints.entries()],
    remove: (name: string) => {
      state.ir.breakpoints.delete(name)
    },
  }
}

export function buildIcons(state: CompileState): Record<string, unknown> {
  const read = (name: string): { kind: string; [key: string]: unknown } | undefined =>
    state.ir.icons.get(name)
  return {
    define: (name: string, def: { kind: string; [key: string]: unknown }) => {
      if (!def || typeof def.kind !== 'string') throw new Error('ctx.ui.icons.define(name, def) requires def.kind')
      state.ir.icons.set(name, { ...def })
    },
    shape: (name: string, def: { kind: string; [key: string]: unknown }) => {
      if (!def || typeof def.kind !== 'string') throw new Error('ctx.ui.icons.shape(name, def) requires def.kind')
      state.ir.icons.set(name, { ...def })
    },
    get: (name: string) => read(name),
    has: (name: string) => state.ir.icons.has(name),
    entries: () => [...state.ir.icons.entries()],
    remove: (name: string) => {
      state.ir.icons.delete(name)
    },
  }
}

export function buildMeasure(state: CompileState): Record<string, unknown> {
  return {
    unit: 4,
    define: (name: string, units: number) => {
      state.ir.measures.set(name, units)
    },
    get: (name: string) => state.ir.measures.get(name),
    has: (name: string) => state.ir.measures.has(name),
    entries: () => [...state.ir.measures.entries()],
    remove: (name: string) => {
      state.ir.measures.delete(name)
    },
  }
}

export function buildState(state: CompileState): Record<string, unknown> {
  const getPath = (path: string): unknown => {
    if (!path) return state.ir.stateDefaults
    return path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], state.ir.stateDefaults)
  }
  const setPath = (path: string, value: unknown): void => {
    const parts = path.split('.')
    let cur = state.ir.stateDefaults as Record<string, unknown>
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i] as string
      if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
      cur = cur[p] as Record<string, unknown>
    }
    cur[parts[parts.length - 1] as string] = value
  }
  const api: Record<string, unknown> = {
    get: (p: string) => getPath(p),
    set: (p: string, v: unknown) => setPath(p, v),
    append: (p: string, item: unknown) => {
      const cur = getPath(p)
      const arr = Array.isArray(cur) ? [...cur] : []
      arr.push(item)
      setPath(p, arr)
    },
    remove: (p: string) => {
      const parts = p.split('.')
      let cur = state.ir.stateDefaults as Record<string, unknown>
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i] as string] as Record<string, unknown>
      if (cur) delete cur[parts[parts.length - 1] as string]
    },
    getAll: () => state.ir.stateDefaults,
  }
  return api
}

export function buildApps(state: CompileState): Record<string, unknown> {
  const getApp = (name: string) => state.ir.apps.get(name)
  const appHandle = (name: string): Record<string, unknown> => ({
    get name() {
      return name
    },
    get displayName() {
      return getApp(name)?.displayName
    },
    get description() {
      return getApp(name)?.description
    },
    get type() {
      return getApp(name)?.type ?? 'web'
    },
    get platform() {
      return getApp(name)?.platform
    },
    pages: () => {
      const app = getApp(name)
      if (!app) return []
      return app.pages.map((p) => {
        const page = state.ir.pages.get(p)
        return { name: p, address: page?.address ?? `/${p}` }
      })
    },
    page: (p: string) => {
      const app = getApp(name)
      if (!app || !app.pages.includes(p)) return undefined
      const page = state.ir.pages.get(p)
      return page ? { name: p, address: page.address } : undefined
    },
    addPage: (page: string | { __nodeId?: string }) => {
      const app = getApp(name)
      if (!app) throw new Error(`app "${name}" is not declared`)
      const pageName = typeof page === 'string' ? page : (page as { __nodeId?: string }).__nodeId ?? ''
      if (pageName && !app.pages.includes(pageName)) app.pages.push(pageName)
      const pg = state.ir.pages.get(pageName)
      if (pg) pg.app = name
      return appHandle(name)
    },
    removePage: (p: string) => {
      const app = getApp(name)
      if (app) app.pages = app.pages.filter((x) => x !== p)
      return appHandle(name)
    },
  })
  return {
    list: () =>
      [...state.ir.apps.values()].map((a) => appHandle(a.name)),
    app: (name: string) => (state.ir.apps.has(name) ? appHandle(name) : undefined),
    create: (name: string, opts?: { displayName?: string; description?: string; type?: 'web' | 'desktop'; platform?: { bundleId: string; icon?: string }; pages?: string[] }) => {
      // Options are optional: `create('site')` declares a plain web app, which is
      // the common case. Only a wrong *value* is refused, never an omission.
      const o = opts ?? {}
      const type = o.type ?? 'web'
      if (type !== 'web' && type !== 'desktop') {
        throw new Error(
          `app "${name}" has type "${String(type)}" — expected "web" or "desktop"`,
        )
      }
      // Required, not defaulted: a desktop app without a bundle id has no
      // identity for the OS to key the install and its data directory by, and
      // inventing one here would produce two apps that collide on install.
      if (type === 'desktop' && !o.platform?.bundleId) {
        throw new Error(
          `app "${name}" is type "desktop" and needs platform.bundleId ` +
            '(e.g. "com.acme.shop") — it is what the install is keyed by',
        )
      }
      if (!state.ir.apps.has(name)) {
        state.ir.apps.set(name, {
          name,
          displayName: o.displayName,
          description: o.description,
          pages: [...(o.pages ?? [])],
          type,
          // Recorded only for a desktop app, so a `web` app never carries a
          // bundle id that nothing will read.
          ...(type === 'desktop' && o.platform
            ? {
                platform: {
                  bundleId: o.platform.bundleId,
                  ...(o.platform.icon ? { icon: o.platform.icon } : {}),
                },
              }
            : {}),
        })
      }
      return appHandle(name)
    },
    remove: (name: string) => state.ir.apps.delete(name),
  }
}

export function buildVars(state: CompileState): Record<string, unknown> {
  const pub = (state.config.vars?.public ?? {}) as Record<string, unknown>
  const priv = (state.config.vars?.private ?? {}) as Record<string, unknown>
  const store: Record<string, unknown> = { ...pub, ...priv }
  return {
    get: (k: string) => store[k],
    set: (k: string, v: unknown) => {
      store[k] = v
    },
    getAll: () => ({ ...store }),
  }
}

export function buildPages(state: CompileState): unknown {
  const get = (name: string): unknown => {
    const page = state.ir.pages.get(name)
    if (!page) return undefined
    const node = state.ir.objects.get(name)
    if (!node) return undefined
    const handle = makeHandle(state, node) as Record<string, unknown>
    return {
      ...handle,
      children: [...page.rootIds],
      address: page.address,
      params: {},
      spa: () => undefined,
      route: () => undefined,
      app: (appName: string) => {
        page.app = appName
        const app = state.ir.apps.get(appName)
        if (app && !app.pages.includes(name)) app.pages.push(name)
        return get(name)
      },
      navigate: () => {},
      page: () => undefined,
    }
  }
  const fn = ((name?: string) => {
    if (!name) {
      const first = [...state.ir.pages.keys()][0]
      return first ? get(first) : undefined
    }
    return get(name)
  }) as unknown as Record<string, unknown>
  fn['get'] = (name: string) => get(name)
  fn['all'] = () =>
    [...state.ir.pages.values()].map((p) => get(p.name)).filter(Boolean)
  fn['list'] = fn['all']
  fn['active'] = undefined
  fn['current'] = undefined
  fn['navigate'] = () => {}
  fn['create'] = (props?: Record<string, unknown>) => {
    const name = (props?.['name'] as string) ?? `page_${nextAutoId().toString(36)}`
    const address = (props?.['address'] as string) ?? `/${name}`
    if (!state.ir.pages.has(name)) {
      state.ir.pages.set(name, { name, address, rootIds: [], app: (props?.['app'] as string) ?? null })
    }
    const node = ensureNode(state, 'page', { id: name, ...(props ?? {}) })
    const handle = makeHandle(state, node) as Record<string, unknown>
    const pageApi: Record<string, unknown> = {
      ...handle,
      children: state.ir.pages.get(name)?.rootIds ?? [],
      address,
      params: {},
      navigate: () => {},
      page: () => undefined,
    }
    pageApi['spa'] = () => pageApi
    pageApi['route'] = (p: string) => {
      state.ir.pages.get(name)!.address = p
      return pageApi
    }
    pageApi['app'] = (appName: string) => {
      state.ir.pages.get(name)!.app = appName
      const app = state.ir.apps.get(appName)
      if (app && !app.pages.includes(name)) app.pages.push(name)
      return pageApi
    }
    // page.place(child) attaches to rootIds instead of node children
    const basePlace = handle['place'] as (c: unknown, p?: unknown) => void
    pageApi['place'] = (child: unknown, placement?: unknown) => {
      const childId = (child as { __nodeId?: string })?.__nodeId
      if (!childId) throw new Error('place() expects an object handle')
      const page = state.ir.pages.get(name)!
      if (!page.rootIds.includes(childId)) page.rootIds.push(childId)
      basePlace(child, placement)
    }
    return pageApi
  }
  return fn
}

export function buildUi(state: CompileState): Record<string, unknown> {
  const ui: Record<string, unknown> = {}
  // `ctx.ui.<kind>(props)` CREATES. Lookup is `ctx.ui.get(id)` — one way to do
  // each thing, so the two can never be confused. Previously this was a lookup
  // and creation lived on a separate `ctx.objects` surface, which meant the same
  // call did two different things depending on the lane.
  for (const kind of CREATABLE_KINDS) {
    if (kind === 'page') continue
    ui[kind] = createKindFn(state, kind)
  }
  // Custom object types are real creators too — see createCustomCreators.
  for (const fn of createCustomCreators(state)) ui[fn.key] = fn.create
  ui['pages'] = buildPages(state)
  ui['page'] = { name: '', address: '/', url: '/', params: {}, keys: [], getElement: () => null, getElements: () => [] }
  ui['breakpoints'] = buildBreakpoints(state)
  ui['measure'] = buildMeasure(state)
  ui['icons'] = buildIcons(state)
  ui['get'] = (name: string) => {
    const node = state.ir.objects.get(name)
    return node ? makeHandle(state, node) : undefined
  }
  ui['all'] = () => [...state.ir.objects.values()].map((n) => makeHandle(state, n))
  ui['when'] = () => () => {}
  ui['track'] = (event: string) => ({ name: event, origin: { name: '' } })
  ui['sources'] = () => []
  ui['transformers'] = buildTransformers(state)
  const st = buildState(state)
  ui['state'] = st
  ui['setState'] = (next: Record<string, unknown> | ((p: Record<string, unknown>) => Record<string, unknown>)) => {
    const base = state.ir.stateDefaults
    const patch = typeof next === 'function' ? (next as (p: Record<string, unknown>) => Record<string, unknown>)(base) : next
    Object.assign(base, patch)
    return base
  }
  ui['getState'] = () => state.ir.stateDefaults
  ui['theme'] = { get: () => ({ mode: 'light' as const }), set: (m: 'light' | 'dark') => ({ mode: m }) }
  ui['getTheme'] = () => ({ mode: 'light' as const })
  ui['setTheme'] = (m: 'light' | 'dark') => ({ mode: m })
  ui['dom'] = {
    getInterfaceObject: () => null,
    getObject: () => null,
    get: () => null,
    wrap: () => null,
    getElement: () => null,
    getElements: () => [],
    setContents: () => {},
    setAttributes: () => {},
    setStyles: () => {},
    onEvent: () => {},
  }
  ui['events'] = {
    emit: () => {},
    on: () => () => {},
    subscribe: () => () => {},
    observe: () => () => {},
    getLog: () => [],
  }
  return ui
}

/**
 * Creators for the project's custom object types.
 *
 * Each becomes `ctx.ui.<camelCased name>`, exactly like a built-in kind, so a
 * component is not a second-class citizen at the call site. A custom object with
 * `render: 'table'` is created as a real `table` node, so it inherits that
 * kind's renderer, behaviors and handle methods; the default is a `box`.
 */
export function createCustomCreators(
  state: CompileState,
): Array<{ key: string; create: (props?: Record<string, unknown>) => unknown }> {
  const out: Array<{ key: string; create: (props?: Record<string, unknown>) => unknown }> = []
  for (const [name, def] of state.customObjects ?? []) {
    // A component's `render` names the built-in kind it genuinely IS. Default
    // to a container, which is right for nearly every component.
    const kind = def.render && CREATABLE_KINDS.includes(def.render as (typeof CREATABLE_KINDS)[number])
      ? def.render
      : 'box'
    out.push({ key: creatorNameFor(name), create: createCustomCreator(state, name, kind) })
  }
  return out
}

/** One custom object's creator: seed props + state, then run its `define`. */
function createCustomCreator(state: CompileState, objectName: string, kind: string) {
  const create = ((props?: Record<string, unknown>) => {
    const def = state.customObjects?.get(objectName)
    if (!def) throw new Error(`[Morgana] unknown custom object "${objectName}"`)
    const id = typeof props?.['id'] === 'string' && props['id'] ? props['id'] : `${kind}_${nextAutoId().toString(36)}`
    const defaults = { ...(def.defaultProps ?? {}), ...(def.props ?? {}) }
    const node = ensureNode(state, kind, { ...defaults, ...props, id })
    node.customObject = objectName
    const handle = makeHandle(state, node)

    // Component state is seeded into the page state root under the instance id,
    // so it is visible to ctx.getState(), subscribable, and bindable by a user.
    if (def.state) {
      const root = state.ir.stateDefaults as Record<string, unknown>
      const scope = typeof root[id] === 'object' && root[id] !== null ? (root[id] as Record<string, unknown>) : {}
      for (const [k, v] of Object.entries(def.state)) {
        if (scope[k] === undefined) scope[k] = v
      }
      root[id] = scope
    }

    if (def.define) {
      def.define(handle, {
        ui: buildUi(state),
        handle,
        props: node.props as Record<string, unknown>,
        state: (state.ir.stateDefaults as Record<string, unknown>)[id] as Record<string, unknown>,
        name: objectName,
        id,
      })
    }
    return handle
  }) as ((props?: Record<string, unknown>) => unknown) & { create: (props?: Record<string, unknown>) => unknown }
  create.create = (props?: Record<string, unknown>) => create(props)
  return create
}

