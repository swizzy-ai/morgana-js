/**
 * The shared base context — the clean subset both lanes agree on.
 *
 * Everything lane-specific is namespaced: server/edge concerns live on
 * `ctx.server`, UI concerns live on `ctx.ui`. The base keeps what is genuinely
 * shared across BOTH lanes (the spine): the action's contract-typed args,
 * vars, apps, the action runner, assets, AI ops, auth, logging — and the ONE
 * event system, `ctx.events`.
 *
 * ✗ There is no `ctx.server.events`, no `ctx.server.emit` and no
 *   `ctx.objects` anywhere. Do not re-add lane event surfaces or an objects
 *   creation API: events live only on `ctx.events` (publish/emit/subscribe),
 *   and object handles are read through `ctx.ui`.
 */

import type { ActionContract } from '../contracts'
import type { AppsHandle } from '../apps'
import type { ActionsHandle, AiHandle, AssetsHandle, AuthHandle, LogHandle } from './server'
import type { EventApi } from '../events'

/**
 * Shared vars handle. On the server this reads public + private vars
 * (morgana.config.ts); in the browser only public vars ever reach the page.
 */
export interface VarsHandle {
  get(key: string): unknown
  set(key: string, value: unknown): void
  getAll(): Record<string, unknown>
}

/** The base action context. `C` is the action's own Contract (defaults to the
 * untyped `ActionContract<unknown, unknown>`), so `ctx.args` is contract-typed
 * while `ctx.actions.run` is typed against the whole generated registry.
 */
export interface BaseContext<C extends ActionContract = ActionContract> {
  /** The action's own contract-typed input. */
  args: C['input']
  /** Shared vars — public + private on the server, public only in the browser. */
  vars: VarsHandle
  /** Apps — project-level app objects; pages attach by name. */
  apps: AppsHandle
  /** Calling other actions — contract-typed via the generated registry. */
  actions: ActionsHandle
  /** Assets — resolved, cache-busted URLs for bundled/remote assets. */
  assets: AssetsHandle
  /** AI ops — text and structured generation. */
  ai: AiHandle
  /**
   * Auth — a spine surface on BOTH lanes, one shape everywhere: the
   * authenticated user for this invocation, session lookup, role checks and
   * signIn/signUp/signOut. The lane decides only the transport (server: the
   * incoming request's session; browser: the page session). Optional —
   * projects without auth configured omit it.
   */
  auth?: AuthHandle
  log: LogHandle
  /**
   * ★ THE event system — the ONLY event surface on both lanes.
   *
   *   publish    → ctx.events.publish(channel, payload)   (channels)
   *   app events → ctx.events.emit(name, payload)          (AppEvents-typed)
   *   subscribe  → ctx.events.subscribe(event, scope, handler)
   *   channels   → ctx.events.channels (list/create/subscribe/attach)
   *
   * There is deliberately NO `ctx.server.events` and NO `ctx.server.emit`;
   * `ctx.ui.events` on the browser lane is the same object under its UI name.
   * Subscribe requests are themselves catchable bus events
   * (`channel:<name>:subscribe`); a server action grants or rejects them via
   * `ctx.events.grant(request)` / `ctx.events.reject(...)`.
   */
  events: EventApi
}