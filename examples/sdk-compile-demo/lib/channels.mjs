/**
 * Channels, locally.
 *
 * The deployed host gives each channel its own Durable Object with durable
 * history and a fan-out to every open subscriber. This is the same contract on
 * one Node process, so `ctx.events.publish`/`subscribe` mean the same thing in
 * development as they do deployed — and mean it for the *same reason*, which is
 * the point of a channel being a channel.
 *
 * What is deliberately the same as the cloud:
 *
 *   - a publish lands as `channel:<name>` on the wire, unwrapped to the payload
 *     the publisher sent, so a subscriber never has to know the transport;
 *   - history is capped, newest first, and survives a reconnect;
 *   - a subscribe opens one stream per channel and holds it until it is closed.
 *
 * What is necessarily different: this is a single process, so there is no
 * partitioning and no eviction. A channel here is a Set of sockets and an array
 * of history — the same two things the Durable Object holds, minus the
 * durability that a database provides.
 */
import { EventEmitter } from 'node:events'

/** Newest-first, capped — the same bound the worker's channel DO applies. */
const MAX_HISTORY = 100

/**
 * One channel: its scope, its recent history, and its live subscribers.
 *
 * `EventEmitter` rather than a hand-rolled Set so a listener that throws cannot
 * take down the publisher — a broken subscriber must not be able to stop a
 * message reaching everyone else, on any host.
 */
class Channel {
  constructor(name, scope = 'public') {
    this.name = name
    this.scope = scope
    this.history = []
    this.subscribers = new Set()
  }

  /** Record and fan out. Returns true when the message was accepted. */
  publish(payload) {
    this.history.unshift({ timestamp: Date.now(), payload })
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY

    // `channel:<name>` is the wire name, and it is what dispatch on the client
    // matches against — the same string the worker emits.
    //
    // The payload goes out exactly as it was published, with no envelope. That
    // is deliberate and it matches the deployed host: the worker's channel DO
    // emits `{ event, payload }` where `payload` is what the publisher sent.
    // Wrapping it again here made the local stream carry
    // `{ channel, payload: { channel, payload } }` while the cloud carried
    // `{ user, text }` — so a client written against one host read nothing on
    // the other.
    const chunk = `event: channel:${this.name}\ndata: ${JSON.stringify({
      event: `channel:${this.name}`,
      payload,
      timestamp: Date.now(),
    })}\n\n`
    for (const send of this.subscribers) {
      // A dead socket is dropped rather than allowed to raise on every future
      // publish: an aborted response is still in the set until someone writes.
      try {
        send(chunk)
      } catch {
        this.subscribers.delete(send)
      }
    }
    return true
  }

  /** How many subscribers currently hold this channel open. */
  get presence() {
    return this.subscribers.size
  }
}

/**
 * The project's channels.
 *
 * Created eagerly rather than per-project: the local host is one project.
 */
export class ChannelHub extends EventEmitter {
  constructor() {
    super()
    /** @type {Map<string, Channel>} */
    this.channels = new Map()
  }

  /** Get-or-create. A name is validated the way the worker validates it. */
  channel(name, scope = 'public') {
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(String(name ?? ''))) return null
    let c = this.channels.get(name)
    if (!c) {
      c = new Channel(name, scope)
      this.channels.set(name, c)
    }
    return c
  }

  list() {
    return [...this.channels.values()]
      .map((c) => ({ name: c.name, scope: c.scope, subscribers: c.presence }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  publish(name, payload) {
    const c = this.channel(name)
    if (!c) return false
    c.publish(payload)
    this.emit('published', { channel: name, payload })
    return true
  }

  history(name, limit) {
    const c = this.channels.get(name)
    if (!c) return []
    return limit && limit > 0 ? c.history.slice(0, limit) : c.history.slice()
  }

  /**
   * Open an SSE response for one channel.
   *
   * Writes the `connected` frame immediately, because a browser holding a
   * response with no body is indistinguishable from a hung request — and a
   * subscriber that cannot tell "open but quiet" from "not open yet" ends up
   * either timing out or retrying.
   */
  subscribe(name, req, res) {
    const c = this.channel(name)
    if (!c) return false
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('event: connected\ndata: {}\n\n')

    const send = (chunk) => res.write(chunk)
    c.subscribers.add(send)

    // Keepalive on the same interval the worker uses. Without it a proxy in
    // front of the host can close an idle stream and the client sees a drop
    // rather than a quiet channel.
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n')
      } catch {
        cleanup()
      }
    }, 15000)

    const cleanup = () => {
      clearInterval(keepAlive)
      c.subscribers.delete(send)
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
    res.on('error', cleanup)
    return true
  }

  /**
   * Close every stream. Used on shutdown so the process does not hang on an
   * open response.
   */
  closeAll() {
    for (const c of this.channels.values()) c.subscribers.clear()
  }
}