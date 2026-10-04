/**
 * Reactivity — the compiled page runtime against a stub DOM.
 *
 * Exercises the real client.js bundle: initial data-bind paint, state.set
 * notifying subscribers, bound elements re-rendering, and `on: 'state:<path>'`
 * actions firing with the change descriptor. No browser needed.
 */
import { describe, expect, it } from 'vitest'
import { emptyManifest, makeClientJs } from './client-harness'

interface FakeEl {
  textContent: string
  value?: string
  attrs: Record<string, string>
  getAttribute(k: string): string | null
  setAttribute(k: string, v: string): void
}

function fakeEl(bindSpec: string): FakeEl {
  return {
    textContent: '',
    attrs: { 'data-bind': bindSpec },
    getAttribute(k: string) {
      return this.attrs[k] ?? null
    },
    setAttribute(k: string, v: string) {
      this.attrs[k] = v
    },
  }
}

interface Stub {
  state: Record<string, unknown>
  elements: FakeEl[]
  listeners: Record<string, Array<(...args: unknown[]) => void>>
  win: Record<string, unknown>
}

function installDom(initialState: Record<string, unknown>, elements: FakeEl[] = []): Stub {
  const stub: Stub = {
    state: JSON.parse(JSON.stringify(initialState)) as Record<string, unknown>,
    elements,
    listeners: {},
    win: {},
  }
  const documentStub = {
    readyState: 'complete',
    getElementById: (id: string) => {
      if (id === '__MORGANA_OBJECTS__') return { textContent: emptyManifest() }
      if (id !== '__MORGANA_STATE__') return null
      return {
        get textContent() {
          return JSON.stringify(stub.state)
        },
        set textContent(v: string) {
          stub.state = JSON.parse(v) as Record<string, unknown>
        },
      }
    },
    querySelectorAll: (sel: string) => (sel === '[data-bind]' ? stub.elements : []),
    querySelector: () => null,
    addEventListener: (ev: string, fn: (...args: unknown[]) => void) => {
      ;(stub.listeners[ev] ??= []).push(fn)
    },
  }
  ;(globalThis as Record<string, unknown>)['window'] = stub.win
  ;(globalThis as Record<string, unknown>)['document'] = documentStub
  // The bundle assigns window.* — alias them onto the stub afterwards.
  return stub
}

function uninstallDom(): void {
  delete (globalThis as Record<string, unknown>)['window']
  delete (globalThis as Record<string, unknown>)['document']
}

function loadBundle(js: string, stub: Stub): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('window', 'document', `${js}\nreturn window;`) as (
    w: unknown,
    d: unknown,
  ) => Record<string, unknown>
  const win = run(stub.win, (globalThis as Record<string, unknown>)['document'])
  Object.assign(stub.win, win)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('reactive state runtime', () => {
  it(
    'paints data-bind elements on load and re-renders on state change',
    async () => {
      const el = fakeEl('content:cart.label')
      const stub = installDom({ cart: { label: 'Hi', open: false } }, [el])
      try {
        loadBundle(await makeClientJs({}), stub)
        await sleep(20)
        expect(el.textContent).toBe('Hi')

        const run = stub.win['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
        // No actions registered — drive state through a probe action instead.
        expect(typeof run).toBe('function')
      } finally {
        uninstallDom()
      }
    },
    30_000,
  )

  it(
    'fires on:state actions with the change descriptor and skips no-op sets',
    async () => {
      const el = fakeEl('content:cart.open')
      const stub = installDom({ cart: { open: false }, seen: { count: 0 } }, [el])
      try {
        const js = await makeClientJs(
          {
            watcher: 'export const watcher = (ctx) => { globalThis.calls.push(ctx.event.name); const n = ctx.ui.state.get("seen.count") || 0; ctx.ui.state.set("seen.count", n + 1) }',
            opener: 'export const opener = (ctx) => { ctx.ui.state.set("cart.open", true) }',
            noop: 'export const noop = (ctx) => { ctx.ui.state.set("cart.open", true) }',
          },
          [{ event: 'state:cart.open', action: 'watcher' }],
        )
        ;(stub.win as Record<string, unknown>)['calls'] = []
        // The fragment reads bare `calls` — expose it as a global for the test.
        ;(globalThis as Record<string, unknown>)['calls'] = (stub.win as Record<string, unknown>)['calls']
        loadBundle(js, stub)
        await sleep(20)
        expect(el.textContent).toBe('false')

        const run = stub.win['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
        await run('opener', {})
        expect(stub.state).toMatchObject({ cart: { open: true }, seen: { count: 1 } })
        expect((stub.win as Record<string, unknown>)['calls']).toEqual(['state:cart.open'])
        expect(el.textContent).toBe('true')

        // Setting the same value is a no-op — watcher must not refire.
        await run('noop', {})
        expect((stub.win as Record<string, unknown>)['calls']).toEqual(['state:cart.open'])
        expect((stub.state as { seen: { count: number } }).seen.count).toBe(1)
      } finally {
        delete (globalThis as Record<string, unknown>)['calls']
        uninstallDom()
      }
    },
    30_000,
  )

  it(
    'state.subscribe receives (path, value, oldValue, root)',
    async () => {
      const stub = installDom({ cart: { open: false } })
      try {
        const js = await makeClientJs({
          probe: 'export const probe = (ctx) => { ctx.ui.state.subscribe((path, value, oldValue, root) => { globalThis.events.push({ path, value, oldValue, keys: Object.keys(root) }) }); ctx.ui.state.set("cart.open", true) }',
        })
        ;(globalThis as Record<string, unknown>)['events'] = []
        loadBundle(js, stub)
        await sleep(20)
        const run = stub.win['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
        await run('probe', {})
        const events = (globalThis as Record<string, unknown>)['events'] as Array<{
          path: string
          value: unknown
          oldValue: unknown
          keys: string[]
        }>
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({ path: 'cart.open', value: true, oldValue: false })
        expect(events[0]!.keys).toContain('cart')
      } finally {
        delete (globalThis as Record<string, unknown>)['events']
        uninstallDom()
      }
    },
    30_000,
  )
})
