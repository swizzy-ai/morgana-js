/**
 * `ctx.objects` in the browser — the same proxies server code gets
 * (objects-api.ts), over HTTP for calls and one WebSocket per instance for
 * events. Every operation is checked against the object's `access` by the
 * host; the session cookie identifies the caller.
 */
import { makeObjectsApi, type ObjectsMeta, type ObjectsTransport, type Snapshot } from '../objects-api'

const base = (type: string, name?: string) =>
  `/api/objects/${encodeURIComponent(type)}${name === undefined ? '' : `/${encodeURIComponent(name)}`}`

async function json(res: Response): Promise<unknown> {
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: unknown; message?: string }
  if (!res.ok || body.success === false) {
    throw Object.assign(new Error(body.message ?? `object request failed (${res.status})`), { status: res.status })
  }
  return body.data
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

interface Live {
  ws: WebSocket | null
  listeners: Set<(event: string, data: unknown) => void>
  retry: number
  closed: boolean
}

const lives = new Map<string, Live>()

function connect(type: string, name: string, live: Live): void {
  if (live.closed || typeof WebSocket === 'undefined') return
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${proto}//${location.host}${base(type, name)}/live`)
  live.ws = ws
  ws.onmessage = (m) => {
    let msg: { event?: string; data?: unknown }
    try {
      msg = JSON.parse(String(m.data))
    } catch {
      return
    }
    if (msg.event === '__error') {
      // A refusal (401/403/404) will not change by retrying.
      live.closed = true
      console.error('[Morgana] object subscription refused:', msg.data)
      return
    }
    live.retry = 0
    for (const l of live.listeners) {
      try {
        l(String(msg.event), msg.data)
      } catch (e) {
        console.error(e)
      }
    }
  }
  ws.onclose = () => {
    live.ws = null
    if (live.closed || live.listeners.size === 0) return
    // Back off: 0.5s, 1s, 2s … capped at 15s.
    const delay = Math.min(15_000, 500 * 2 ** live.retry++)
    setTimeout(() => connect(type, name, live), delay)
  }
}

const transport: ObjectsTransport = {
  async create(type, name, init, ifMissing) {
    await json(ifMissing ? await post(`${base(type, name)}/get-or-create`, { init }) : await post(base(type), { name, init }))
  },
  async read(type, name) {
    const res = await fetch(base(type, name), { credentials: 'same-origin' })
    if (res.status === 404) return null
    return (await json(res)) as Snapshot
  },
  async call(type, name, method, params) {
    const data = (await json(await post(`${base(type, name)}/call/${encodeURIComponent(method)}`, { params }))) as { result: unknown }
    return data.result
  },
  async stream(type, name, method, params, onChunk) {
    const res = await post(`${base(type, name)}/call/${encodeURIComponent(method)}`, { params })
    if (!res.ok || !res.body) return json(res)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let final: unknown = null
    for (;;) {
      const { value, done } = await reader.read()
      if (value) buf += dec.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        const msg = JSON.parse(line) as { chunk?: unknown; result?: unknown; error?: string; status?: number }
        if ('chunk' in msg) onChunk(msg.chunk)
        else if ('error' in msg) throw Object.assign(new Error(msg.error), { status: msg.status ?? 500 })
        else if ('result' in msg) final = msg.result
      }
      if (done) break
    }
    return final
  },
  async list(type, opts) {
    const q = new URLSearchParams(Object.entries(opts).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    return (await json(await fetch(`${base(type)}?${q}`, { credentials: 'same-origin' }))) as { items: Array<{ name: string; createdAt: number }>; total: number }
  },
  async remove(type, name) {
    const data = (await json(await fetch(base(type, name), { method: 'DELETE', credentials: 'same-origin' }))) as { removed: boolean }
    return data.removed
  },
  subscribe(type, name, listener) {
    const k = `${type}\u0000${name}`
    let live = lives.get(k)
    if (!live) {
      live = { ws: null, listeners: new Set(), retry: 0, closed: false }
      lives.set(k, live)
    }
    live.listeners.add(listener)
    if (!live.ws) connect(type, name, live)
    return () => {
      live!.listeners.delete(listener)
      if (live!.listeners.size === 0) {
        live!.closed = true
        live!.ws?.close()
        lives.delete(k)
      }
    }
  },
}

/** For `object:<type>/<name>.<path>` bindings (client/state.ts). */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __morgana_watchObject?: unknown }).__morgana_watchObject = (
    type: string,
    name: string,
    cb: (state: Record<string, unknown>) => void,
  ) =>
    transport.subscribe!(type, name, (e, d) => {
      if (e === '__state') {
        const s = d as Snapshot
        cb({ ...s.state, ...s.computed })
      }
    })
}

let api: Record<string, unknown> | null = null

/** The page's ctx.objects (built once per page from the manifest). */
export function pageObjects(meta: ObjectsMeta | undefined): Record<string, unknown> {
  if (!api) api = makeObjectsApi(meta ?? {}, transport)
  return api
}
