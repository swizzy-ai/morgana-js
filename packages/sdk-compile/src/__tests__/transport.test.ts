/**
 * The bus transport: a channel has to cross the network.
 *
 * The gap this locks in: `ctx.events.subscribe('channel:lobby')` used to
 * register on the page's in-memory bus. Two tabs were two buses, so a channel
 * was a name only its own tab could hear. Everything compiled, the deploy
 * succeeded, and the second user saw nothing — the failure mode being a feature
 * that looks like it works.
 *
 * `fetch` is stubbed rather than mocked with assertions, so the code under test
 * is the code that ships: refcounting, `text/event-stream` parsing, buffering a
 * frame that arrives split across two chunks, reconnection, and unsubscribe
 * actually releasing the stream. A mock that only recorded calls would pass
 * even if the reader never parsed a single frame.
 */
import { describe, expect, it } from 'vitest'
import { makeClientJs } from './client-harness'

/** The metas `servePage` injects into a deployed page. */
const METAS: Record<string, string> = {
  'morgana-runtime-key': 'test-key',
  'morgana-project': 'demo',
  'morgana-env': 'production',
}

/** One open stream the harness can drive. */
interface Stream {
  url: string
  headers: Record<string, string>
  /** Push raw `text/event-stream` bytes, as a server chunk would. */
  push(chunk: string): void
  /** End the stream cleanly, as a server restart would. */
  end(): void
  closed: boolean
}

interface Harness {
  win: Record<string, any>
  streams: Stream[]
  removed: string[]
  state: Record<string, unknown>
  live(): Stream[]
  /** The response status the next request answers with. */
  status: number
  teardown(): void
}

function install(): Harness {
  const streams: Stream[] = []
  const removed: string[] = []
  const state: Record<string, unknown> = {}
  const h: Harness = {
    win: {} as Record<string, any>,
    streams,
    removed,
    state,
    status: 200,
    live: () => streams.filter((s) => !s.closed),
    teardown: () => {},
  }

  // A `ReadableStream` whose chunks the test controls. Deliberately not
  // auto-completing: the transport only reopens when a stream ends, so the test
  // decides when that happens.
  const makeStream = (url: string, headers: Record<string, string>): Stream => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const enc = new TextEncoder()
    const rec: Stream = {
      url,
      headers,
      closed: false,
      push(chunk: string) {
        if (!rec.closed) controller.enqueue(enc.encode(chunk))
      },
      end() {
        if (!rec.closed) {
          rec.closed = true
          controller.close()
        }
      },
    }
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
    })
    // Attach the body lazily so the test does not have to thread it around.
    ;(rec as unknown as { body: ReadableStream<Uint8Array> }).body = body
    return rec
  }

  const fetchStub = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
    const rec = makeStream(String(url), init?.headers ?? {})
    streams.push(rec)
    const signal = init?.signal
    if (signal) {
      signal.addEventListener('abort', () => {
        rec.closed = true
        removed.push(rec.url)
      })
    }
    return Promise.resolve({
      ok: h.status >= 200 && h.status < 300,
      status: h.status,
      body: (rec as unknown as { body: ReadableStream<Uint8Array> }).body,
    } as unknown as Response)
  }

  const documentStub = {
    querySelector: (sel: string) => {
      const m = /name="([^"]+)"/.exec(sel)
      const value = m ? METAS[m[1]!] : undefined
      return value === undefined ? null : { getAttribute: () => value }
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id: string) =>
      id === '__MORGANA_STATE__'
        ? {
            get textContent() {
              return JSON.stringify(state)
            },
            set textContent(v: string) {
              for (const k of Object.keys(state)) delete state[k]
              Object.assign(state, JSON.parse(v))
            },
          }
        : null,
    createElement: () => ({ set textContent(_v: string) {}, appendChild() {}, setAttribute() {} }),
    body: { getAttribute: () => 'home' },
    documentElement: { getAttribute: () => 'home' },
  }

  const g = globalThis as Record<string, unknown>
  // The bundle is a bare IIFE, so a bare `setTimeout` inside it resolves on the
  // *global*. Stubbing only `win.setTimeout` leaves real timers running and the
  // reconnect assertion simply observes state before the retry has fired.
  const realSetTimeout = g['setTimeout']
  const realClearTimeout = g['clearTimeout']
  const runNow = (fn: () => void) => {
    fn()
    return 0
  }
  g['setTimeout'] = runNow
  g['clearTimeout'] = () => {}

  const win: Record<string, any> = {
    fetch: fetchStub,
    document: documentStub,
    location: { assign: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: runNow,
    clearTimeout: () => {},
    AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
    TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : undefined,
    console: { log: () => {}, error: () => {}, warn: () => {} },
  }
  g['window'] = win
  g['document'] = documentStub
  g['fetch'] = fetchStub

  h.win = win
  h.teardown = () => {
    g['setTimeout'] = realSetTimeout
    g['clearTimeout'] = realClearTimeout
    delete g['window']
    delete g['document']
    delete g['fetch']
  }
  return h
}

/** Let queued microtasks drain so a `.then()` chain has run. */
const settle = () => new Promise((r) => setImmediate(r))

async function boot(): Promise<{ t: Record<string, any>; h: Harness }> {
  const clientJs = await makeClientJs({}, [])
  const h = install()
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', `${clientJs}\n`)(h.win, h.win.document)
  return { t: h.win.__morgana_events as Record<string, any>, h }
}

/** Format one SSE event the way the worker does. */
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

describe('subscribing to a channel crosses the network', () => {
  it('opens a channel-scoped stream naming the page’s own project', async () => {
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    expect(h.streams).toHaveLength(1)
    // Without these the call resolves against the default project, which is how
    // a page ends up talking to the wrong one.
    expect(h.streams[0]!.url).toContain('channel=lobby')
    expect(h.streams[0]!.url).toContain('projectId=demo')
    expect(h.streams[0]!.url).toContain('env=production')
    h.teardown()
  })

  it('sends the runtime key as a header, never in the query string', async () => {
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    // `EventSource` cannot do this, which is why the transport uses fetch. A key
    // in the query string would land in access logs and Referer headers.
    expect(h.streams[0]!.headers['x-morgana-runtime']).toBe('test-key')
    expect(h.streams[0]!.url).not.toContain('test-key')
    expect(h.streams[0]!.headers['Accept']).toBe('text/event-stream')
    h.teardown()
  })

  it('delivers a frame to the subscriber, unwrapped to what was published', async () => {
    const { t, h } = await boot()
    const got: unknown[] = []
    t.subscribe('channel:lobby', null, (p: unknown) => got.push(p))
    await settle()
    h.streams[0]!.push(
      frame('channel:lobby', {
        event: 'channel:lobby',
        // The worker wraps a published payload as { channel, payload }. A
        // subscriber handed the wrapper would need to know the transport to read
        // a message, which is the opposite of the point.
        payload: { channel: 'lobby', payload: { user: 'ada', text: 'hi' } },
      }),
    )
    await settle()
    expect(got).toEqual([{ user: 'ada', text: 'hi' }])
    h.teardown()
  })

  it('buffers a frame that arrives split across two chunks', async () => {
    const { t, h } = await boot()
    const got: unknown[] = []
    t.subscribe('channel:lobby', null, (p: unknown) => got.push(p))
    await settle()
    const whole = frame('channel:lobby', { event: 'channel:lobby', payload: { text: 'split me' } })
    const cut = Math.floor(whole.length / 2)
    // A real SSE stream splits wherever the network feels like it. Consuming a
    // partial chunk as if it were a whole event is how messages get dropped.
    h.streams[0]!.push(whole.slice(0, cut))
    await settle()
    expect(got).toEqual([])
    h.streams[0]!.push(whole.slice(cut))
    await settle()
    expect(got).toEqual([{ text: 'split me' }])
    h.teardown()
  })

  it('dispatches the frame onto the page bus too, so existing handlers receive it', async () => {
    // This is what keeps the change additive: a page already calling
    // `ctx.ui.events.on('channel:lobby', …)` starts receiving channel traffic
    // without being rewritten.
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    h.streams[0]!.push(frame('channel:lobby', { event: 'channel:lobby', payload: { text: 'yo' } }))
    await settle()
    const log = h.win.__morgana_log() as Array<{ lane: string; name: string }>
    expect(log.some((e) => e.lane === 'channel' && e.name === 'channel:lobby')).toBe(true)
    h.teardown()
  })

  it('ignores keepalive comments', async () => {
    const { t, h } = await boot()
    const got: unknown[] = []
    t.subscribe('channel:lobby', null, (p: unknown) => got.push(p))
    await settle()
    // The worker emits these every 15s to hold the connection open. Parsed as
    // events they would be junk frames delivered to every subscriber.
    h.streams[0]!.push(': keepalive\n\n')
    await settle()
    expect(got).toEqual([])
    h.teardown()
  })
})

describe('connections are refcounted', () => {
  it('three subscribers to one channel share a single stream', async () => {
    const { t, h } = await boot()
    const offs = [
      t.subscribe('channel:lobby', null, () => {}),
      t.subscribe('channel:lobby', null, () => {}),
      t.subscribe('channel:lobby', null, () => {}),
    ]
    await settle()
    // One per channel, not one per subscription. A page with a component per
    // conversation would otherwise exhaust the browser's per-host connection
    // limit and go deaf while every request still returned 200.
    expect(h.streams).toHaveLength(1)
    offs.forEach((off) => off())
    h.teardown()
  })

  it('unsubscribing the last handler closes the stream', async () => {
    const { t, h } = await boot()
    const off = t.subscribe('channel:lobby', null, () => {})
    await settle()
    expect(h.removed).toHaveLength(0)
    off()
    await settle()
    expect(h.removed).toHaveLength(1)
    expect(h.removed[0]).toContain('channel=lobby')
    h.teardown()
  })

  it('unsubscribing one of several keeps the stream open', async () => {
    const { t, h } = await boot()
    const a = t.subscribe('channel:lobby', null, () => {})
    const b = t.subscribe('channel:lobby', null, () => {})
    await settle()
    a()
    await settle()
    expect(h.removed).toHaveLength(0)
    b()
    await settle()
    expect(h.removed).toHaveLength(1)
    h.teardown()
  })

  it('separate channels get separate streams', async () => {
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    t.subscribe('channel:support', null, () => {})
    await settle()
    expect(h.streams).toHaveLength(2)
    h.teardown()
  })

  it('unsubscribing twice does not over-decrement and kill a live stream', async () => {
    const { t, h } = await boot()
    const off = t.subscribe('channel:lobby', null, () => {})
    const off2 = t.subscribe('channel:lobby', null, () => {})
    await settle()
    off()
    off()
    await settle()
    // Without the released-flag guard the second call would drop the count below
    // zero and close a stream another subscriber is still using.
    expect(h.removed).toHaveLength(0)
    off2()
    await settle()
    expect(h.removed).toHaveLength(1)
    h.teardown()
  })
})

describe('non-channel events stay on the page', () => {
  it('a plain page event opens no stream', async () => {
    const { t, h } = await boot()
    t.subscribe('clicked', null, () => {})
    await settle()
    // Routing a click handler through the network would make every click depend
    // on a server round trip.
    expect(h.streams).toHaveLength(0)
    h.teardown()
  })
})

describe('a refused stream is not retried', () => {
  it('a 401 stops reconnecting instead of hammering the server', async () => {
    const { t, h } = await boot()
    h.status = 401
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    expect(h.streams).toHaveLength(1)
    h.streams[0]!.end()
    await settle()
    // A stale page — one held open across a key rotation — gets a permanent
    // refusal. Retrying it looks identical to a network blip to the client, so
    // without reading the status this becomes an infinite loop against a server
    // that will never accept it.
    expect(h.streams).toHaveLength(1)
    h.teardown()
  })
})

describe('a dropped stream reconnects', () => {
  it('reopens after the server ends the stream', async () => {
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    expect(h.streams).toHaveLength(1)
    h.streams[0]!.end()
    await settle()
    expect(h.streams).toHaveLength(2)
    expect(h.streams[1]!.url).toContain('channel=lobby')
    h.teardown()
  })

  it('stops retrying once the schedule is exhausted', async () => {
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    // One end per reconnect, with no frame ever arriving — so the backoff never
    // resets. A channel that is permanently gone must stop consuming the
    // connection budget instead of opening one stream per 500ms forever.
    for (let i = 0; i < 10; i++) {
      h.streams[h.streams.length - 1]?.end()
      await settle()
    }
    expect(h.streams.length).toBeLessThanOrEqual(6)
    h.teardown()
  })

  it('resets the backoff after a frame proves the stream worked', async () => {
    const { t, h } = await boot()
    t.subscribe('channel:lobby', null, () => {})
    await settle()
    // Five drops would exhaust the schedule, so the counter must be climbing.
    for (let i = 0; i < 4; i++) {
      h.streams[h.streams.length - 1]?.end()
      await settle()
    }
    // A frame arrives on the current stream: the transport is working again.
    h.streams[h.streams.length - 1]!.push(frame('channel:lobby', { event: 'channel:lobby', payload: { text: 'ok' } }))
    await settle()
    const before = h.streams.length
    // …so several more drops are survivable, which they would not be had the
    // counter reset on connect instead of on traffic.
    for (let i = 0; i < 4; i++) {
      h.streams[h.streams.length - 1]?.end()
      await settle()
    }
    expect(h.streams.length).toBe(before + 4)
    h.teardown()
  })

  it('does not reconnect after every subscriber has gone', async () => {
    const { t, h } = await boot()
    const off = t.subscribe('channel:lobby', null, () => {})
    await settle()
    off()
    await settle()
    const before = h.streams.length
    h.streams[0]!.end()
    await settle()
    // A reconnect with nobody listening is a connection nobody asked for.
    expect(h.streams.length).toBe(before)
    h.teardown()
  })
})

describe('attach() binds a granted stream into state', () => {
  it('appends a created frame and sets anything else', async () => {
    const { t, h } = await boot()
    const detach = t.attach('channel:lobby', 'ticket-1', { into: 'messages' })
    await settle()
    // A `created` frame appends, so the list grows rather than being replaced —
    // which is the whole reason `into` distinguishes the two.
    h.streams[0]!.push(frame('channel:lobby', { event: 'channel:lobby', payload: { __op: 'created', text: 'one' } }))
    await settle()
    expect(h.state.messages).toEqual([{ __op: 'created', text: 'one' }])
    h.streams[0]!.push(frame('channel:lobby', { event: 'channel:lobby', payload: { __op: 'created', text: 'two' } }))
    await settle()
    expect(h.state.messages).toHaveLength(2)
    // Anything without an op is a whole-value update.
    h.streams[0]!.push(frame('channel:lobby', { event: 'channel:lobby', payload: { text: 'latest' } }))
    await settle()
    expect(h.state.messages).toEqual({ text: 'latest' })
    detach()
    await settle()
    expect(h.removed.filter((u) => u.includes('lobby'))).toHaveLength(1)
    h.teardown()
  })

  it('delivers raw frames to onFrame', async () => {
    const { t, h } = await boot()
    const seen: unknown[] = []
    t.attach('channel:lobby', 'ticket-2', { onFrame: (f: unknown) => seen.push(f) })
    await settle()
    h.streams[0]!.push(frame('channel:lobby', { event: 'channel:lobby', payload: { text: 'raw' } }))
    await settle()
    expect(seen).toEqual([{ stream: 'channel:lobby', event: 'channel:lobby', data: { text: 'raw' }, timestamp: expect.any(Number) }])
    h.teardown()
  })

  it('requires a stream name', async () => {
    const { t, h } = await boot()
    expect(() => t.attach('', 'ticket', {})).toThrow(/stream name/)
    h.teardown()
  })
})