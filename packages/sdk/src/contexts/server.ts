/**
 * The server lane — typed channels on `ctx.server` (FRAMEWORK.md §5).
 *
 * Collections/stores, files, queues and the HTTP surface are SERVER objects
 * accessed via `ctx.server`. State is browser-only and never appears
 * here (engine law). SSR is always served from a prebuilt @studiomorgana/engine
 * build — the server never renders pages at request time.
 *
 * ✗ There is NO `ctx.server.events`, NO `ctx.server.emit` and NO
 *   `ctx.server.auth` — on purpose:
 *     events → the unified `ctx.events` (publish / emit / subscribe / channels)
 *     auth   → `ctx.auth` on the shared base (both lanes)
 *   Do not re-add them to `ServerApi`.
 */

import type { ObjectInstance, ObjectsApi } from '../objects'
import type { ActionContract, ActionInput, ActionOutput, ActionName, AppEventName, AppEventPayload, EventScope, RunOptions } from '../contracts'
import type { AgentsHandle, ToolsHandle } from '../ai-agents'
import type { WizardsHandle, WizardBuilder } from '../ai-wizard'
import type { BaseContext } from './base'
import type { QueueHandle } from '../data'
import type { ObjectHandle } from '../handles'

/**
 * The branded result of `ctx.ui.pages.render(name)`. The host sends it as
 * text/html instead of the `{ success, data }` JSON envelope. Branded so a
 * plain `{ html }` data object can never be mistaken for a page.
 */
export interface ServerPageResult {
  __morganaPage: true
  html: string
}

/**
 * The request-time UI surface on server actions. Load-only: `get` looks up an
 * object the compile lane defined (`ctx.ui.box(...)` creation stays in the
 * compile lane), and `pages.render` renders the mutated page to HTML.
 */
export interface ServerUiApi {
  /**
   * Look up a compile-time object by id. Async on purpose: the cloud host
   * loads the page graph from storage, and one shape has to work on both
   * hosts. `await` it — awaiting a sync value is harmless, a floating
   * promise is not.
   */
  get<T extends ObjectHandle = ObjectHandle>(id: string): Promise<T | undefined>
  pages: {
    /**
     * Render the page to a branded result the host serves as text/html.
     * Async like `get` — one async surface, both hosts.
     */
    render(name?: string): Promise<ServerPageResult>
  }
  /**
   * Flat alias for `pages.render` — the same call one level up. Exists
   * because the cloud sandbox rebuilds `ui` from what crosses the WASM
   * bridge, and deep nesting is what gets dropped there. Either form works
   * on both hosts; this one is what the guest wrapper calls.
   */
  renderPage(name?: string): Promise<ServerPageResult>
}

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

/** One message for `ctx.server.email.send`. Needs `html`, `text`, or both. */
export interface EmailMessage {
  to: string | string[]
  /** Sender. Defaults to the `EMAIL_FROM` var. */
  from?: string
  subject: string
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string | string[]
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  /** Same key → sent once, however many times the action retries. */
  idempotencyKey?: string
}

export interface EmailResult {
  /** The provider's message id. */
  id: string
  provider: string
}

/**
 * A sandbox: a working folder where a server action writes files, installs
 * packages and runs programs — `npm install`, a compiler, `morgana dev` —
 * and gets a URL for what it serves. One sandbox per name; it keeps its files
 * and its running programs between calls until it is stopped or destroyed.
 *
 * Commands are argument lists, never a shell line: `['npm', 'install']`.
 *
 * Hosts: `morgana dev` gives each sandbox a plain folder under
 * `.data/sandboxes/<name>/` — fast, and not isolated, so it is for your own
 * code. The cloud host gives each one an isolated container.
 */
export interface SandboxApi {
  /** Open a sandbox by name, making it if it doesn't exist: `ctx.server.sandbox.open('session-42')`. */
  open(name: string): Promise<SandboxHandle>
  /** The names of the sandboxes that exist. */
  list(): Promise<string[]>
}

export interface SandboxHandle {
  readonly name: string
  /** Write one file (folders are made as needed). Paths are relative to the sandbox. */
  write(path: string, data: string | Uint8Array): Promise<void>
  /** Write many files at once: `{ 'src/home.ts': '…', 'package.json': '…' }`. */
  writeMany(files: Record<string, string | Uint8Array>): Promise<void>
  /** A file's text, or null if it isn't there. */
  read(path: string): Promise<string | null>
  /** Every file under a folder (default: the whole sandbox), as relative paths. */
  list(folder?: string): Promise<string[]>
  /** Remove a file or folder. */
  remove(path: string): Promise<void>
  /** Run a program to the end: `run(['npm', 'test'])`. Never throws for a failing program — read `ok`. */
  run(command: string[], opts?: SandboxRunOptions): Promise<SandboxResult>
  /** `npm install`, or `npm install <packages>`. */
  install(packages?: string[], opts?: SandboxRunOptions): Promise<SandboxResult>
  /**
   * Start a program that keeps running (a dev server). With `port`, the host
   * picks a free port (or uses the number given), puts it in `PORT` and in
   * any `{port}` in the command, waits until it answers, and returns its URL.
   */
  start(command: string[], opts?: SandboxStartOptions): Promise<SandboxProcess>
  /** The programs started in this sandbox. */
  processes(): Promise<SandboxProcess[]>
  /** Stop one started program, or all of them. */
  stop(id?: string): Promise<void>
  /** Stop everything and delete the sandbox's files. */
  destroy(): Promise<void>
}

export interface SandboxRunOptions {
  /** Folder to run in, relative to the sandbox. */
  cwd?: string
  /** Extra environment variables. */
  env?: Record<string, string>
  /** Give up after this many milliseconds (default 120000). */
  timeout?: number
}

export interface SandboxStartOptions extends Omit<SandboxRunOptions, 'timeout'> {
  /** `true` or `'auto'` for any free port, or a number. */
  port?: true | 'auto' | number
  /** How long to wait for the port to answer, in milliseconds (default 60000). */
  wait?: number
}

export interface SandboxResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  /** True when it was stopped for running past its timeout. */
  timedOut: boolean
}

export interface SandboxProcess {
  id: string
  command: string[]
  running: boolean
  port?: number
  url?: string
  /** The last of what it printed (stdout and stderr together). */
  output(): Promise<string>
}

export interface EmailHandle {
  send(message: EmailMessage): Promise<EmailResult>
}

export interface AuthUser {
  id: string
  email?: string
  name?: string
  roles: string[]
  [key: string]: unknown
}

/**
 * Server-lane auth — the end-users of *this app* (not Morgana project members).
 *
 * `user` is resolved from the request's session cookie before the action runs.
 * `signIn`/`signUp`/`signInAs` start a session and set the cookie on this
 * response; `signOut` revokes it. `require` throws a 401/403 the host turns
 * into that status, so a guarded action is one line.
 */
export interface ServerAuthHandle {
  /** The signed-in user for this request — null when signed out. */
  readonly user: AuthUser | null
  hasRole(role: string): boolean
  /** The user, or throw 401 (signed out) / 403 (missing every listed role). */
  require(role?: string | string[]): AuthUser
  signUp(input: { email: string; password: string; name?: string }): Promise<AuthUser>
  signIn(input: { email: string; password: string }): Promise<AuthUser>
  /** Start a session for an existing user — invites, magic links, OAuth callbacks. */
  signInAs(userId: string): Promise<AuthUser>
  signOut(): Promise<void>
  /** User administration. Lookups are by id or email; there is no listing. */
  users: {
    get(id: string): Promise<AuthUser | null>
    findByEmail(email: string): Promise<AuthUser | null>
    create(input: { email: string; password?: string; name?: string; roles?: string[] }): Promise<AuthUser>
    setRoles(id: string, roles: string[]): Promise<AuthUser>
    setPassword(id: string, password: string): Promise<void>
  }
  /**
   * Password reset. `create` returns a one-hour token to put in an emailed
   * link — or null when no account has that address (answer the visitor the
   * same way either way). `complete` spends the token and sets the password.
   */
  passwordReset: {
    create(email: string): Promise<{ token: string; user: AuthUser } | null>
    complete(token: string, password: string): Promise<AuthUser>
  }
  /** Email verification: a one-day token to email, then `verify` marks `user.emailVerified`. */
  emailVerification: {
    create(userId: string): Promise<string>
    verify(token: string): Promise<AuthUser>
  }
}

/** @deprecated Use `ServerAuthHandle` (server) or `ClientAuthHandle` (browser). */
export type AuthHandle = ServerAuthHandle

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
  /** Durable wizard runs. A wizard is defined in code; its runs are stored. */
  wizard: WizardsHandle
  /** Build a wizard to hand to `wizard.run`/`resume`. The package's `createWorkflow`. */
  createWorkflow(options?: Record<string, unknown>): WizardBuilder
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
    /**
     * Stream the body as it is produced: each `emit(chunk)` is sent at once —
     * a string as-is, anything else as one JSON line (NDJSON). Status and
     * headers set before the first emit apply. Resolves when the handler does.
     */
    stream(
      handler: (emit: (chunk: unknown) => Promise<void> | void) => Promise<void>,
      opts?: { contentType?: string },
    ): Promise<void>
  }
  collections: CollectionsHandle
  files: FilesHandle
  queue: QueueHandle

  // ✗ Deliberately ABSENT — do not add these back:
  //     auth   → `ctx.auth` on the shared base (both lanes)
  //     events → `ctx.events` (publish / subscribe / channels / grant)
  //     emit   → `ctx.events.emit`
  //     ctx.email → email is a server concern and lives here only.
  /**
   * Transactional email — Resend over HTTP on both hosts. Configure with the
   * `RESEND_API_KEY` secret and an `EMAIL_FROM` var; `EMAIL_PROVIDER=console`
   * prints instead of sending.
   */
  email: EmailHandle
  /**
   * Sandboxes: a folder to write files into, install packages and run
   * programs in, with a URL for what they serve. See `SandboxApi`.
   */
  sandbox: SandboxApi
}

/**
 * The server action context — the shared base plus every server/edge concern
 * on `ctx.server`. `C` is the action's own Contract.
 */
export interface ServerContext<C extends ActionContract = ActionContract> extends BaseContext<C> {
  /** End-user auth for this request — see `ServerAuthHandle`. */
  auth: ServerAuthHandle
  /** Server objects by camelCase name — `ctx.objects.chatRoom.getOrCreate('general')`. */
  objects: ObjectsApi
  /**
   * When this action runs because of `on: 'object:<type>[/<name>].<event>'`:
   * that instance (the event itself is `ctx.args.event` — `{ kind, source,
   * event, object: { type, instanceId }, payload, timestamp }`).
   */
  object?: ObjectInstance<any>
  /** Every server/edge concern: collections, files, queue, events, HTTP… */
  server: ServerApi
  /**
   * Request-time UI: load a compile-time object, set data on it, render the
   * page. Present on every server action; only `render: 'server'` pages are
   * served from it, but `get` works wherever a page graph is loaded.
   */
  ui: ServerUiApi
}