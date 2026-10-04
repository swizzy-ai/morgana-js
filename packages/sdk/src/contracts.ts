/**
 * Action contracts and the generated registry globals.
 *
 * Actions stay plain functions (`export async function handle(ctx)`). Typing is
 * additive only: an action may export an optional `Contract` type, and the
 * registry generator (dev watcher / pre-deploy) reads those statically and
 * emits `.morgana/types/registry.d.ts`, which merges into the global
 * `ActionsRegistry` / `AppEvents` interfaces below. Actions without a Contract
 * appear through the fallback index signatures as `ActionContract<unknown,
 * unknown>` until typed — they still work everywhere.
 */

export interface ActionContract<Input = unknown, Output = unknown> {
  input: Input
  output: Output
}

declare global {
  // Fallback index signature + generated specific entries merge cleanly:
  // typed actions win, untyped actions stay callable as `unknown`.
  interface ActionsRegistry {}
  interface AppEvents {}
}

export type ActionName = (keyof ActionsRegistry & string) | string
export type AppEventName = (keyof AppEvents & string) | string

export type AppEventPayload<K extends AppEventName = AppEventName> = K extends keyof AppEvents
  ? AppEvents[K]
  : unknown

/** Input type of a registry action (unknown until a Contract is generated). */
export type ActionInput<K extends ActionName = ActionName> = K extends keyof ActionsRegistry
  ? ActionsRegistry[K] extends ActionContract
    ? ActionsRegistry[K]['input']
    : unknown
  : unknown

/** Output type of a registry action (unknown until a Contract is generated). */
export type ActionOutput<K extends ActionName = ActionName> = K extends keyof ActionsRegistry
  ? ActionsRegistry[K] extends ActionContract
    ? ActionsRegistry[K]['output']
    : unknown
  : unknown

/** Options for `ctx.actions.run` — streaming callbacks included. */
export interface RunOptions {
  /** Stream token callback (server actions that stream via SSE). */
  onToken?: (token: string) => void
  /** Ask the runtime for a streaming response where supported. */
  stream?: boolean
}

/** Milestone 6 — emit adapter for app events. */
export interface EmitAdapter {
  emit(name: string, payload?: unknown): void
}

/** Event scope predicate — payload field → literal value, captured at registration. */
export type EventScope = Record<string, unknown>
