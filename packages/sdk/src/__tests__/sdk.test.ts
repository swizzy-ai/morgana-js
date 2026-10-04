import { describe, expect, it } from 'vitest'
import { FAMILY_ALIASES, familyAliases, resolveFamily } from '../families'
import { BACKEND_EVENTS, FRONTEND_EVENTS, INTERACTION_EVENTS, SYSTEM_EVENTS } from '../events'
import {
  BUTTON_TRACKABLE_EVENTS,
  INPUT_TRACKABLE_EVENTS,
  PAGE_TRACKABLE_EVENTS,
  LIST_TRACKABLE_EVENTS,
  CHART_TRACKABLE_EVENTS,
  LINK_TRACKABLE_EVENTS,
  TEXT_TRACKABLE_EVENTS,
  BOX_TRACKABLE_EVENTS,
  BACKEND_TRACKABLE_EVENTS,
  TRACKABLES_BY_HANDLE,
  BACKEND_TRACKABLES,
  getTrackablesForHandle,
  getAllTrackablesGuide,
} from '../trackables'
import { ROLE_RANKS, STEM_BIND, STEM_GUARD } from '../guards'
import { defineConfig } from '../config'
import { defineServerAction, defineClientAction } from '../actions'
import type { AppHandle, AppsHandle } from '../apps'
import type { ListHandle, ObjectHandle } from '../handles'
import type { ActionTriggerEvent, ClientContext, UiApi } from '../contexts/client'
import type { BoxHandle } from '../handles'
import type { Dim } from '../layout'

import type { ServerContext } from '../contexts/server'
import type { EventApi } from '../events'

describe('families', () => {
  it('resolves canonical tokens', () => {
    expect(resolveFamily('interactive')).toBe('interactive')
    expect(resolveFamily('graphic')).toBe('graphic')
    expect(resolveFamily('spatial')).toBe('spatial')
  })

  it('resolves aliases', () => {
    expect(resolveFamily('web')).toBe('interactive')
    expect(resolveFamily('2d')).toBe('graphic')
    expect(resolveFamily('3d')).toBe('spatial')
  })

  it('returns null for unknown tokens', () => {
    expect(resolveFamily('nope')).toBeNull()
  })

  it('lists aliases per family', () => {
    expect(familyAliases('interactive')).toEqual(['interactive', 'web'])
    expect(Object.keys(FAMILY_ALIASES)).toHaveLength(6)
  })
})

describe('events', () => {
  it('interaction lane covers the doc catalog', () => {
    for (const name of ['clicked', 'changed', 'submitted', 'loaded', 'entered', 'picked'] as const) {
      expect(INTERACTION_EVENTS).toContain(name)
    }
  })

  it('system lane covers deploy + action lifecycle + cron', () => {
    for (const name of ['deploy', 'action:error', 'cron'] as const) {
      expect(SYSTEM_EVENTS).toContain(name)
    }
  })

  it('frontend/backend catalogs are the management views', () => {
    expect(FRONTEND_EVENTS).toEqual(INTERACTION_EVENTS)
    expect(BACKEND_EVENTS).toEqual(['store:changed', ...SYSTEM_EVENTS])
  })

  it('enumerates and validates trackables for all handle elements and backend', () => {
    // Handle element trackables
    expect(BUTTON_TRACKABLE_EVENTS).toContain('click')
    expect(BUTTON_TRACKABLE_EVENTS).toContain('hover')
    expect(INPUT_TRACKABLE_EVENTS).toContain('input')
    expect(INPUT_TRACKABLE_EVENTS).toContain('change')
    expect(PAGE_TRACKABLE_EVENTS).toContain('scroll')
    expect(PAGE_TRACKABLE_EVENTS).toContain('loaded')
    expect(LIST_TRACKABLE_EVENTS).toContain('item:appended')
    expect(CHART_TRACKABLE_EVENTS).toContain('selected')
    expect(LINK_TRACKABLE_EVENTS).toContain('navigate')
    expect(TEXT_TRACKABLE_EVENTS).toContain('content:changed')
    expect(BOX_TRACKABLE_EVENTS).toContain('moved')
    expect(BOX_TRACKABLE_EVENTS).toContain('child:placed')

    // Backend trackables
    expect(BACKEND_TRACKABLE_EVENTS).toContain('store:created')
    expect(BACKEND_TRACKABLE_EVENTS).toContain('store:updated')
    expect(BACKEND_TRACKABLE_EVENTS).toContain('store:deleted')
    expect(BACKEND_TRACKABLE_EVENTS).toContain('cron:tick')
    expect(BACKEND_TRACKABLE_EVENTS).toContain('action:start')

    // Metadata guide inspection helper
    const buttonTrackables = getTrackablesForHandle('button')
    expect(buttonTrackables.some((t) => t.event === 'click')).toBe(true)

    const guide = getAllTrackablesGuide()
    expect(guide.length).toBe(14) // 13 handles + backend
    const tableSection = guide.find((g) => g.type === 'table')
    expect(tableSection).toBeDefined()
    expect(tableSection?.trackables.some((t) => t.event === 'row:click')).toBe(true)
    const backendSection = guide.find((g) => g.type === 'backend')
    expect(backendSection).toBeDefined()
    expect(backendSection?.trackables.length).toBeGreaterThan(5)
  })
})

describe('apps', () => {
  it('app handle attaches/detaches pages by name', () => {
    const app: AppHandle = {
      name: 'store',
      displayName: 'Store',
      type: 'web',
      pages: () => [],
      page: () => undefined,
      addPage: (_page) => app,
      removePage: (_name) => app,
    }
    expect(app.name).toBe('store')
    expect(app.addPage('shop')).toBe(app)
    expect(app.removePage('shop')).toBe(app)
  })

  it('apps handle lists/looks up/creates apps', () => {
    const app: AppHandle = {
      name: 'store',
      type: 'web',
      pages: () => [],
      page: () => undefined,
      addPage: (_page) => app,
      removePage: (_name) => app,
    }
    const apps: AppsHandle = {
      list: () => [app],
      app: (name) => (name === 'store' ? app : undefined),
      create: () => app,
      remove: () => true,
    }
    expect(apps.list()).toHaveLength(1)
    expect(apps.app('store')?.name).toBe('store')
    expect(apps.app('missing')).toBeUndefined()
  })

  it('base context carries ctx.apps', () => {
    type Apps = ClientContext['apps']
    expect({} as Apps).toBeDefined()
  })
})

describe('guards', () => {
  it('ranks roles member < admin < owner', () => {
    expect(ROLE_RANKS.member).toBeLessThan(ROLE_RANKS.admin)
    expect(ROLE_RANKS.admin).toBeLessThan(ROLE_RANKS.owner)
  })

  it('stem annotation names are stable', () => {
    expect(STEM_BIND).toBe('@morgana-bind')
    expect(STEM_GUARD).toBe('@morgana-guard')
  })
})

describe('handles', () => {
  it('ctx.ui creators are creators, and get() is the lookup', () => {
    // Type-level tripwire. `tsc --noEmit` is the assertion; this body never runs.
    type Made = ReturnType<ClientContext['ui']['box']>
    const tripwire = (
      box: ClientContext['ui']['box'],
      ctx_ui_button: ClientContext['ui']['button'],
      get: ClientContext['ui']['get'],
    ) => {
      // A creator takes props and returns a handle — never `undefined`.
      const made: Made = box({ id: 'hero', pad: 4 })
      const pad: Dim | undefined = made.get('pad')
      const label: string | undefined = ctx_ui_button({ id: 'cta', label: 'Buy' }).get('label')
      // .create is the named alias of the same call.
      const alsoMade: Made = box.create({ id: 'hero2' })
      // Lookup is get(), and it is the only thing that can be undefined.
      const found: BoxHandle | undefined = get('hero')
      void [pad, label, alsoMade, found]
    }
    expect(typeof tripwire).toBe('function')
  })

  it('ui keeps a narrowable generic door for custom types', () => {
    type UiGet = ClientContext['ui']['get']
    const get: UiGet = <T extends ObjectHandle = ObjectHandle>(
      _name: string,
    ): T | undefined => undefined
    const feed = get<ListHandle>('chatLog')
    expect(feed).toBeUndefined()
  })

  it('ui manages sources and subscribes to backend events', () => {
    type UiSources = ClientContext['ui']['sources']
    const sources: UiSources = () => []
    expect(sources()).toEqual([])
    type UiSubscribe = ClientContext['ui']['events']['subscribe']
    const subscribe: UiSubscribe = (_event, _scope, _handler) => () => {}
    const off = subscribe('store:notes:created', undefined, () => {})
    expect(typeof off).toBe('function')
  })
})

describe('config', () => {
  it('defineConfig is an identity helper over a single config + hooks', () => {
    const config = defineConfig({
      name: 'demo',
      vars: { public: { site: 'demo.app' } },
      hooks: [
        { on: 'compile', run: 'declareCollections' },
        { on: 'cron(every 5m)', run: ['heartbeat', 'purge'] },
        { on: 'store.production.record.created', run: 'indexRecord', enabled: false },
      ],
    })
    expect(config.name).toBe('demo')
    expect(config.vars?.public?.site).toBe('demo.app')
    expect(config.hooks).toHaveLength(3)
    expect(config.hooks?.[0]?.on).toBe('compile')
    expect(config.hooks?.[1]?.run).toEqual(['heartbeat', 'purge'])
    expect(config.hooks?.[2]?.enabled).toBe(false)
  })

  it('accepts http hooks for public API routes (server actions as HTTP APIs)', () => {
    const config = defineConfig({
      hooks: [
        { on: 'http.get /api/widgets', run: 'listWidgets', auth: 'public', cors: { allowedOrigins: ['https://myapp.com'] } },
        { on: 'http.post /api/widgets/:id', run: 'updateWidget', auth: 'member' },
      ],
    })
    expect(config.hooks).toHaveLength(2)
    expect(config.hooks?.[0]?.on).toBe('http.get /api/widgets')
    expect(config.hooks?.[0]?.auth).toBe('public')
    expect(config.hooks?.[0]?.cors?.allowedOrigins).toEqual(['https://myapp.com'])
    expect(config.hooks?.[1]?.auth).toBe('member')
  })
})

describe('action factories', () => {
  it('defineServerAction is an identity helper over config + handler', () => {
    const action = defineServerAction({
      config: { on: 'store.production.record.created' },
      handler: (ctx) => {
        void ctx.events.emit // app events — the unified surface
        void ctx.events.publish // channel publish — the unified surface
        void ctx.server.collections // the full server surface stays on ctx.server
        return { ok: true, id: (ctx.args as any)?.id }
      },
    })
    expect(action.config?.on).toBe('store.production.record.created')
    expect(typeof action.handler).toBe('function')
  })

  it('a generic server action needs no config (http surface still on ctx.server)', () => {
    // ServerContext groups the full server surface under ctx.server — the
    // default server action serves HTTP access as well as event access.
    const action = defineServerAction({
      handler: (ctx) => {
        void ctx.server.request?.method
        void ctx.server.respond
        void ctx.server.collections
        void ctx.server.queue
        void ctx.log
        return { ok: true }
      },
    })
    expect(action.config).toBeUndefined()
    expect(typeof action.handler).toBe('function')
  })

  it('on: compile marks a server action for the shape phase', () => {
    const compileAction = defineServerAction({
      config: { on: 'compile' },
      handler: (ctx) => {
        void ctx.server.collections
        return { ok: true }
      },
    })
    expect(compileAction.config?.on).toBe('compile')
    expect(typeof compileAction.handler).toBe('function')
  })

  it('a browser action can also target compile', () => {
    const compileBrowser = defineClientAction({
      config: { on: 'compile' },
      handler: (ctx) => {
        const title = ctx.ui.text({ id: 'title', content: 'Hi' })
        title.setProps({ font: 'h2' })
        ctx.ui.state.set('greeting', 'Hi')
        return { title: 'Hi' }
      },
    })
    expect(compileBrowser.config?.on).toBe('compile')
  })

  it('supports debounce and throttle configuration on actions', () => {
    const throttledAction = defineClientAction({
      config: {
        on: 'button#submit.click',
        debounce: 250,
        throttle: 500,
      },
      handler: (ctx) => {
        expect(ctx.event).toBeDefined()
        expect(ctx.event.origin).toBeDefined()
        return { ok: true }
      },
    })
    expect(throttledAction.config?.debounce).toBe(250)
    expect(throttledAction.config?.throttle).toBe(500)
    expect(throttledAction.config?.on).toBe('button#submit.click')
  })
})

import {
  defineInterfaceObject,
  defineObjectHandle,
  registerInterfaceObject,
  getInterfaceObjectDefinition,
  getAllInterfaceObjectDefinitions,
  createCustomObject,
  creatorNameFor,
  isCustomObject,
  getCustomObject,
  markCustomObjectSource,
} from '../interfaces'
import type { PagesApi } from '../contexts/client'

describe('Interface Objects and Extensibility', () => {
  it('defines and registers custom interface objects for new handles', () => {
    // `name` replaced `type`+`family`; `define`/`onMount` replaced `setup`.
    const def = defineInterfaceObject({
      name: 'confetti',
      defaultProps: {
        particleCount: 150,
        spread: 70,
      },
      events: ['fired'],
      methods: {
        fire: (handle, options) => {
          handle.emit('fired', options)
          return true
        },
      },
      onMount: (element) => {
        element.setAttribute('data-confetti-ready', 'true')
      },
      onDestroy: (ctx) => {
        ctx.element.removeAttribute('data-confetti-ready')
      },
    })

    expect(def.name).toBe('confetti')
    expect(getInterfaceObjectDefinition('confetti')).toBe(def)
    expect(getAllInterfaceObjectDefinitions().some((d) => d.name === 'confetti')).toBe(true)

    // A name is the whole identifier; the creator is its camel case.
    expect(creatorNameFor('video-player')).toBe('videoPlayer')
    expect(isCustomObject('confetti')).toBe(true)
    expect(isCustomObject('box')).toBe(false)

    // Alias check
    expect(defineObjectHandle).toBe(defineInterfaceObject)
  })

  it('rejects a name that cannot become a creator', () => {
    expect(() => createCustomObject({ name: '' })).toThrow(/non-empty/)
    expect(() => createCustomObject({ name: '9lives' })).toThrow(/not usable/)
    expect(() => createCustomObject({ name: 'ok-name', state: [] as unknown as Record<string, unknown> })).toThrow(/plain object/)
    expect(() => createCustomObject({ name: 'ok-name2', onMount: 'nope' as unknown as () => void })).toThrow(/must be a function/)
  })

  it('rejects two different components claiming one name', () => {
    const fromA = createCustomObject({ name: 'dup-check', defaultProps: { a: 1 } })
    markCustomObjectSource(fromA, 'objects/a.ts')
    // The same module evaluating again is normal (both lanes load it) — allowed.
    expect(() => createCustomObject(fromA)).not.toThrow()
    // A genuinely different component with the same name is a real conflict,
    // caught the moment it tries to claim the name.
    const fromB = { name: 'dup-check', defaultProps: { b: 2 } }
    markCustomObjectSource(fromB, 'objects/b.ts')
    expect(() => createCustomObject(fromB)).toThrow(/both claim the name "dup-check"/)
  })
})

describe('UiApi', () => {
  // ctx.objects is gone. Creation moved onto ctx.ui, so there is exactly one
  // way to create an object and one way to look one up.
  const expectedCreators = [
    'box', 'container', 'grid', 'card', 'group', 'stage',
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

  it('declares every kind creator on UiApi', () => {
    type Key = keyof UiApi
    for (const name of expectedCreators) {
      const key: Key = name
      expect(key).toBeDefined()
    }
  })

  it('has one lookup and one enumeration, not a per-kind lookup', () => {
    type Key = keyof UiApi
    for (const name of ['get', 'all', 'pages', 'page', 'state', 'dom', 'events'] as const) {
      const key: Key = name
      expect(key).toBeDefined()
    }
  })
})

describe('context surface guards', () => {
  it('ctx.server owns NO event surface and NO auth — spine surfaces only', () => {
    type ServerKeys = keyof NonNullable<ServerContext['server']>
    // Compile-time tripwires — `tsc --noEmit` fails if anyone re-adds these:
    const noEvents: 'events' extends ServerKeys ? false : true = true
    const noEmit: 'emit' extends ServerKeys ? false : true = true
    const noAuth: 'auth' extends ServerKeys ? false : true = true
    expect(noEvents).toBe(true)
    expect(noEmit).toBe(true)
    expect(noAuth).toBe(true)
  })

  it('ctx.objects is deprecated and absent from the browser context', () => {
    type BrowserKeys = keyof ClientContext
    const noObjects: 'objects' extends BrowserKeys ? false : true = true
    expect(noObjects).toBe(true)
  })

  it('ctx.page lives at ctx.ui.page — not at the context root', () => {
    type BrowserKeys = keyof ClientContext
    const noPage: 'page' extends BrowserKeys ? false : true = true
    expect(noPage).toBe(true)
    const page: ClientContext['ui']['page'] = {
      name: 'home',
      address: '/',
      url: '/',
      params: {},
      keys: [],
      getElement: () => null,
      getElements: () => [],
    }
    expect(page.name).toBe('home')
  })

  it('auth is a spine surface on the base context (both lanes)', () => {
    const hasAuth: 'auth' extends keyof ClientContext ? true : false = true
    expect(hasAuth).toBe(true)
    const serverAuth: ServerContext['auth'] | undefined = undefined
    expect(serverAuth).toBeUndefined()
  })

  it('ctx.event carries the full trigger details including the element', () => {
    const ev: ActionTriggerEvent = {
      name: 'clicked',
      origin: 'addBtn',
      element: null,
      payload: {},
      timestamp: 0,
    }
    expect(ev.element).toBeNull()
    expect(ev.name).toBe('clicked')
  })

  it('publish is required on the unified EventApi', () => {
    const hasPublish: 'publish' extends keyof EventApi ? true : false = true
    expect(hasPublish).toBe(true)
  })
})
