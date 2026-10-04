/**
 * Object handles — the uniform surface every object gets (FRAMEWORK.md §3).
 *
 * These are interfaces only: the runtime implementations live in the engine /
 * compiled page runtime (Phase 1) and bind to the existing dispatch operators.
 * Objects are independent — placement is a separate, explicit act.
 */

import type { Family } from './families'
import type { EventName } from './events'
import type { BreakpointShape } from './props'
import type {
  ButtonTrackableEvent,
  InputTrackableEvent,
  PageTrackableEvent,
  ListTrackableEvent,
  ChartTrackableEvent,
  LinkTrackableEvent,
  TextTrackableEvent,
  BoxTrackableEvent,
} from './trackables'
import type {
  BoxProps,
  ButtonProps,
  ImageProps,
  InputProps,
  LinkProps,
  PageProps,
  TextProps,
  TableProps,
  TableColumn,
  TableDensity,
  TableVariant,
  DialogProps,
  SelectProps,
  SelectOption,
  TabsProps,
  TabsItem,
  BadgeProps,
  AlertProps,
  ToggleProps,
  FormProps,
  ProgressProps,
} from './props'

/** Placement config — the typed layout vocabulary (see ./layout). */
export type { Placement, GridSpec } from './layout'
import type { Placement } from './layout'
import type { Dim } from './layout'

/**
 * How a bound collection maps into the content template — shaping the data
 * without touching the vocabulary (`*field` bindings always address the
 * shaped record).
 */
export interface BindShape {
  /** Path inside the bound value to the record array (e.g. 'data.results'). */
  items?: string
  /** Field uniquely identifying a record — used for stable instance keys. */
  key?: string
  /** Rename fields: binding name → record field (`'*title'` reads `name`). */
  fields?: Record<string, string>
}

/**
 * Value resolver — `set` accepts a literal, a path into objects/state, or a
 * function re-evaluated when its sources change (the derived-value case).
 */
export type Resolver<T> = T | ((objects: ObjectLookup) => T)

/** Registry accessor handed to resolver functions. */
export interface ObjectLookup {
  get(name: string): ObjectHandle | undefined
}

export interface CloneOptions {
  /** Id/name for the clone (a fresh one is generated when omitted). */
  id?: string
  [key: string]: unknown
}

export interface TrackOptions {
  /** Register or forward this event stream to the backend session pipe */
  session?: boolean
  /** Explicit alias for forwarding directly to the backend session pipe */
  toBackend?: boolean
  /** Optional metadata associated with the tracked event session */
  metadata?: Record<string, unknown>
}

/**
 * A tracked event source — idempotent per object+event, so multiple
 * subscribers share one registration and one fan-out (FRAMEWORK.md §7).
 */
export interface EventSource {
  readonly name: string
  /** The object the source is tracked on. */
  readonly origin: { readonly name: string }
  readonly session?: boolean
  readonly toBackend?: boolean
  readonly metadata?: Record<string, unknown>
}

export type WhenSource = EventName | EventSource
export type EventHandler = (event: any) => void | Promise<void>
export type Unsubscribe = () => void

/**
 * One configurable token domain — `ctx.ui.transformers.effects.has('glow')` etc.
 * In the browser this surface is read-only (tokens are baked at compile time);
 * on the server (compile-time actions) `add`/`update`/`remove` mutate the
 * registry that the generated runtime is built from.
 */
export interface DomainStoreApi<T = unknown> {
  /** Add a new token. No-op when the key already exists (prefer `update`). */
  add(key: string, value: T): void
  /** Create-or-overwrite a token. */
  update(key: string, value: T): void
  remove(key: string): void
  has(key: string): boolean
  get(key: string): T | undefined
}

/**
 * The transformer token registry surface — the declarative `make()` vocabulary.
 * Domains mirror the server TransformerConfig (effects, radius, spacing,
 * dimensions, fonts, surfaces, layout, alignment, shorthands, colors).
 */
export interface TransformerConfigApi {
  /** Bare effect words → resolved boxShadow CSS. */
  effects: DomainStoreApi<string>
  /** Bare radius words → radius token. */
  radius: DomainStoreApi<string>
  /** Bare spacing words → one or more pad/gap props. */
  spacing: DomainStoreApi<Array<[string, number]>>
  /** Bare dimension words → width/height writes. */
  dimensions: DomainStoreApi<{ prop: string; value: string }>
  /** Bare font words → the object's `font` token. */
  fonts: DomainStoreApi<string>
  /** Bare surface words → canonical surface token. */
  surfaces: DomainStoreApi<string>
  /** Bare layout words → the container `layout` token. */
  layout: DomainStoreApi<string>
  /** Bare alignment words → the align token. */
  alignment: DomainStoreApi<'center' | 'left' | 'right' | string>
  /** Bare style shorthand words → concrete prop writes. */
  shorthands: DomainStoreApi<Record<string, string>>
  /** Named CSS color words the color resolver recognizes. */
  colors: DomainStoreApi<string>
}

/**
 * The breakpoint registry — a completely separate concern from transformers.
 *
 * Breakpoints are SHAPED, never static: a name maps to a `BreakpointShape`
 * (minWidth/maxWidth bounds) declared in the shape phase
 * (`config.on: 'compile'` actions). Object handles consume the registry via
 * `setWithBreakpoint`, and the breakpoint renderer compiles every shaped
 * breakpoint into scoped CSS media queries — so the UI works automatically
 * with pure CSS, no JS viewport listening.
 */
export interface BreakpointsApi {
  /** Shape (create-or-overwrite) a named breakpoint. */
  define(name: string, shape: BreakpointShape): void
  /** Alias of define. */
  shape(name: string, shape: BreakpointShape): void
  /** Read a shaped breakpoint (undefined when unshaped). */
  get(name: string): BreakpointShape | undefined
  /** Is this breakpoint shaped? */
  has(name: string): boolean
  /** Every shaped breakpoint. */
  entries(): [string, BreakpointShape][]
  /** Remove a shaped breakpoint. */
  remove(name: string): void
}

/**
 * Object handles — the uniform surface every object gets (FRAMEWORK.md §3).
 *
 * `ObjectHandle<P>` is generic over the object's prop map, so `set` knows what
 * it can set: a `BoxHandle` only accepts box props, with enum values enforced
 * (`layout: 'banana'` is a compile error). The default `ObjectHandle = ObjectHandle<Record<string, any>>`
 * keeps untyped/custom objects working exactly as before.
 *
 * These are interfaces only: the runtime implementations live in the engine /
 * compiled page runtime (Phase 1) and bind to the existing dispatch operators.
 * Objects are independent — placement is a separate, explicit act.
 */

/** Base prop map — the loose default for custom / untyped objects. */
export type AnyProps = Record<string, any>

/**
 * Bare value → shorthand property. `make('red')` sets the object's default
 * color property; `make('round')` sets radius; `make('glass')` sets surface;
 * multi-prop tokens like `make('centered')` set several props at once.
 */
export type MakeToken =
  | string // color (#hex, rgb(), hsl(), named) or unresolved
  | 'round' | 'rounded' | 'circle' | 'pill' | 'sharp' | 'square' | 'soft' | 'softer' | 'softest' | 'tiny' | 'chunky'
  | 'fullParentWidth' | 'full-width' | 'fullwidth' | 'fullWidth' | 'full' | 'half' | 'halfWidth' | 'auto'
  | 'hugContent' | 'hug-content' | 'hugcontent' | 'hug' | 'fullHeight' | 'third' | 'threeQuarters'
  | 'glass' | 'glass-card' | 'glassCard' | 'dark-glass' | 'darkGlass' | 'dark' | 'card' | 'panel' | 'muted'
  | 'brand' | 'accent' | 'neutral' | 'primary' | 'secondary' | 'danger' | 'success' | 'panel-elevated' | 'elevated'
  | 'glow' | 'glow-brand' | 'glow-success' | 'glow-danger' | 'glow-accent' | 'raised' | 'shadow' | 'inner' | 'flat'
  | 'floating' | 'bubbly' | 'inset'
  | 'h1' | 'h2' | 'h3' | 'body-lg' | 'bodyLarge' | 'body-sm' | 'bodySmall' | 'body-me' | 'body' | 'mono'
  | 'display' | 'display-lg' | 'caption' | 'headline' | 'title' | 'subtitle'
  | 'row' | 'column' | 'col' | 'horizontal' | 'vertical' | 'stacked'
  | 'padded' | 'roomy' | 'spacious' | 'airy' | 'compact' | 'tight' | 'gap'
  | 'centered' | 'centre' | 'middle' | 'left' | 'right' | 'center'
  | 'bold' | 'semibold' | 'light' | 'italic' | 'underlined' | 'underline' | 'hidden' | 'invisible' | 'visible'
  | 'uppercased' | 'lowercase' | 'backgroundless'
  | 'draggable' | 'expandable' | 'tappable' | 'clickable'
  | 'fade-in' | 'fade-out' | 'slide-up' | 'slide-down' | 'scale-in' | 'scale-out' | 'pulse' | 'bounce' | 'spin' | 'smooth' | 'bouncy'
  | 'spa' // pages only — turns the page into an SPA shell

export interface ObjectHandle<P extends Record<string, any> = AnyProps> {
  readonly name: string
  readonly type: string
  readonly family: Family
  placement?: Placement

  get<K extends keyof P>(prop: K): P[K] | undefined
  get(prop: string): unknown
  /** Single-prop set; value may be a resolver (literal | path | function). */
  set<K extends keyof P>(prop: K, value: Resolver<P[K]>): void
  set(prop: string, value: any): void
  setProps(props: Partial<{ [K in keyof P]: Resolver<P[K]> }>): void
  /**
   * Transformer shorthand. Three forms:
   *   make('red')            → bare value (color/shape/effect token)
   *   make('radius', 'lg')   → explicit property + value
   *   make({ bg: 'red', radius: 'lg' }) → bulk props through transformers
   */
  make<T extends keyof P>(prop: keyof P, value: Resolver<P[T]>): void
  make(value: MakeToken): void
  make(props: Partial<{ [K in keyof P]: Resolver<P[K]> }>): void

  /**
   * Breakpoint-scoped props — the object's responsive layer, entirely separate
   * from `make`/transformers. Two forms:
   *
   *   setWithBreakpoint('tablet', { layout: 'row', gap: 8 })
   *   setWithBreakpoint('tablet', 'pad', 8)
   *
   * The value is compiled into scoped CSS under the breakpoint's shaped media
   * query (the breakpoint render), so it applies automatically with pure CSS.
   */
  setWithBreakpoint<T extends keyof P>(bp: string, prop: T, value: Resolver<P[T]>): void
  setWithBreakpoint(bp: string, props: Partial<{ [K in keyof P]: Resolver<P[K]> }>): void
  /** Read a breakpoint-scoped prop as stored at that exact breakpoint. */
  getWithBreakpoint(bp: string, prop: string): unknown
  /** Every breakpoint-scoped props map on this object. */
  breakpointProps(): Record<string, Record<string, unknown>>
  /** Remove a breakpoint scope — entirely, or just one prop inside it. */
  clearBreakpoint(bp: string, prop?: string): void

  /** Surfaces only — checked against the compatibility table. */
  place(child: ObjectHandle, placement?: Placement): void
  /**
   * Surfaces only — register a composed object (the box + its children) as
   * the content template for `bind()`. Every bound record instantiates the
   * template; `*field` prop bindings resolve against each record. The
   * template is a declaration, not a rendered child.
   */
  addContent(template: ObjectHandle): void
  /**
   * Bind a data source — a state path (`'catalog.products'`) or a raw array.
   * Records auto-flow through the grid; no explicit `place()` per instance.
   * `shape` maps the source onto the record list (array path, key field,
   * field renames).
   */
  bind(source: string | unknown[], shape?: BindShape): void
  clone(opts?: CloneOptions): ObjectHandle
  copy(opts?: CloneOptions): ObjectHandle
  move(to: string | [Dim, Dim]): void
  remove(): void

  /** Wire an event — a catalog event name or a tracked source handle. */
  when(event: WhenSource, handler: EventHandler): Unsubscribe
  /** Track an activity/change as a shareable event source. Idempotent. */
  track(event: string, opts?: TrackOptions): EventSource
  /** Emit an event directly on this object handle. */
  emit?(event: string, payload?: any): void
  animate(name: string, opts?: Record<string, unknown>): void
}

// ── Typed handles — the airtight per-family surface (props.ts) ──────────────

export interface BoxHandle extends ObjectHandle<BoxProps> {
  track(event: BoxTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

export interface TextHandle extends ObjectHandle<TextProps> {
  track(event: TextTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

export interface ButtonHandle extends ObjectHandle<ButtonProps> {
  disable(): void
  enable(): void
  setLoading(loading: boolean): void
  click(): void
  track(event: ButtonTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

export interface InputHandle extends ObjectHandle<InputProps> {
  value: string
  clear(): void
  focus(): void
  blur(): void
  validate(): boolean
  setError(error: string | null): void
  track(event: InputTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

export interface ImageHandle extends ObjectHandle<ImageProps> {
  track(event: string, opts?: TrackOptions): EventSource
}

export interface LinkHandle extends ObjectHandle<LinkProps> {
  track(event: LinkTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

/** List/feed handle — a view over a source: state or collection. */
export interface ListHandle extends ObjectHandle {
  /** State-backed append — writes the bound source; the engine stamps the node. */
  append(record: Record<string, unknown>): void
  /** O(1) tail patch — update the last/matched item without a re-render. */
  patch(record: Record<string, unknown>): void
  /** Suppress state-driven restamps (e.g. during streaming). */
  lock(): void
  unlock(): void
  /** Bind a collection as this feed's source, records mapped to a template. */
  subscribe(store: string, opts?: { as?: string; scope?: Record<string, unknown> }): void
  track(event: ListTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

/** Page handle — a surface that places objects and can be rendered. */
export interface PageHandle<P extends PageProps = PageProps> extends ObjectHandle<P> {
  /** Page children (read-only convenience — objects are still independent). */
  readonly children: string[]
  /** The page's declared address (route path). Defaults to `/{name}`. */
  readonly address: string
  /** Params parsed from the current URL — SPA route params + query params, live. */
  readonly params: Record<string, string>
  /** Active state of this page */
  isActive?: boolean
  /** Set route/query parameters on this page */
  setParams?(params: Record<string, string>): void
  /** Turn this page into an SPA shell (optionally declaring its route). */
  spa(route?: string): this
  /** Declare/replace this page's SPA route. */
  route(path: string): this
  /** Attach this page to an app by name (also `set('app', name)`). Idempotent. */
  app(name: string): this
  /** Navigate the browser to a route — history API via the page's router. */
  navigate(path: string): void
  /**
   * Attach a child page to this SPA shell at `path`. The child becomes a route
   * (`template[data-spa-route]`) served by this shell's router. Idempotent.
   * Pass a page name or a `PageHandle`.
   */
  page(path: string, page: string | PageHandle): this
  track(event: PageTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

// ── Visuals — Chart (graphics) ─────────────────────────────────────────────

/**
 * Chart handle — the data atom. Everything is a prop on the object surface:
 * kind (bar | line | area | pie | donut | scatter), series/labels/points,
 * bind (resolver path into collection | state), palette, axes, legend,
 * gridlines, renderer ('svg' native | 'chartjs'). Per-mark events arrive via
 * `when('selected', …)`; export via `download('svg' | 'png')`.
 */
export interface ChartHandle extends ObjectHandle {
  readonly kind: ChartKind
  readonly renderer: ChartRendererKind
  /** The resolved chart state both renderer backends consume. */
  chartState(): ChartStateView
  track(event: ChartTrackableEvent | (string & {}), opts?: TrackOptions): EventSource
}

export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter'
export type ChartRendererKind = 'svg' | 'chartjs'
export interface ChartStateView {
  kind: ChartKind
  series: number[][]
  labels: string[]
  points: Array<{ x: number; y: number; r?: number; c?: number }>
  orientation: 'v' | 'h'
  stacked: boolean
  innerRadius: number
  smooth: boolean
  markers: boolean
  palette: string[]
  axes: { x: boolean; y: boolean }
  legend: 'none' | 'top' | 'bottom' | 'right'
  gridlines: 'none' | 'x' | 'y' | 'both'
}

// ── Table Handle ────────────────────────────────────────────────────────────

export interface TableHandle extends ObjectHandle<TableProps> {
  setData(rows: Array<Record<string, any>>): void
  setColumns(columns: TableColumn[]): void
  setPage(page: number): void
  setPageSize(pageSize: number): void
  nextPage(): void
  prevPage(): void
  sort(columnKey: string, direction?: 'asc' | 'desc'): void
  clearSort(): void
  filter(columnKey: string, value: any): void
  setSearch(query: string): void
  select(key: string | string[]): void
  deselect(key: string | string[]): void
  selectAll(): void
  clearSelection(): void
  getSelectedRows(): Array<Record<string, any>>
  getSelectedKeys(): string[]
  setDensity(density: TableDensity): void
  setVariant(variant: TableVariant): void
  setLoading(loading: boolean): void
  exportData(format?: 'json' | 'csv'): string
  getPaginatedRows(): Array<Record<string, any>>
  getFilteredRows(): Array<Record<string, any>>
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Dialog Handle ───────────────────────────────────────────────────────────

export interface DialogHandle extends ObjectHandle<DialogProps> {
  open(): void
  close(): void
  toggle(): void
  confirm(): void
  cancel(): void
  dismiss(): void
  setTitle(title: string): void
  setDescription(description: string): void
  isOpen(): boolean
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Select Handle ───────────────────────────────────────────────────────────

export interface SelectHandle extends ObjectHandle<SelectProps> {
  select(value: string): void
  deselect(value: string): void
  clear(): void
  setOptions(options: SelectOption[]): void
  open(): void
  close(): void
  toggle(): void
  getValue(): string | string[] | undefined
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Tabs Handle ─────────────────────────────────────────────────────────────

export interface TabsHandle extends ObjectHandle<TabsProps> {
  setActive(key: string): void
  next(): void
  prev(): void
  getActive(): string | undefined
  getActiveKey(): string | undefined
  setItems(items: TabsItem[]): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Badge Handle ────────────────────────────────────────────────────────────

export interface BadgeHandle extends ObjectHandle<BadgeProps> {
  setLabel(label: string): void
  setVariant(variant: string): void
  remove(): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Alert Handle ────────────────────────────────────────────────────────────

export interface AlertHandle extends ObjectHandle<AlertProps> {
  show(message?: string): void
  hide(): void
  setVariant(variant: 'info' | 'success' | 'warning' | 'danger'): void
  dismiss(): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Toggle / Switch Handle ──────────────────────────────────────────────────

export interface ToggleHandle extends ObjectHandle<ToggleProps> {
  toggle(): void
  check(): void
  uncheck(): void
  isChecked(): boolean
  setLabel(label: string): void
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Form Handle ─────────────────────────────────────────────────────────────

export interface FormHandle extends ObjectHandle<FormProps> {
  getValue(field: string): any
  setValue(field: string, value: any): void
  getField(field: string): any
  setField(field: string, value: any): void
  setValues(values: Record<string, any>): void
  getValues(): Record<string, any>
  setError(field: string, error: string | null): void
  clearError(field: string): void
  clearAllErrors(): void
  reset(): void
  submit(): void
  validate(schemaOrRules?: any): boolean
  track(event: string, opts?: TrackOptions): EventSource
}

// ── Progress Handle ─────────────────────────────────────────────────────────

export interface ProgressHandle extends ObjectHandle<ProgressProps> {
  setValue(value: number): void
  setProgress(value: number): void
  increment(delta?: number): void
  reset(): void
  track(event: string, opts?: TrackOptions): EventSource
}
