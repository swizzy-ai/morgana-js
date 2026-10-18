// @studiomorgana/helpers — write Morgana UI as sentences.
//
//   const { create, place, make, set, when } = helpers(ctx, myTheme)
//
//   const start = create.button('start', 'Start task')
//   make(start).appearance('primary')
//   place(start).in(form)
//
// Every verb ends in ordinary Morgana calls (place, setProps, set, bind…),
// so helpers and hand-written code mix freely. `helpers(ctx)` binds the verbs
// to this action's ctx — that is how a sentence finds the page it changes.
import type { ClientContext, ObjectHandle, PageHandle } from '@studiomorgana/sdk'
import { Bricks } from './bricks'
import { Make } from './make'
import { SetTo } from './set'
import { Theme, theme } from './theme'
import { makeAnimate, type Animate } from './animate'
import { asset, SPRITE, type AssetPick } from './assets'

export { Make, type Appearance, type Leaving } from './make'
export { SetTo } from './set'
export { Theme, theme } from './theme'
export { Animation, Move, type Animate, type Trigger } from './animate'
export { Bricks, type CellLooks } from './bricks'
export { duration, type Duration, type Speed } from './time'
export type { Size, TextSize, Weight } from './words'
export { asset, SPRITE, type AssetPick } from './assets'

type Handle = ObjectHandle<any>
type Target = Handle | string

/** The kinds `create.<kind>(id)` makes; any other Morgana kind works through `create.kind(name, id)`. */
const KINDS = [
  'box', 'text', 'button', 'input', 'textarea', 'link', 'image', 'list', 'table', 'form', 'login', 'signup',
  'dialog', 'drawer', 'popover', 'tabs', 'accordion', 'progress', 'checkbox', 'switch', 'toggle',
  'select', 'chart', 'badge', 'tag', 'stat', 'alert', 'toast', 'spinner', 'steps', 'timeline',
  'fileUpload', 'datePicker', 'emptyState', 'status', 'kbd',
] as const
type Kind = (typeof KINDS)[number]

/** The prop a creator's second argument fills, per kind. */
const MAIN: Partial<Record<Kind, string>> = { text: 'content', button: 'label', link: 'href', image: 'src', badge: 'content', tag: 'content' }

export type Creators = { [K in Kind]: (id: string, main?: string) => Handle } & {
  /** Any Morgana kind by name: `create.kind('qrCode', 'invite-qr')`. */
  kind(kind: string, id: string, props?: Record<string, unknown>): Handle
  /** A page: `create.page('wall').at('/wall').in('console').for('members').otherwise('login')`. */
  page(name: string): PageSentence
  /** An app: `create.app('console').named('Swizzy')`. */
  app(name: string): AppSentence
  /**
   * An image of a built asset: `create.sprite('hero-coin', 'coin', { clip: 'spin', size: 'small' })`.
   * Sized in pixels by word (tiny 32 … huge 256) or number; described by its name unless `alt` says otherwise.
   */
  sprite(id: string, name: string, opts?: AssetPick & { size?: keyof typeof SPRITE | number; alt?: string }): Handle
}

export class PageSentence {
  constructor(readonly handle: PageHandle) {}
  /** Its address: '/wall', '/job/:id'. */
  at(address: string): this {
    // route() moves the page; setProps({ address }) after create does not (GAPS.md #19).
    const where = address === '/' ? '/' : address.replace(/^\//, '')
    const page = this.handle as PageHandle & { route?: (p: string) => unknown }
    if (typeof page.route === 'function') page.route(where)
    else this.handle.setProps({ address: where })
    return this
  }
  /** The app it belongs to. */
  in(app: string): this { this.handle.app(app); return this }
  /** Who may open it. */
  for(who: 'everyone' | 'members' | { role: string | string[] }): this {
    this.handle.setProps({ access: who === 'everyone' ? 'public' : who === 'members' ? 'member' : who })
    return this
  }
  /** Where everyone else is sent. */
  otherwise(page: string): this { this.handle.setProps({ redirect: page }); return this }
  /** The browser tab's title. */
  titled(title: string): this { this.handle.setProps({ title }); return this }
  /** Filled per request by its route action, then sent finished. */
  renderedOnServer(): this { this.handle.setProps({ render: 'server' }); return this }
  /** The tab icon. */
  icon(address: string): this { this.handle.setProps({ favicon: address }); return this }
  /** Light or dark: 'system' follows the visitor's setting (the default for themed pages). */
  mode(mode: 'light' | 'dark' | 'system'): this { this.handle.setProps({ mode }); return this }
  /** Paint the whole page from a theme (helpers do this for you with the theme you passed). */
  theme(name: string): this { this.handle.setProps({ theme: name }); return this }
}

export class AppSentence {
  constructor(private readonly ctx: ClientContext, private readonly name: string) {
    ctx.apps.create(name)
  }
  /** The name people see. */
  named(displayName: string): this {
    this.ctx.apps.remove(this.name)
    this.ctx.apps.create(this.name, { displayName })
    return this
  }
}

export interface Verbs {
  /** Make new things — compile actions only. */
  create: Creators
  /** Put a thing somewhere. Placing into a list makes it the row repeated for each record. */
  place(thing: Target): {
    in(parent: Target): void
    on(page: string | PageSentence | PageHandle): void
    /** Pin it at a spot inside its parent (which `.anchors()`): `place(x).at(0, 0).in(box)`. */
    at(left: string | number, top: string | number): { in(parent: Target): void }
    /** Fix it to the window, whatever scrolls: `place(panel).fixedAt(0, 0).in(frame)`. */
    fixedAt(left: string | number, top: string | number): { in(parent: Target): void }
  }
  /** How a thing looks. */
  make(thing: Target): Make
  /** What a thing says, holds or does. */
  set(thing: Target): SetTo
  show(thing: Target): void
  hide(thing: Target): void
  enable(thing: Target): void
  disable(thing: Target): void
  /**
   * Lists: `fill(jobs).with(records)`, or rows that follow state:
   * `fill(log).from('log', 'id')` stamps, updates and removes rows as the
   * array at that path changes (keyed by the record field you name).
   */
  fill(list: Target): { with(records: unknown[]): void; from(path: string, key?: string): void }
  /** Lists: `add(record).to(trail)`. */
  add(record: Record<string, unknown>): { to(list: Target): void }
  /** Lists: empty it. */
  clear(list: Target): void
  /** Browser actions: `when(start).clicked().run('startTask')`. */
  when(thing: Target): WhenSentence
  /** Browser actions: `go.to('/wall')`, `go.back()`. */
  go: { to(address: string): void; back(): void }
  /** Motion: `animate.fadeIn(card).for('slow').whenItAppears()`, `animate.bounce(icon).when(button).clicked()`. */
  animate: Animate
  /**
   * Compound sentences so page code never writes a loop or a local helper:
   * `bricks.repeat(10, …, (seg, i) => …)`, `bricks.cells(meter, […]…)`,
   * `bricks.segmented(foot, 'theme.mode', […])`, `bricks.rows('log', line, 'log')`,
   * `bricks.onlyWhile(key, 'authStep', 'email')`.
   */
  bricks: Bricks
  /** Light and dark, in the browser: `mode.dark()`, `mode.light()`, `mode.toggle()`. */
  mode: {
    light(): void
    dark(): void
    /** Follow the visitor's own setting. */
    system(): void
    set(mode: 'light' | 'dark' | 'system'): void
    toggle(): 'light' | 'dark'
    current(): 'light' | 'dark'
  }
}

/** The words `when(x).…` offers, and the page event each one is. */
const EVENTS = {
  clicked: 'clicked', changed: 'changed', submitted: 'submitted', selected: 'selected',
  opened: 'opened', closed: 'closed', focused: 'focus', hovered: 'hover',
} as const
type WhenEvent = keyof typeof EVENTS
export type WhenSentence = { [E in WhenEvent]: () => { run(action: string, args?: Record<string, unknown>): void } }

/** The mode actually on screen — 'system' resolved through the visitor's setting. */
function showing(): 'light' | 'dark' {
  if (!inBrowserNow()) return 'light'
  const m = document.body.getAttribute('data-mode')
  if (m === 'light' || m === 'dark') return m
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function inBrowserNow(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/** Bind the verbs to this action's ctx (and, optionally, your theme). */
export function helpers(ctx: ClientContext, look: Theme = theme('default')): Verbs {
  const find = (thing: Target): Handle => {
    if (typeof thing !== 'string') return thing
    const h = ctx.ui.get(thing) as Handle | undefined
    if (!h) throw new Error(`[helpers] Nothing on this page has the id "${thing}".`)
    return h
  }

  const ui = ctx.ui as unknown as Record<string, (props: Record<string, unknown>) => Handle>
  const make1 = (kind: string, id: string, props: Record<string, unknown> = {}): Handle => {
    const creator = ui[kind]
    if (typeof creator !== 'function') throw new Error(`[helpers] create.${kind}() — "${kind}" is not a Morgana kind. Run \`morgana spec ui\` for the list.`)
    return creator.call(ctx.ui, { id, ...props })
  }

  // Pages this ctx created. Placing onto a looked-up page handle does not
  // register on the page (GAPS.md #11), so `on('name')` prefers these.
  const pages = new Map<string, PageHandle>()

  // A theme with roles is a real Morgana theme: register it once per build
  // (compile lane), so `theme: name` on a page paints <body> and follows mode.
  const themes = (ctx.ui as unknown as { themes?: { define(name: string, spec: unknown): void } }).themes
  if (look.hasRoles && themes && !inBrowserNow()) themes.define(look.name, look.spec())

  const create = new Proxy({} as Creators, {
    get(_, key: string) {
      if (key === 'page') return (name: string) => {
        const handle = ctx.ui.pages.create({ name, address: name })
        pages.set(name, handle)
        const page = new PageSentence(handle)
        if (look.hasRoles) page.theme(look.name).mode('system')
        // The theme's page CSS — its tokens and scrollbars — inline in the head,
        // and its Google-font links placed high so the connection opens early.
        const pageCss = look.pageCss()
        const headLinks = look.headLinks()
        const headProps: Record<string, unknown> = {}
        if (pageCss) headProps.headCSS = pageCss
        if (headLinks) headProps.headLinks = headLinks
        if (Object.keys(headProps).length > 0) handle.setProps(headProps)
        return page
      }
      if (key === 'app') return (name: string) => new AppSentence(ctx, name)
      if (key === 'kind') return (kind: string, id: string, props?: Record<string, unknown>) => make1(kind, id, props)
      if (key === 'sprite') return (id: string, name: string, opts: AssetPick & { size?: keyof typeof SPRITE | number; alt?: string } = {}) => {
        const { size = 'medium', alt, ...pick } = opts
        const px = typeof size === 'number' ? size : SPRITE[size]
        if (px === undefined) throw new Error(`[helpers] create.sprite() — size "${String(size)}" is not one of ${Object.keys(SPRITE).join(', ')}`)
        return make1('image', id, { src: asset(name, pick), alt: alt ?? name, width: `${px}px`, height: `${px}px` })
      }
      return (id: string, main?: string) => {
        const props: Record<string, unknown> = {}
        const prop = MAIN[key as Kind]
        if (prop && main !== undefined) props[prop] = main
        // An input's name is its id, so forms read values back without extra wiring.
        if (key === 'input' || key === 'textarea') props.name = id
        return make1(key, id, props)
      }
    },
  })

  const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

  const place: Verbs['place'] = (thing) => ({
    in(parent) {
      const p = find(parent)
      const child = find(thing)
      if (p.type === 'list' || p.type === 'table') p.addContent(child)
      else p.place(child)
    },
    at(left, top) {
      return {
        in(parent) {
          find(parent).place(find(thing), { mode: 'free', at: [left, top] } as never)
        },
      }
    },
    fixedAt(left, top) {
      return {
        in(parent) {
          find(parent).place(find(thing), { mode: 'pin', at: [left, top] } as never)
        },
      }
    },
    on(page) {
      const pg = typeof page === 'string' ? pages.get(page) ?? ctx.ui.pages.get(page) : page instanceof PageSentence ? page.handle : page
      if (!pg) throw new Error(`[helpers] No page named "${String(page)}". Create it first: create.page('${String(page)}').`)
      ;(pg as unknown as Handle).place(find(thing))
    },
  })
  const make: Verbs['make'] = (thing) => new Make(find(thing), look)
  const set: Verbs['set'] = (thing) => new SetTo(find(thing))
  const fill: Verbs['fill'] = (list) => ({
    with: (records) => find(list).set('data', records),
    from: (path, key) => find(list).bind(path, key ? { key } : undefined),
  })

  const verbs: Verbs = {
    create,
    place,
    make,
    set,
    show: (thing) => find(thing).set('hidden', false),
    hide: (thing) => find(thing).set('hidden', true),
    enable: (thing) => find(thing).set('disabled', false),
    disable: (thing) => find(thing).set('disabled', true),
    fill,
    add: (record) => ({
      to(list) {
        const l = find(list) as Handle & { append?: (r: Record<string, unknown>) => void }
        if (typeof l.append === 'function') l.append(record)
        else l.set('data', [...((l.get('data') as unknown[]) ?? []), record])
      },
    }),
    clear: (list) => find(list).set('data', []),
    when: (thing) => {
      const sentence = {} as WhenSentence
      for (const [word, event] of Object.entries(EVENTS) as [WhenEvent, string][]) {
        sentence[word] = () => ({
          run(action, args = {}) {
            if (!inBrowser()) throw new Error('[helpers] when() wires events in browser actions. In compile and server actions, use `config.on`.')
            find(thing).when(event as never, () => {
              void (ctx.actions.run as (n: string, a: Record<string, unknown>) => Promise<unknown>)(action, args)
            })
          },
        })
      }
      return sentence
    },
    animate: makeAnimate({ find, inBrowser }),
    bricks: new Bricks({ create, place, make, set, fill }),
    mode: {
      light: () => { ctx.ui.theme.set('light') },
      dark: () => { ctx.ui.theme.set('dark') },
      system: () => { (ctx.ui.theme.set as (m: string) => unknown)('system') },
      set: (m) => { (ctx.ui.theme.set as (m: string) => unknown)(m) },
      toggle: () => ctx.ui.theme.set(showing() === 'dark' ? 'light' : 'dark').mode,
      current: () => showing(),
    },
    go: {
      to(address) {
        if (inBrowser()) location.assign(address)
      },
      back() {
        if (inBrowser()) history.back()
      },
    },
  }
  const bricks = new Bricks({ create, place: verbs.place, make: verbs.make, set: verbs.set, fill: verbs.fill } as never)
  verbs.bricks = bricks
  return verbs
}
