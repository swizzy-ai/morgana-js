/**
 * The server-object lane — the context an object op runs with.
 *
 * An op is a server action scoped to one instance: same spine (args, vars,
 * apps, actions, assets, ai, auth, log, events), same `ctx.server` storage
 * surface (collections, files, queue, objects), plus `ctx.object` for this
 * instance and `ctx.args`/`ctx.params` carrying the op params (both names —
 * both call contracts exist).
 */
import type { BaseContext } from './base'

export interface ServerObjectInstanceHandle {
  type: string
  name: string
  instanceId: string
  state: Record<string, unknown>
  get(): Promise<Record<string, unknown>>
  set(patch: Record<string, unknown>): Promise<Record<string, unknown>>
}

export interface ServerObjectContext extends BaseContext {
  object: ServerObjectInstanceHandle
  args: Record<string, unknown>
  params: Record<string, unknown>
}
