/**
 * Lifecycle — page-load actions, backend calls from the browser,
 * and the console state hooks, all against the real client.js bundle.
 */
import { describe, expect, it } from 'vitest'
import { emptyManifest, makeClientJs } from './client-harness'

function install(state: Record<string, unknown>, page = 'home'): Record<string, unknown> {
  const listeners: Record<string, Array<(...args: never[]) => void>> = {}
  const win: Record<string, unknown> = {}
  const box: { current: Record<string, unknown> } = { current: state }
  const documentStub = {
    readyState: 'complete',
    body: { getAttribute: (k: string) => (k === 'data-page' ? page : null) },
    getElementById: (id: string) => {
      if (id === '__MORGANA_OBJECTS__') return { textContent: emptyManifest(page) }
      if (id !== '__MORGANA_STATE__') return null
      return {
        get textContent() {
          return JSON.stringify(box.current)
        },
        set textContent(v: string) {
          box.current = JSON.parse(v) as Record<string, unknown>
        },
      }
    },
    querySelectorAll: () => [] as unknown[],
    querySelector: () => null,
    addEventListener: (ev: string, fn: (...args: never[]) => void) => {
      ;(listeners[ev] ??= []).push(fn)
    },
  }
  ;(globalThis as Record<string, unknown>)['window'] = win
  ;(globalThis as Record<string, unknown>)['document'] = documentStub
  return win
}

function load(js: string, win: Record<string, unknown>): void {
  const run = new Function('window', 'document', `${js}\nreturn window;`) as (
    w: unknown,
    d: unknown,
  ) => Record<string, unknown>
  Object.assign(win, run(win, (globalThis as Record<string, unknown>)['document']))
}

function cleanup(): void {
  delete (globalThis as Record<string, unknown>)['window']
  delete (globalThis as Record<string, unknown>)['document']
  delete (globalThis as Record<string, unknown>)['fetch']
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('action lifecycle + event log', () => {
  it(
    'logs action:start/success around runs and exposes them via __morgana_log',
    async () => {
      const win = install({})
      try {
        load(
          await makeClientJs({
            ok: 'export const ok = (ctx) => ({ fine: true })',
          }),
          win,
        )
        await sleep(10)
        const run = win['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
        const result = await run('ok', {})
        expect(result).toEqual({ fine: true })
        const log = (win['__morgana_log'] as () => Array<{ lane: string; name: string; origin: string }>)()
        expect(log.map((e) => `${e.lane}:${e.name}:${e.origin}`)).toEqual([
          'page:loaded:home',
          'action:action:start:ok',
          'page:action:start:ok',
          'action:action:success:ok',
          'page:action:success:ok',
        ])
        const names = (win['__morgana_seenEvents'] as () => string[])()
        expect(names).toContain('action:start')
        expect(names).toContain('action:success')
      } finally {
        cleanup()
      }
    },
    30_000,
  )

  it(
    'logs action:error and reports it to /api/events/log best-effort',
    async () => {
      const win = install({})
      const posts: Array<{ url: string; body: unknown }> = []
      ;(globalThis as Record<string, unknown>)['fetch'] = async (url: string, init: { body?: string }) => {
        posts.push({ url, body: init?.body ? JSON.parse(init.body) : null })
        return { json: async () => ({}) }
      }
      try {
        load(
          await makeClientJs({
            boom: 'export const boom = () => { throw new Error("kaput") }',
          }),
          win,
        )
        await sleep(10)
        const run = win['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
        await expect(run('boom', {})).rejects.toThrow('kaput')
        const log = (win['__morgana_log'] as () => Array<{ name: string; error?: string }>)()
        const err = log.find((e) => e.name === 'action:error')
        expect(err?.error).toContain('kaput')
        expect(posts).toEqual([
          { url: '/api/events/log', body: { event: 'action:error', source: 'boom', error: 'kaput' } },
        ])
      } finally {
        cleanup()
      }
    },
    30_000,
  )
})

describe('page load', () => {
  it(
    'fires on:loaded actions with the page as origin',
    async () => {
      const win = install({}, 'landing')
      try {
        load(
          await makeClientJs(
            {
              boot: 'export const boot = (ctx) => { globalThis.calls.push(ctx.event.name + "@" + ctx.event.origin) }',
            },
            [{ event: 'loaded', action: 'boot' }],
          ),
          win,
        )
        ;(globalThis as Record<string, unknown>)['calls'] = []
        await sleep(20)
        // First paint already happened during load; the loaded binding fired it.
        expect((globalThis as Record<string, unknown>)['calls']).toEqual(['loaded@landing'])
      } finally {
        delete (globalThis as Record<string, unknown>)['calls']
        cleanup()
      }
    },
    30_000,
  )
})

describe('browser -> backend calls', () => {
  it(
    'ctx.actions.run POSTs :run and unwraps data.result into state',
    async () => {
      const win = install({})
      const seen: Array<{ url: string; body: unknown }> = []
      ;(globalThis as Record<string, unknown>)['fetch'] = async (url: string, init: { body?: string }) => {
        seen.push({ url, body: init?.body ? JSON.parse(init.body) : null })
        return { json: async () => ({ success: true, data: { result: { visitors: 7 } } }) }
      }
      try {
        load(
          await makeClientJs({
            pull: 'export const pull = async (ctx) => { const r = await ctx.actions.run("getStats", { a: 1 }); ctx.ui.state.set("got", r) }',
          }),
          win,
        )
        await sleep(10)
        const run = win['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
        await run('pull', {})
        expect(seen).toEqual([{ url: '/api/actions/getStats/run', body: { params: { a: 1 } } }])
        const state = (win['__morgana_state'] as () => Record<string, unknown>)()
        expect(state).toMatchObject({ got: { visitors: 7 } })
      } finally {
        cleanup()
      }
    },
    30_000,
  )
})

describe('console state hooks', () => {
  it(
    'exposes state/set/pages readers on window',
    async () => {
      const win = install({ cart: { open: false } })
      try {
        load(await makeClientJs({}), win)
        await sleep(10)
        const w = win as Record<string, (...args: never[]) => unknown>
        expect(typeof w['__morgana_state']).toBe('function')
        expect(typeof w['__morgana_set']).toBe('function')
        expect(typeof w['__morgana_pages']).toBe('function')
        ;(w['__morgana_set'] as (p: string, v: unknown) => void)('cart.open', true)
        expect((w['__morgana_state'] as () => Record<string, unknown>)()).toMatchObject({ cart: { open: true } })
      } finally {
        cleanup()
      }
    },
    30_000,
  )
})
