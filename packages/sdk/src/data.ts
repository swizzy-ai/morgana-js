/**
 * Data objects exposed to the SDK — channels and queues.
 *
 * These types mirror the engine's EventChannelObject and QueueObject but
 * live in the SDK for type-safe server action code.
 */

// ── Event Channel ──────────────────────────────────────────────────────────

export type ChannelScope = 'public' | 'private' | 'system'

/** Plain-data description of a channel (safe to return over the API). */
export interface ChannelInfo {
  name: string
  scope: ChannelScope
  subscribers: string[]
}

export type ChannelHandler = (event: string, payload?: any) => void

// ── Queue ──────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string
  instruction: string
  status: 'pending' | 'running' | 'done' | 'error' | 'closed'
  resultRef: string | null
  [key: string]: unknown
}

/**
 * A named work queue. Every method takes the queue name first, because a project
 * has as many queues as it has workflows and an unnamed handle would have to be
 * built per queue rather than read off the context.
 *
 * `pause` stops new items being accepted; it does not stop the ones already
 * queued, so a pause cannot lose work that was already committed. `clear` is the
 * destructive one and returns how many it removed.
 */
export interface QueueHandle {
  /** Push a new item. Returns the created record, or null on failure. */
  push(
    queueName: string,
    instruction: string,
    meta?: Record<string, unknown>,
  ): Promise<QueueItem | null>
  /** List a queue's items, newest last. Filter by status or cap the count. */
  list(queueName: string, opts?: { status?: string; limit?: number }): Promise<QueueItem[]>
  /** Mark an item as closed (skip). */
  close(queueName: string, id: string): Promise<void>
  /** Mark an item as done, recording the result. */
  complete(queueName: string, id: string, result?: unknown): Promise<void>
  /** Mark an item as failed, recording why. */
  fail(queueName: string, id: string, error: string): Promise<void>
  /** Stop accepting new items. Items already queued are untouched. */
  pause(queueName: string): Promise<void>
  /** Accept items again. */
  resume(queueName: string): Promise<void>
  /**
   * Remove items from a queue — every one, or only those in a given status.
   * Returns how many were removed. The only destructive method here.
   */
  clear(queueName: string, opts?: { status?: string }): Promise<number>
}
