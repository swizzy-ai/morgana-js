/**
 * IR — the SDK-first intermediate graph.
 *
 * Compile-lane actions record into this via the compile ctx (place/set/make).
 * `render/` turns it into HTML/CSS/JS.
 */

export type ObjectKind = string

export interface BindingRecord {
  prop: string
  source: string
  shape?: { items?: string; key?: string; fields?: Record<string, string> }
}

export interface InlineWhenRecord {
  objectId: string
  event: string
}

export interface ObjNode {
  id: string
  kind: ObjectKind
  props: Record<string, unknown>
  children: string[]
  parentId: string | null
  /** bind() template (declaration, not a rendered child). */
  contentTemplateId: string | null
  bindings: BindingRecord[]
  breakpointProps: Record<string, Record<string, unknown>>
  tracked: string[]
  inlineWhens: InlineWhenRecord[]
  /**
   * Set when this node was created by a custom object component. The kind is
   * whatever the component's `render` said (default 'box'), so the component's
   * name never leaks into the render pipeline — it is identity, not a new kind.
   */
  customObject?: string
}

export interface PageNode {
  name: string
  address: string
  rootIds: string[]
  app: string | null
}

export interface AppNode {
  name: string
  displayName?: string
  description?: string
  pages: string[]
  /** What the app runs as. Defaults to `'web'` when absent. */
  type?: 'web' | 'desktop'
  /** Desktop identity — only meaningful when `type` is `'desktop'`. */
  platform?: { bundleId: string; icon?: string }
}

export interface StoreDecl {
  name: string
  shape: unknown
}

export interface ChannelDecl {
  name: string
  scope: 'public' | 'private' | 'system'
  /** Explicit audience. Empty is normalised away — see saveChannelRules. */
  members?: string[]
  /** A deployed action to ask. Set by `ctx.channels.create(…, { permissions })`. */
  access?: { action: string }
  description?: string
  /**
   * The permission function's source, captured at compile time.
   *
   * Internal: stripped before the manifest is written, because a function has no
   * JSON form. It exists between `create({ permissions })` and the emitted access
   * module, which is generated from it and deployed like any other action.
   */
  __src?: string
}

export interface LibraryDecl {
  name: string
  cdnUrl: string
  globalVar: string
  version?: string
}

export interface TriggerDecl {
  name: string
  run: string
  when?: Record<string, unknown>
  enabled?: boolean
  /** http-only */
  http?: { method: string; path: string; auth?: 'public' | 'member'; cors?: unknown }
  /** cron-only */
  cron?: string
  /** event-only: store.<name>.record.created | channel:<name> | action:<n>:completed ... */
  event?: string
}

export interface ProjectIR {
  objects: Map<string, ObjNode>
  pages: Map<string, PageNode>
  apps: Map<string, AppNode>
  stores: Map<string, StoreDecl>
  channels: Map<string, ChannelDecl>
  /** Named icon definitions (ctx.ui.icons.define). Values mirror the SDK IconDef shape. */
  icons: Map<string, { kind: string; [key: string]: unknown }>
  /** Declared JS libraries (CDN scripts for icon packs etc). */
  libraries: Map<string, LibraryDecl>
  /** transformer token mutations recorded in compile order */
  transformerMutations: Array<{ domain: string; op: 'add' | 'update' | 'remove'; key: string; value?: unknown }>
  breakpoints: Map<string, { minWidth?: number; maxWidth?: number; label?: string }>
  measures: Map<string, number | string>
  stateDefaults: Record<string, unknown>
  inlineWhens: InlineWhenRecord[]
  logs: string[]
  /** Public vars from morgana.config.ts — build-time constants, safe to ship. */
  vars: Record<string, unknown>
  /**
   * The project's custom object components, keyed by name. A node created by one
   * records `customObject` so the runtime knows which methods and lifecycle to
   * attach. Pure-`define` components never reach the client.
   */
  customObjects: Map<string, CustomObjectDecl>
}

/**
 * The compiler's view of a component. Serializable parts only — the functions
 * stay in the bundled module, so nothing here needs to survive JSON.
 */
export interface CustomObjectDecl {
  /** The component name, as declared. */
  name: string
  /** Absolute path to the component module. */
  file: string
  /** Built-in kind this object is created as. Defaults to 'box'. */
  render: string
  /** Prop defaults, from `defaultProps` (or its `props` alias). */
  defaultProps: Record<string, unknown>
  /** Seed state, from `state`. */
  state: Record<string, unknown>
  /** Declared events. */
  events: string[]
  /**
   * True when the component declares browser code — a lifecycle hook or
   * methods. A pure-`define` component is compiled entirely into real objects,
   * so when no component needs the browser, nothing is bundled at all.
   */
  hasRuntimeCode: boolean
  /** One-line description, when the component declares one. */
  description?: string
}

export function createEmptyIR(): ProjectIR {
  return {
    objects: new Map(),
    pages: new Map(),
    apps: new Map(),
    stores: new Map(),
    channels: new Map(),
    icons: new Map(),
    libraries: new Map(),
    transformerMutations: [],
    breakpoints: new Map(),
    measures: new Map(),
    stateDefaults: {},
    inlineWhens: [],
    logs: [],
    vars: {},
    customObjects: new Map(),
  }
}
