/**
 * Server objects — named, durable instances with their own state, tables,
 * methods and streams, reachable the same way from server and browser.
 *
 *   // src/server-objects/chat-room.ts
 *   export default defineServerObject({
 *     name: 'chat-room',
 *     state: { title: '', count: 0 },
 *     collections: { messages: { columns: [{ name: 'text', type: 'string' }] } },
 *     access: { read: 'public', subscribe: 'public', post: 'member' },
 *     methods: {
 *       post: async (self, p: { text: string }) => {
 *         const msg = self.db.messages.add({ text: p.text })
 *         self.set({ count: self.state.count + 1 })
 *         self.emit('message', msg)
 *         return msg
 *       },
 *     },
 *   })
 *
 *   const room = await ctx.objects.chatRoom.getOrCreate('general', { title: 'General' })
 *   await room.post({ text: 'hi' })          // typed from the definition
 *
 * Methods are transactions: one at a time per instance, all-or-nothing. A
 * method written as `async function*` streams: each `yield` reaches the
 * caller as it happens (an AI answer, token by token), and its state changes
 * commit when it finishes. Jobs run in the background on a snapshot and
 * change state by calling methods. In the cloud every instance is its own
 * Durable Object.
 */
import type { AuthUser } from './contexts/server'

export type ObjectAccessRule = 'public' | 'member' | 'server' | { role: string | string[] }

export interface ObjectColumn {
  name: string
  type?: 'string' | 'number' | 'boolean' | 'json' | 'date'
}

export interface ObjectQuery {
  /** Equality filters on fields. */
  where?: Record<string, unknown>
  sort?: { field: string; dir?: 'asc' | 'desc' }
  limit?: number
  offset?: number
}

export type ObjectRow = Record<string, any> & { id: string; createdAt: number; updatedAt: number }

/** One of an instance's own tables. Synchronous: it reads the instance's own storage. */
export interface ObjectTable {
  get(id: string): ObjectRow | null
  add(record: Record<string, unknown>): ObjectRow
  set(id: string, record: Record<string, unknown>): ObjectRow
  update(id: string, patch: Record<string, unknown>): ObjectRow | null
  remove(id: string): boolean
  query(opts?: ObjectQuery): { items: ObjectRow[]; total: number }
  count(where?: Record<string, unknown>): number
}

interface SelfBase<S, C> {
  /** The instance name it was created with. */
  readonly id: string
  readonly name: string
  /** The object type, e.g. `chat-room`. */
  readonly type: string
  /** The signed-in app user behind this call (null for server-initiated calls). */
  readonly caller: AuthUser | null
  /** Current state, including this call's own changes. */
  readonly state: Readonly<S>
  readonly db: { [K in keyof C]: ObjectTable }
  /** Send an event to every subscriber (released only if the call succeeds). */
  emit(event: string, data?: unknown): void
  /** The server context: vars and secrets, email, ai, files, objects, … */
  readonly ctx: any
}

/** What a method receives. */
export interface ObjectSelf<S = Record<string, any>, C = Record<string, any>> extends SelfBase<S, C> {
  /** Merge into state; committed with the call. */
  set(patch: Partial<S>): S
  /** Run a method later: `'30s'`, `'5m'`, `'2h'`, `'1d'`, ms from now, or a Date. */
  schedule(when: number | string | Date, method: string, params?: Record<string, unknown>): void
  /** Run a job in the background after this call commits (billed as CPU, not held in the object). */
  defer(job: string, params?: Record<string, unknown>): void
}

/** What a job receives: a snapshot, and methods to change it. */
export interface ObjectTaskSelf<S = Record<string, any>, C = Record<string, any>> extends SelfBase<S, C> {
  /** Run a method of this instance (serialized, transactional). */
  call(method: string, params?: Record<string, unknown>): Promise<unknown>
}

/** A method: returns a value, or (as `async function*`) streams its yields. */
type MethodFn<S, C> = (self: ObjectSelf<S, C>, params: any) => unknown
type JobFn<S, C> = (self: ObjectTaskSelf<S, C>, params: any) => unknown

export interface ServerObjectSpec<
  S extends Record<string, any> = Record<string, any>,
  C extends Record<string, { columns: ObjectColumn[] }> = Record<string, { columns: ObjectColumn[] }>,
  M extends Record<string, MethodFn<S, C>> = Record<string, MethodFn<S, C>>,
  J extends Record<string, JobFn<S, C>> = Record<string, JobFn<S, C>>,
  Cm extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Type name: lowercase letters, digits and dashes. `ctx.objects.<camelCase>` reaches it. */
  name: string
  /** Initial state of every new instance (`create(name, init)` merges `init` over it). */
  state?: S
  /** The instance's own tables. */
  collections?: C
  /** Values derived from state, stored with every commit and served with state. */
  computed?: { [K in keyof Cm]: (state: S) => Cm[K] }
  /**
   * What a *browser* may do. Anything not named is server-only. Server code
   * (actions, other objects) may always call everything.
   */
  access?: Partial<Record<'create' | 'read' | 'subscribe' | 'list' | 'remove' | (keyof M & string), ObjectAccessRule>>
  /** Runs inside the create transaction. */
  onCreate?: (self: ObjectSelf<S, C>, init: Partial<S>) => unknown
  /**
   * Transactions: one at a time per instance, all-or-nothing. Write one as
   * `async function*` to stream its yields to the caller; it still commits
   * (or discards) its state changes as a whole when it finishes.
   */
  methods?: M
  /** Background work started with `self.defer(job, params)`. */
  jobs?: J
}

/** Declare a server object. Identity at runtime; the compiler reads it. */
export function defineServerObject<
  S extends Record<string, any>,
  C extends Record<string, { columns: ObjectColumn[] }> = {},
  M extends Record<string, MethodFn<S, C>> = {},
  J extends Record<string, JobFn<S, C>> = {},
  Cm extends Record<string, unknown> = {},
>(spec: ServerObjectSpec<S, C, M, J, Cm>): ServerObjectSpec<S, C, M, J, Cm> {
  return spec
}

// ── the proxy: how server and browser code reach an instance ───────────────

type ParamOf<F> = F extends (self: any, params: infer P) => any ? P : never

/** A streaming method's call: iterate its yields; `result` is its return value. */
export type ObjectStream<Y, R> = AsyncIterable<Y> & { readonly result: Promise<R> }

type Called<F> = F extends (...a: any[]) => AsyncGenerator<infer Y, infer R, any>
  ? ObjectStream<Y, R>
  : F extends (...a: any[]) => AsyncIterable<infer Y>
    ? ObjectStream<Y, unknown>
    : F extends (...a: any[]) => infer R
      ? Promise<Awaited<R>>
      : never

type StateOf<D> = D extends ServerObjectSpec<infer S, any, any, any, infer Cm> ? S & Cm : Record<string, any>

export type ObjectInstance<D> = (D extends ServerObjectSpec<any, any, infer M, any, any>
  ? {
      [K in keyof M]: undefined extends ParamOf<M[K]>
        ? (params?: ParamOf<M[K]>) => Called<M[K]>
        : (params: ParamOf<M[K]>) => Called<M[K]>
    }
  : Record<string, (params?: any) => any>) & {
  readonly name: string
  readonly type: string
  /** State plus computed values, as last committed. */
  state(): Promise<StateOf<D>>
  /** Browser: subscribe to an event the object emits. Returns unsubscribe. */
  on(event: string, listener: (data: any) => void): () => void
  /** Browser: called with fresh state after every change. Returns unsubscribe. */
  watch(listener: (state: StateOf<D>) => void): () => void
  remove(): Promise<boolean>
}

export interface ObjectType<D> {
  /** Create a new instance with this name; fails if it exists. */
  create(name: string, init?: Partial<StateOf<D>>): Promise<ObjectInstance<D>>
  /** The existing instance, or a new one created with `init`. */
  getOrCreate(name: string, init?: Partial<StateOf<D>>): Promise<ObjectInstance<D>>
  /** A handle to an instance by name (calls fail with 404 if it does not exist). */
  get(name: string): ObjectInstance<D>
  exists(name: string): Promise<boolean>
  list(opts?: { page?: number; pageSize?: number }): Promise<{ items: Array<{ name: string; createdAt: number }>; total: number }>
  remove(name: string): Promise<boolean>
}

/**
 * Augmented by the generated `.morgana/objects.d.ts`, one entry per object
 * (yours and installed libraries'), so `ctx.objects.<name>` is fully typed.
 */
export interface ObjectRegistry {}

export type ObjectsApi = { [K in keyof ObjectRegistry]: ObjectType<ObjectRegistry[K]> } & {
  [name: string]: ObjectType<any>
}
