/**
 * The server lane — typed channels on `ctx.server` (FRAMEWORK.md §5).
 *
 * Collections/stores, files, queues and the HTTP surface are SERVER objects
 * accessed via `ctx.server`. State is browser-only and never appears
 * here (engine law). SSR is always served from a prebuilt @morgana/engine
 * build — the server never renders pages at request time.
 *
 * ✗ There is NO `ctx.server.events`, NO `ctx.server.emit` and NO
 *   `ctx.server.auth` — on purpose:
 *     events → the unified `ctx.events` (publish / emit / subscribe / channels)
 *     auth   → `ctx.auth` on the shared base (both lanes)
 *   Do not re-add them to `ServerApi`.
 */

import type { ActionContract, ActionInput, ActionOutput, ActionName, AppEventName, AppEventPayload, EventScope, RunOptions } from '../contracts'
import type { AgentsHandle, ToolsHandle } from '../ai-agents'
import type { BaseContext } from './base'
import type { QueueHandle } from '../data'

export interface ServerRequest {
  method: string
  /** Full URL — path + query string. */
  url: string
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  /** Parsed route params. */
  params?: Record<string, string>
  /** Authenticated user if available. */
  user?: unknown
  /** Caller IP — set when the runtime can determine it. */
  ip?: string
}

/**
 * A structured HTTP response a server action may return (or pass to
 * `ctx.server.respond`). When an action returns an object shaped like this,
 * the runtime maps it to a real HTTP response instead of the default wrapper.
 */
export interface ServerResponseInput<Body = unknown> {
  /** HTTP status code (default 200). */
  status?: number
  /** Response headers to set (lower-case keys preferred). */
  headers?: Record<string, string>
  /** Response content type (shorthand for `headers['content-type']`). */
  contentType?: string
  /** JSON-serializable body. */
  body: Body
}

export type StoreColumnDef = { id?: string; name: string; type: 'string' | 'number' | 'boolean' | 'date' | 'json' }
export type StoreShape = {
  columns?: StoreColumnDef[]
  tables?: Array<{ id?: string; name: string; columns: StoreColumnDef[] }>
}

export interface StoreQueryOptions {
  filter?: Record<string, unknown>
  where?: Array<{ field: string; op?: string; value: unknown }>
  sort?: { field: string; dir?: 'asc' | 'desc' }
  page?: number
  pageSize?: number
  fields?: string[]
}

export interface StoreQueryResult {
  items: Array<Record<string, unknown>>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Collections — server objects. `create` declares schemas at compile time.
 *
 * Every method is asynchronous, and that is a property of the *domain* rather
 * than of any implementation: reading a record means reaching storage, and
 * storage is not memory. There is deliberately no `MaybePromise` here. That type
 * used to exist so one contract could straddle a synchronous store and an
 * asynchronous one — which meant every caller had to guess whether to `await`,
 * and guessing wrong failed silently rather than at the type level: reading
 * `.items` off an un-awaited `query()` compiles cleanly and then throws
 * `cannot read property 'length' of undefined` at runtime. The handle says what
 * a collection is; it never says what is behind it.
 */
export interface CollectionsHandle {
  get(name: string, id?: string): Promise<any>
  set(name: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null>
  add(name: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  insert(name: string, record: Record<string, unknown>): Promise<Record<string, unknown>>
  update(name: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null>
  remove(name: string, id: string): Promise<boolean>
  delete?(name: string, id: string): Promise<boolean>
  count(name: string): Promise<number>
  /** Every matching record. Async for the same reason as `query` — a read. */
  find(name: string, predicate?: any): Promise<any[]>
  query(name: string, opts?: StoreQueryOptions): Promise<StoreQueryResult>
  /** Compile-mode only: declare/emit a store schema (→ migration). */
  create(name: string, shape?: StoreShape | any): Promise<StoreShape>
  /** Read the declared schema for a store (null when undeclared). */
  shape(name: string): Promise<StoreShape | null>
}

export interface AssetsHandle {
  /** Resolved, cache-busted URL for a bundled/remote asset. */
  url(name: string): string
  get(name: string): Promise<unknown>
}

/** A file's metadata — `path` is a slash-delimited key (may include folders). */
export interface FileMeta {
  name: string
  /** Slash-delimited key, e.g. `data/report.md` or `documents/README.md`. */
  path: string
  contentType: string
  size: number
  updatedAt: number
}

/**
 * Files — a `ctx.server.files` surface for running, editing and reading files.
 *
 * This is the writable counterpart to assets: assets are bundled, read-only
 * build inputs, while files are runtime records (config, exports, uploads,
 * generated artifacts). Every method is asynchronous — the same rule as
 * `CollectionsHandle`.
 */
export interface FilesHandle {
  /** Read a file's content — string for text, Uint8Array for binary. Null if missing. */
  read(path: string): Promise<string | Uint8Array | null>
  /** Create/overwrite a file. Returns its metadata. */
  write(path: string, data: string | Uint8Array, contentType?: string): Promise<FileMeta>
  /** Update (create-or-overwrite) a file, alias of write. */
  update(path: string, data: string | Uint8Array, contentType?: string): Promise<FileMeta>
  /** Delete a file. Returns true when one was removed. */
  remove(path: string): Promise<boolean>
  /** List files, optionally under a folder prefix. Sorted by path. */
  list(dir?: string): Promise<FileMeta[]>
  /** Metadata for a file, or null when missing. */
  stat(path: string): Promise<FileMeta | null>
}

export interface AuthUser {
  id: string
  email?: string
  name?: string
  roles: string[]
  [key: string]: unknown
}

export interface AuthHandle {
  /** The authenticated user for this invocation — null when unauthenticated. */
  user: AuthUser | null
  getSession(): Promise<{ user: unknown; token: string | null }>
  hasRole(role: string): boolean
  signIn(input: Record<string, unknown>): Promise<unknown>
  signUp(input: Record<string, unknown>): Promise<unknown>
  signOut(): Promise<void>
}

/**
 * AI ops — text and structured generation, plus agents and the tools they call.
 *
 * Three surfaces, one provider. `generateText` is a single call, `tools` is what
 * an agent is allowed to reach, and `agents` is a named instruction plus a way
 * to run it. They sit together because they share one model binding, so a caller
 * that configured one has configured all three.
 *
 * `agents` and `tools` are async for the same reason `collections` is: both read
 * durable declarations, and storage is not memory.
 */
export interface AiHandle {
  generateText(opts: { instructions: string; model?: string; maxTokens?: number }): Promise<string>
  generateObject<T = unknown>(opts: { instructions: string; structure?: unknown; model?: string; maxTokens?: number }): Promise<T>
  text(opts: { instructions: string; model?: string }): Promise<string>
  /** Durable, named LLM actors. `create` writes a declaration down; `run` works. */
  agents: AgentsHandle
  /** Tools an agent may call. A tool's body is the server action of that name. */
  tools: ToolsHandle
}

/** Calling other actions — contract-typed via the generated registry. */
export interface ActionsHandle {
  run<K extends ActionName>(
    name: K,
    params?: ActionInput<K>,
    opts?: RunOptions,
  ): Promise<ActionOutput<K>>
}

/**
 * @deprecated App events live on the unified `ctx.events.emit` — there is no
 * `ctx.server.emit`. Kept as a type only, so migrating code gets a deprecation
 * hint from the d.ts.
 */
export interface EmitHandle {
  <K extends AppEventName>(event: K, payload: AppEventPayload<K>, scope?: EventScope): void
}

export interface LogHandle {
  (...parts: unknown[]): void
  info(...parts: unknown[]): void
  warn(...parts: unknown[]): void
  error(...parts: unknown[]): void
  debug?(...parts: unknown[]): void
}

/**
 * Event channels + bus access for server actions.
 *
 * The world event bus is the backbone: publishing to a channel lands on the
 * bus as `channel:<name>`, which is what `when` triggers (config.on:
 * 'channel:ops'), the live SSE page-forwarder, and `subscribe()` all consume.
 * Channel management (list/create) is world-graph owned — declared channels
 * are `channel` world objects and serialize with the world.
 */
export interface ChannelInfo {
  name: string
  scope: 'public' | 'private' | 'system'
  subscribers: string[]
}

/**
 * @deprecated Channel management lives on the unified `ctx.events.channels`
 * (EventChannelsSurface). Kept as a type only for migration reading.
 */
export interface EventChannelsHandle {
  /** Declared channel objects plus runtime channels known to the transport. */
  list(): ChannelInfo[]
  /** Get-or-create a declared channel world object. */
  create(name: string, scope?: 'public' | 'private' | 'system'): ChannelInfo
  /** Direct subscription — handler receives (`channel:<name>`, payload). */
  subscribe(name: string, handler: (event: string, payload?: any) => void): () => void
  /** Drop a direct subscription by its exact handler. */
  unsubscribe(name: string, handler: (event: string, payload?: any) => void): boolean
}

/**
 * @deprecated Server events moved to the unified `ctx.events` (EventApi):
 * subscribe / publish / channels / grant / reject. There is NO
 * `ctx.server.events` — kept as a type only, so migrating code gets a
 * deprecation hint from the d.ts.
 */
export interface EventHandle {
  channels: EventChannelsHandle
  /**
   * Subscribe to a bus event (e.g. `store:notes:created`, `channel:ops`, or
   * a wildcard). The handler receives (event, payload) — matching the world
   * EventBus callback shape. Lives on the server until unsubscribed.
   */
  subscribe(event: string, handler: (event: string, payload?: any) => void): () => void
  unsubscribe(event: string, handler: (event: string, payload?: any) => void): boolean
  /**
   * Publish to a named channel: fans out to direct channel subscribers, the
   * host transport (pubsub adapter), and the world bus (`channel:<name>`).
   */
  publish(channel: string, payload?: any): boolean | Promise<boolean>
}

/**
 * The server-side lane — every server/edge concern, grouped under `ctx.server`
 * so the base context stays clean.
 */
export interface ServerApi {
  env: Record<string, string>
  request: ServerRequest
  /**
   * Emit a structured HTTP response from the action. Calling `ctx.server.respond`
   * (or `ctx.server.response.respond`) short-circuits the default
   * `{ success, data }` wrapper; the action should `return` after.
   * `ctx.server.response.status/setHeader` are imperative controls that
   * compose with it.
   */
  respond(body: unknown, opts?: { status?: number; headers?: Record<string, string>; contentType?: string }): void
  /** Response controls — set status/headers or emit a structured response. */
  response: {
    status(code: number): void
    setHeader(name: string, value: string): void
    respond(input: ServerResponseInput): void
    stream(handler: (emit: (chunk: unknown) => void) => Promise<void>): void
  }
  collections: CollectionsHandle
  files: FilesHandle
  queue: QueueHandle

  // ✗ Deliberately ABSENT — do not add these back:
  //     auth   → `ctx.auth` on the shared base (both lanes)
  //     events → `ctx.events` (publish / subscribe / channels / grant)
  //     emit   → `ctx.events.emit`
  //     email  → removed for now. There was never an implementation behind
  //              `ctx.server.email`; it was declared and never built, which is
  //              the exact failure this codebase is trying to eliminate. It
  //              returns when there is a real binding behind it.
}

/**
 * The server action context — the shared base plus every server/edge concern
 * on `ctx.server`. `C` is the action's own Contract.
 */
export interface ServerContext<C extends ActionContract = ActionContract> extends BaseContext<C> {
  /** Every server/edge concern: collections, files, queue, events, HTTP… */
  server: ServerApi
}