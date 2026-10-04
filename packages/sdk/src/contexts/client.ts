/**
 * The client lane — the UI surface of the running page (FRAMEWORK.md §3).
 *
 * `ctx.ui` is the complete UI namespace: it identifies every object by kind
 * and returns its concrete handle (typed lookups), owns pages (`ctx.ui.page`
 * = the current page, `ctx.ui.pages` = all pages + routing), and carries
 * state/theme/dom/transformers. There is NO `ctx.objects` — it is deprecated;
 * read objects through `ctx.ui`. The trigger's details (including the DOM
 * element that fired it) live on `ctx.event` — there is no separate
 * `ctx.element` / `ctx.triggerEvent`.
 *
 * The page runtime implements this context (`__morgana_createActionCtx`):
 * args, event, ui and libraries are live.
 */

import type { ActionContract, AppEventName, AppEventPayload, EventScope } from '../contracts'
import type { BaseContext } from './base'
import type { EventApi, EventSubscribeOptions } from '../events'
import type {
  BoxHandle, BreakpointsApi, ButtonHandle, ChartHandle, EventHandler, EventSource, ImageHandle, InputHandle,
  LinkHandle, ListHandle, ObjectHandle, PageHandle, Placement, TextHandle, TrackOptions, Unsubscribe, WhenSource,
  TransformerConfigApi,
  TableHandle, DialogHandle, SelectHandle, TabsHandle, BadgeHandle, AlertHandle, ToggleHandle, FormHandle, ProgressHandle,
} from '../handles'
import type { MeasureApi } from '../layout'
import type { IconsApi } from '../icons'
import type { PageTrackableEvent } from '../trackables'
import type {
  BoxProps, ButtonProps, ImageProps, InputProps, LinkProps, PageProps, TextProps,
  TableProps, DialogProps, SelectProps, TabsProps, BadgeProps, AlertProps, ToggleProps, FormProps, ProgressProps,
} from '../props'

/** Frontend state — the single source of truth for the UI. */
export interface StateHandle {
  get(path: string): unknown
  set(path: string, value: unknown): void
  /** Append to the array at `path` (creating it when missing). */
  append(path: string, item: unknown): void
  /** Remove the value at `path` (nested paths supported). */
  remove(path: string): void
  getAll(): Record<string, unknown>
  /**
   * Subscribe to state changes (reactive stores) — the listener receives the
   * changed path; returns an unsubscribe function. Optional: plain stores
   * omit it and path-based `bind()` sources degrade to one-shot reads.
   */
  subscribe?(
    listener: (path: string, value: unknown, oldValue: unknown, root: Record<string, unknown>) => void
  ): () => void
}

/**
 * Pages API surface under the UI banner (`ctx.ui.pages`).
 * Provides lookup by name, active page handle access, page enumeration,
 * SPA route navigation, and page creation.
 */
export interface PagesApi extends Omit<PageHandle, 'active'> {
  /** Look up a page by name or return the active page when called with no arguments. */
  (name?: string): PageHandle | undefined
  /** Look up a page by name. */
  get(name: string): PageHandle | undefined
  /** All pages registered on the object graph. */
  all(): PageHandle[]
  /** Alias for all(). */
  list(): PageHandle[]
  /** The currently active page handle. */
  readonly active: PageHandle | undefined
  /** Alias for active page handle. */
  readonly current: PageHandle | undefined
  /** Declarative SPA route navigation under the UI banner. */
  navigate(
    addressOrName: string,
    options?: {
      params?: Record<string, string>
      transition?: 'fade' | 'slide' | 'push' | 'instant' | string
    }
  ): void
  /** Create / register a page directly under ui.pages. */
  create(props?: PageProps & CreateOptions): PageHandle
}

/** Page accessor surface — alias for PagesApi */
export type PageAccessor = PagesApi

/** The object graph of the running page — identify each thing and use it. */
export interface UiApi {
  // ── Every registered kind — typed where a concrete handle exists ─────────
  box: Creatable<BoxProps, BoxHandle>
  text: Creatable<TextProps, TextHandle>
  button: Creatable<ButtonProps, ButtonHandle>
  input: Creatable<InputProps, InputHandle>
  image: Creatable<ImageProps, ImageHandle>
  link: Creatable<LinkProps, LinkHandle>
  list: Creatable
  chart: Creatable

  table: Creatable<TableProps, TableHandle>
  dialog: Creatable<DialogProps, DialogHandle>
  select: Creatable<SelectProps, SelectHandle>
  tabs: Creatable<TabsProps, TabsHandle>
  badge: Creatable<BadgeProps, BadgeHandle>
  alert: Creatable<AlertProps, AlertHandle>
  toggle: Creatable<ToggleProps, ToggleHandle>
  switch: Creatable<ToggleProps, ToggleHandle>
  checkbox: Creatable<ToggleProps, ToggleHandle>
  form: Creatable<FormProps, FormHandle>
  progress: Creatable<ProgressProps, ProgressHandle>

  // ── Registered kinds without a concrete handle — the full catalog ────────
  container: Creatable
  vstack: Creatable
  hstack: Creatable
  grid: Creatable
  card: Creatable
  group: Creatable
  stage: Creatable
  accordion: Creatable
  dropdown: Creatable
  tooltip: Creatable
  login: Creatable
  signup: Creatable
  slot: Creatable

  header: Creatable
  main: Creatable
  footer: Creatable
  nav: Creatable
  section: Creatable
  article: Creatable

  markdown: Creatable
  code: Creatable
  label: Creatable

  textarea: Creatable
  radio: Creatable<ToggleProps, ObjectHandle>

  lister: Creatable
  avatar: Creatable
  skeleton: Creatable
  separator: Creatable

  video: Creatable
  audio: Creatable

  menu: Creatable
  breadcrumbs: Creatable

  // ── Pages — strictly under the UI banner ─────────────────────────────────
  /** All pages, active page, and SPA routing strictly under the UI banner (`ctx.ui.pages`). */
  pages: PagesApi
  /** The page this action runs on — name, address, url, params, elements (`ctx.ui.page`). */
  page: PageApi

  // ── Breakpoints — the responsive layer, strictly under the UI banner ─────
  /**
   * The breakpoint registry (`ctx.ui.breakpoints`). Shapes are declared in the
   * compile phase and consumed by `ObjectHandle.setWithBreakpoint`; the
   * breakpoint renderer compiles every shaped breakpoint into scoped CSS
   * media queries automatically.
   */
  breakpoints: BreakpointsApi

  /**
   * The central measure registry — named lengths and the base-grid unit.
   * `ctx.ui.measure.define('sidebar', 56)` then use `'sidebar'` as a `Dim`
   * anywhere (widths, placement coordinates, breakpoint scopes). The
   * measurement system: no px, no raw CSS.
   */
  measure: MeasureApi

  /**
   * The named icon vocabulary (`ctx.ui.icons`). Icon sets are declared in the
   * shape phase (`on: 'compile'` actions via `define`) and consumed by key
   * through object `icon` props. In the running browser the surface is
   * read-only (definitions are baked at compile time).
   */
  icons: IconsApi

  /** The universal door — any name, narrow via the generic. */
  get<T extends ObjectHandle = ObjectHandle>(name: string): T | undefined
  /** Every object across every family. */
  all(): ObjectHandle[]

  /** Page-level event wiring — catalog names or tracked sources. */
  when(event: WhenSource, handler: EventHandler): Unsubscribe
  /** Page-level tracked source (e.g. scroll). Idempotent. */
  track(event: PageTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
  /** Every tracked event source on the page — the page-level management view. */
  sources(): EventSource[]
  /**
   * The transformer token registry — the declarative `make()` vocabulary.
   * Compile-time (on: 'compile') actions mutate this to extend/override tokens;
   * in the running browser the surface is read-only (tokens are baked in).
   */
  transformers: TransformerConfigApi

  // ── UI state — the single source of truth for the UI ─────────────────────
  state: StateHandle
  /** Shallow state merge — `setState({ key: value })` or a function upsert. */
  setState(next: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)): Record<string, unknown>
  /** The whole state document. */
  getState(): Record<string, unknown>

  /** Theme mode surface — `light` | `dark`. */
  theme: { get(): { mode: 'light' | 'dark' }; set(mode: 'light' | 'dark'): { mode: 'light' | 'dark' } }
  getTheme(): { mode: 'light' | 'dark' }
  setTheme(mode: 'light' | 'dark'): { mode: 'light' | 'dark' }

  /** Direct DOM surface over the rendered page. */
  dom: DomApi
  /** Page-scoped app/backend events. */
  events: ClientEventsApi
}

/** A DOM element wrapped by the page runtime — the imperative escape hatch. */
export interface DomElementHandle {
  /** The underlying DOM element. */
  el: Element
  text(v?: string): string | DomElementHandle
  html(v?: string): string | DomElementHandle
  /** Value of the wrapped form field (reaches through the object element). */
  val(v?: string): string | DomElementHandle
  attr(k: string, v?: string): string | null | DomElementHandle
  attrs(obj: Record<string, string>): DomElementHandle
  css(k: string, v?: string): string | DomElementHandle
  style(obj: Record<string, string>): DomElementHandle
  hide(): DomElementHandle
  show(): DomElementHandle
  focus(): DomElementHandle
  blur(): DomElementHandle
  addClass(c: string): DomElementHandle
  removeClass(c: string): DomElementHandle
  toggleClass(c: string): DomElementHandle
  on(ev: string, fn: EventListener): DomElementHandle
  off(ev: string, fn: EventListener): DomElementHandle
  find(sel: string): DomElementHandle | null
  children(): DomElementHandle[]
  rect(): { x: number; y: number; width: number; height: number; left: number; top: number; right: number; bottom: number }
  remove(): void
}

/** Direct DOM surface over the rendered page (`ctx.dom`). */
export interface DomApi {
  /** The object's root element by world name (`[data-entity]`). */
  getInterfaceObject(name: string): Element | null
  /** The object's element, wrapped with the imperative handle API. */
  getObject(name: string): DomElementHandle | null
  /** Alias of getObject. */
  get(name: string): DomElementHandle | null
  /** Wrap any DOM element with the imperative handle API. */
  wrap(elm: Element): DomElementHandle
  getElement(selector: string): Element | null
  getElements(selector: string): Element[]
  setContents(name: string, html: string): void
  setAttributes(name: string, attrs: Record<string, string>): void
  setStyles(name: string, styles: Record<string, string>): void
  onEvent(name: string, event: string, handler: EventListener): void
}

/** The page this action runs on (`ctx.page`). */
export interface PageApi {
  readonly name: string
  readonly address: string
  readonly url: string
  readonly params: Record<string, string>
  /** Every `data-entity` name on the page. */
  readonly keys: string[]
  getElement(name: string): Element | null
  getElements(): Element[]
}

export interface ObservableEventEntry<P = any> {
  traceId: string
  timestamp: number
  event: string
  lane: 'interaction' | 'page' | 'state' | 'action' | 'channel' | 'mutation'
  origin: string
  target?: string
  payload: P
  sessionRegistered?: boolean
  formatted?: string
}

export interface ActionTriggerEvent<P = any> {
  /** The event name that fired the action (e.g. 'clicked', 'submitted'). */
  name: string
  type?: string
  origin: string
  target?: string
  /** The DOM element that triggered the action — null when not event-wired. */
  element: Element | null
  payload: P
  timestamp: number
  traceId?: string
  session?: boolean
}

/**
 * Page-scoped event surface (`ctx.ui.events` — alias of `ctx.events` on the
 * client lane). Extends the unified `EventApi`, so the same object satisfies
 * both entry points.
 */
export interface ClientEventsApi extends EventApi {
  /** Emit an app event (bridged to the world / server). Typed by `AppEvents`. */
  emit<K extends AppEventName>(name: K, payload: AppEventPayload<K>): void
  /** Listen for app events dispatched to this page. Typed by `AppEvents`. */
  on<K extends AppEventName>(name: K, handler: (data: AppEventPayload<K>) => void): Unsubscribe
  /**
   * Unified subscription. Local selectors stay on the page bus; bus events
   * (`channel:*`, store frames, system) go out as a subscribe request that a
   * server action grants or rejects. `scope` may carry `{ into, onFrame }`:
   * `into` binds frames to a state path (created→append, updated→set,
   * deleted→remove) so the UI just reacts to state; `onFrame` gets raw frames.
   */
  subscribe(
    event: string,
    scope?: EventScope | EventSubscribeOptions,
    handler?: (payload: unknown) => void
  ): Unsubscribe
  /** Observe all events passing through the frontend event pipeline */
  observe(handler: (entry: ObservableEventEntry) => void): Unsubscribe
  /** Retrieve the recent event entries from the observability ring buffer */
  getLog(): ObservableEventEntry[]
}

export interface CreateOptions {
  /** Id/name for the new object (a fresh one is generated when omitted). */
  id?: string
  name?: string
  /** Layout placement when the object is placed somewhere. */
  placement?: Placement
}

/**
 * A creator: `ctx.ui.box({ id: 'hero', pad: 4 })` and
 * `ctx.ui.box.create({ ... })` both build a new object and return its handle.
 *
 * Creation is a **compile-lane** act — the object graph is compiled, so a page
 * cannot grow a new object at runtime. Looking one up is `ctx.ui.get(id)`.
 * One way to do each thing, on both lanes.
 */
export type Creatable<
  P extends Record<string, any> = Record<string, any>,
  H extends ObjectHandle = ObjectHandle
> = {
  (props?: P & CreateOptions): H
  create(props?: P & CreateOptions): H
}


/**
 * The client action context — the shared base plus the complete UI surface
 * under `ctx.ui`. `C` is the action's own Contract.
 *
 * Implemented by the page runtime (`__morgana_createActionCtx`): args, event
 * (with the triggering element), ui (handles, pages, state, theme, dom,
 * events) and libraries are live.
 *
 * ✗ Deliberately ABSENT — do not add these back:
 *     objects              → deprecated; read objects via `ctx.ui`
 *     page                 → `ctx.ui.page` (current) / `ctx.ui.pages` (all)
 *     element/triggerEvent → `ctx.event.element` / `ctx.event.name`
 */
export interface ClientContext<C extends ActionContract = ActionContract> extends BaseContext<C> {
  /**
   * The structured trigger event — EVERYTHING about what fired this action:
   * `name` (the event), `element` (the DOM element that triggered it, null
   * when not event-wired), plus origin, target, payload, timestamp, traceId.
   * There is no separate `ctx.element` / `ctx.triggerEvent`.
   */
  event: ActionTriggerEvent

  /** The complete UI surface — object handles, pages, state, theme, dom, events. */
  ui: UiApi
  libraries: {
    get(name: string): unknown | null
    has(name: string): boolean
  }
}

/** A feed handle resolved by name — list-shaped objects expose append/patch/lock. */
export type ListRef = ListHandle
