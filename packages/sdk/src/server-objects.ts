/**
 * Custom server objects — the one generic factory for every object type.
 *
 * The compiler searches source for the `customServerObject` identifier (the
 * same way it searches `defineServerAction`/`defineClientAction`) and reads
 * the literal statically — the definition is never executed at build time.
 * The def shape matches the worker's `ObjectDef`, so nothing downstream
 * needs a new format. `hotsheet`'s sheet object is the first instance; any
 * future type repeats the pattern with zero framework changes.
 */
import type { ServerObjectContext } from './contexts/server-object'

export interface ServerObjectColumnDef {
  name: string
  type: string
  /**
   * Column behaviours. A string names a deployed action (stored as data,
   * executed through the host's `invoke` bridge — the only form that survives
   * the wire and DO storage). A function runs in-process only (dev/compile,
   * hotsheet used directly) and is rejected loudly by object ops.
   */
  when?: string | ServerObjectBehaviorFn
  do?: string | ServerObjectBehaviorFn
  deps?: string[]
  for?: string
}

export type ServerObjectBehaviorFn = (
  row: Record<string, unknown>,
  ctx: ServerObjectContext,
) => unknown | Promise<unknown>

export interface ServerObjectLinks {
  [field: string]: { object: string; relation?: string }
}

export interface ServerObjectDef {
  /** The object type — `objects.create('<name>', ...)` addresses it. */
  name: string
  shape?: { columns: ServerObjectColumnDef[] }
  links?: ServerObjectLinks
  computed?: Record<string, string>
  /** Op name → handler. Checked against def.ops server-side, so typos fail loudly. */
  ops: Record<
    string,
    (ctx: ServerObjectContext, params: Record<string, unknown>) => unknown | Promise<unknown>
  >
}

export type ServerObjectDefinition = ServerObjectDef

/**
 * Define a custom server object. Identity helper — the compiler reads the
 * literal, the runtime returns it.
 *
 * @example
 * export default customServerObject({
 *   name: 'sheet',
 *   shape: { columns: [{ name: 'rows', type: 'json' }] },
 *   ops: {
 *     append: async (ctx, p) => { ... },
 *   },
 * })
 */
export function customServerObject<D extends ServerObjectDef>(def: D): D {
  return def
}
