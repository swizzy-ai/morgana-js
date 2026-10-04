/**
 * Action factories (FRAMEWORK.md §10) — the one way to author actions.
 *
 * Two kinds, all sharing the same template:
 *
 *   const action = define<Family>Action({
 *     config,   // optional — event/route wiring (`on`) where the action needs it
 *     handler,  // (ctx) => output — ctx only, never an args param
 *   })
 *
 * 1. Actions (generic + event-based):
 *      defineServerAction   — ServerContext (collections, files, queue, auth,
 *                             events, emit, request/respond — the full HTTP
 *                             surface lives under ctx.server)
 *      defineClientAction  — ClientContext (ui objects/state/theme, …)
 *    `config.on` is what makes an action event-based ('store.…record.created',
 *    'cron(every 1h)', 'http.get /api/widgets'). Without config it's a plain
 *    generic action, invoked on demand via ctx.actions.run.
 *
 * 2. Compile-time actions:
 *    `config.on: 'compile'` marks an action for the shape phase — it runs
 *    idempotently during compilation, never on its own. Used for seeding
 *    collections, shaping stores, and initializing the world graph.
 *
 * The exported const name is the action's name; factories are identity helpers
 * (configs/actions are tooling-read patterns, never sandbox-executed).
 */

import type { ServerContext } from './contexts/server'
import type { ClientContext } from './contexts/client'
import type { ServerApiCors } from './config'

/** Optional config — event/route wiring. Empty means a plain generic action. */
export interface ActionConfig {
  /**
   * Trigger selector(s): catalog event, 'cron(every …)' schedule,
   * 'http.<method> <path>' route, or 'compile' for build-time shape phase.
   * Discovered statically from the source.
   */
  on?: string | string[]
  /** Filter — narrows the event/match by data. */
  when?: Record<string, unknown>
  /** Route auth (http triggers only): 'public' or 'member'. Default member. */
  auth?: 'public' | 'member'
  /** Per-route CORS (http triggers only). Omitted = allow all origins. */
  cors?: ServerApiCors
  /** Set false to disable the wiring without deleting the action. */
  enabled?: boolean
  /** Debounce invocation by milliseconds */
  debounce?: number
  /** Throttle invocation by milliseconds */
  throttle?: number
}

/** One action declaration. */
export interface ActionDef<Ctx = ServerContext, Out = unknown> {
  config?: ActionConfig
  handler: (ctx: Ctx) => Out | Promise<Out>
}

export function defineServerAction<Ctx extends ServerContext = ServerContext>(def: ActionDef<Ctx>): ActionDef<Ctx> {
  return def
}

export function defineClientAction<Ctx extends ClientContext = ClientContext>(def: ActionDef<Ctx>): ActionDef<Ctx> {
  return def
}
