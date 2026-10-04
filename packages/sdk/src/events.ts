/**
 * The built-in event catalog — typed constants for `when` and subscriptions
 * (FRAMEWORK.md §7).
 *
 * Three lanes, each with its own management surface:
 *
 *   1. Frontend (browser bus only) — interaction events on the page. Wire them
 *      declaratively via `obj.when('clicked', …)` / `ctx.ui.when`, track them
 *      as shareable sources via `obj.track` / `ctx.ui.track`, or listen to app
 *      events imperatively via `ctx.ui.events.on`.
 *
 *   2. Backend (server bus) — store frames and system events. Manage them on the
 *      unified `ctx.events` (publish/emit/subscribe/channels) and `config.hooks`
 *      (`on: 'store.<name>.record.created'`, `'cron(every 1h)'`, `'http.get /path'`).
 *      There is NO `ctx.server.events` and NO `ctx.server.emit` — `ctx.events`
 *      is the only event surface on both lanes.
 *
 *   3. App events (`ctx.server.emit`, `ctx.ui.events.emit`) — merge in via the
 *      global `AppEvents` interface.
 *
 * Backend events are forwarded to the browser via SSE; the frontend subscribes
 * with `ctx.ui.events.subscribe(event, scope, handler)`, which returns an
 * unsubscribe.
 */

import type { AppEventName, EventScope } from './contracts'
import type { ChannelInfo } from './data'
import type { ElementTrackableEvent, BackendTrackableEvent } from './trackables'

/** Frontend interaction lane — wired via `obj.when(...)` or `data-bind`. */
export const INTERACTION_EVENTS = [
  'clicked',
  'changed',
  'submitted',
  'loaded',
  'entered',
  'exited',
  'selected',
  'picked',
  'collided',
] as const
export type InteractionEvent = (typeof INTERACTION_EVENTS)[number]

/** Frontend event catalog — everything the browser bus carries itself. */
export const FRONTEND_EVENTS = INTERACTION_EVENTS

/** Data lane — store frames (server-scoped). Manage via `ctx.server.events`. */
export type StoreFrameEvent = `store:${string}:${'created' | 'updated' | 'deleted'}`
export type DataEvent = StoreFrameEvent | 'store:changed'

/** System lane — wired in the server config (events/schedules). */
export const SYSTEM_EVENTS = ['deploy', 'action:start', 'action:success', 'action:error', 'cron'] as const
export type SystemEvent = (typeof SYSTEM_EVENTS)[number]

/** Backend event catalog — store + system frames on the server bus. */
export const BACKEND_EVENTS = ['store:changed', ...SYSTEM_EVENTS] as const

/**
 * Any valid event: built-ins, trackable handle events, and typed app events autocomplete;
 * unknown strings remain valid for custom app events not yet in the registry.
 */
export type EventName =
  | InteractionEvent
  | DataEvent
  | SystemEvent
  | ElementTrackableEvent
  | BackendTrackableEvent
  | AppEventName
  | (string & {})

// ─────────────────────────────────────────────────────────────────────────────
// The unified event surface — ONE event system, both lanes (`ctx.events`).
//
// Events are a singular thing: the same object shape on the frontend and the
// backend. Interaction events stay local (object-tied, page bus); channels,
// store frames and system events are bus events that exist on both sides and
// cross the bridge. What gates the crossing is the grant: the frontend can
// *request* a subscription, only the backend event system can *grant* it —
// either a default ACL on the channel or a server action that catches the
// subscribe request (`on: 'channel:<name>:subscribe'`).
// ─────────────────────────────────────────────────────────────────────────────

/** One event frame as delivered over the wire (SSE) or the bus. */
export interface EventFrame {
  /** Stream the frame belongs to — e.g. `channel:ops` or `store:notes`. */
  stream: string
  /** The bus event name — e.g. `store:notes:created` or `channel:ops`. */
  event: string
  /** Store-frame op when applicable: 'created' | 'updated' | 'deleted'. */
  op?: string
  data?: unknown
  timestamp?: number
  /** Trace id echoed from the invoking action, for cross-lane correlation. */
  traceId?: string
}

/** Options for the unified `subscribe` — plain scopes stay, plus a frame callback. */
export interface EventSubscribeOptions {
  /** Receive raw frames as they arrive over the transport (SSE). */
  onFrame?: (frame: EventFrame) => void
}

/** A subscribe request that reached the backend bus (e.g. `channel:ops:subscribe`). */
export interface EventGrantRequest {
  /** The requested event/stream selector. */
  event: string
  /** Parsed channel name when the request is channel-scoped. */
  channel?: string
  /** Scope/filters the subscriber asked for. */
  scope?: EventScope
  /** The requesting session (from the SSE/control transport). */
  session?: string
}

/** The result of granting — an opaque ticket the frontend presents on attach. */
export interface EventGrant {
  /** Canonical stream name the grant covers — e.g. `channel:ops`. */
  stream: string
  /** Opaque bearer ticket, bound to the requesting session server-side. */
  ticket: string
}

/**
 * Who may open a channel — not declared here, on purpose.
 *
 * There is no `acl: 'member' | 'admin'` field, because every real permission
 * model needs a variant this framework would then have to anticipate: a private
 * room with an audience, a conversation between two people, a team at a level.
 * Instead a channel carries either an explicit `members` list or the name of a
 * deployed action to ask, and the answer is code.
 */
export interface ChannelCreateOptions {
  /** An explicit audience. Those users, and nobody else. */
  members?: string[]
  /** Omitted = `'public'`. */
  scope?: 'public' | 'private' | 'system'
  description?: string
  /**
   * The function that decides whether a caller may open this channel.
   *
   * The function receives an ordinary action context — `ctx.auth.user` is the
   * person subscribing — and answers `{ ok: boolean, reason?: string }`, or a
   * bare boolean. It is captured into a deployed action, so it must be
   * self-contained: it cannot read anything from the module it was written in.
   *
   * Declared here, at the channel, because that is where the channel is
   * declared — one call says what the channel is and who may open it, so a
   * reader cannot find a room without also finding its rule.
   *
   * Replaces any `members` list, since the two answer the same question and only
   * one of them can be right.
   */
  permissions?: ChannelPermissionCheck
}

/**
 * Channel surface shared by both lanes. The server implements list/create/
 * subscribe/unsubscribe against the world bus; the browser implements
 * attach/detach against its SSE transport (tickets presented here).
 */
export interface EventChannelsSurface {
  list?(): ChannelInfo[]
  /**
   * Create (or re-declare) a channel.
   *
   * In a compile action this is the declaration. At runtime it still creates the
   * channel if it does not exist, which is what lets a channel be published to
   * before anything subscribes. The second argument is still accepted as a bare
   * scope string.
   */
  create?(
    name: string,
    opts?: ChannelCreateOptions | 'public' | 'private' | 'system',
  ): ChannelInfo
  /**
   * Add an audience member at runtime.
   */
  addMember?(name: string, userId: string): Promise<ChannelInfo> | ChannelInfo
  /** Remove an audience member at runtime. */
  removeMember?(name: string, userId: string): Promise<ChannelInfo> | ChannelInfo
  /** The current audience, or null when the channel's rule is not a member list. */
  members?(name: string): Promise<string[] | null> | string[] | null
  subscribe?(name: string, handler: (event: string, payload?: any) => void): () => void
  unsubscribe?(name: string, handler: (event: string, payload?: any) => void): boolean
  /** Present a ticket from a grant and start receiving frames for the stream. */
  attach?(
    stream: string,
    ticket: string,
    opts?: { onFrame?: (frame: EventFrame) => void }
  ): () => void
  /** Drop a previously attached stream. */
  detach?(ticket: string): void
}

/** What a permission function may answer. */
export type ChannelVerdict = boolean | { ok: boolean; reason?: string }

/**
 * The access check for one channel.
 *
 * Typed loosely on the context because the point is that it is an *action*
 * context: the same one every server action receives. Declaring it here as
 * `ClientContext | ServerContext` would pick one lane and be wrong on the other.
 */
export type ChannelPermissionCheck = (ctx: any) => ChannelVerdict | Promise<ChannelVerdict>

/**
 * The singular event API — `ctx.events` on both lanes. The same shape means
 * user code reads the same on the frontend and the backend; the lane only
 * decides transport. `grant`/`reject` exist server-side only (the frontend
 * can never grant — that is the whole permission model).
 */
export interface EventApi {
  /** Listen on the lane's own bus (local events; world bus on the server). */
  on(event: string, handler: (payload?: any, event?: string) => void): () => void
  /** Remove a listener added with `on` (by exact handler). */
  off?(event: string, handler: (...args: any[]) => void): void
  /** Emit on the lane's own bus. App events merge in via the global `AppEvents`. */
  emit(event: string, payload?: any): void
  /**
   * Unified subscribe. Local selectors (interaction events) stay on the page
   * bus; bus events (`channel:*`, store frames, system) cross the bridge as a
   * subscribe request — granted by a server action or the channel's ACL, or
   * rejected. Frames arrive via `opts.onFrame` (or the plain handler).
   */
  subscribe(
    event: string,
    scope?: EventScope | EventSubscribeOptions,
    handler?: (payload: any, event?: string) => void
  ): () => void
  /** Publish to a named channel — lands on the bus as `channel:<name>`. */
  publish(channel: string, payload?: any): void | Promise<void>
  /**
   * Alias for `events.channels` — the same object under a shorter name.
   *
   * Channels are reached constantly (create, subscribe, attach) and
   * `ctx.events.channels.create(…)` reads like the channel belongs to the event
   * system rather than to the project. Both names point at one surface so they
   * cannot drift apart.
   */
  channels: EventChannelsSurface
  /** Server lane only — grant a subscribe request caught by an action. */
  grant?(request: EventGrantRequest): EventGrant | Promise<EventGrant>
  /** Server lane only — reject one, with an optional reason. */
  reject?(request: EventGrantRequest, reason?: string): void
}
