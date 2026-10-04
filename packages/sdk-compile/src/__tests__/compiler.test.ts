import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { scanProject } from '../extract'
import { deriveRoutes, isFrontendEvent, EMITTABLE } from '../routes'
import { buildBindingGraph, type BindingGraph } from '../bindings'
import { compileProject } from '../index'

function write(p: string, content: string): void {
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, content, 'utf8')
}

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sdk-compile-'))
  write(
    path.join(dir, 'morgana.config.ts'),
    [
      "import { defineConfig } from '@morgana/sdk'",
      '',
      'export default defineConfig({',
      "  name: 'demo',",
      '  apps: { main: { displayName: "Main" } },',
      '  hooks: [',
      "    { on: 'compile', run: 'seed' },",
      "    { on: 'http.get /hello', run: 'hello', auth: 'public' },",
      "    { on: 'cron(* * * * *)', run: 'tick' },",
      "    { on: 'store.orders.created', run: 'onOrder' },",
      '  ],',
      '})',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'compile', 'seed.ts'),
    [
      "import { defineClientAction } from '@morgana/sdk'",
      '',
      'export const seed = defineClientAction({',
      "  config: { on: 'compile' },",
      '  handler: (ctx) => {',
      '    const page = ctx.ui.pages.create({ name: "home", address: "/" })',
      '    const hero = ctx.ui.box({ id: "hero" })',
      '    hero.make("card")',
      '    hero.setProps({ layout: "column", pad: 6, gap: 3 })',
      '    const title = ctx.ui.text({ id: "title", content: "Hello" })',
      '    const cta = ctx.ui.button({ id: "cta", label: "Buy" })',
      '    hero.place(title)',
      '    hero.place(cta)',
      '    page.place(hero)',
      '    ctx.ui.breakpoints.define("tablet", { minWidth: 640 })',
      '    hero.setWithBreakpoint("tablet", { layout: "row" })',
      '    return { ok: true }',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'server', 'declare.ts'),
    [
      "import { defineServerAction } from '@morgana/sdk'",
      '',
      'export const declare = defineServerAction({',
      "  config: { on: 'compile' },",
      '  handler: (ctx) => {',
      '    ctx.server.collections.create("orders", { columns: [{ name: "total", type: "number" }] })',
      '    return { ok: true }',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'server', 'hello.ts'),
    [
      "import { defineServerAction } from '@morgana/sdk'",
      '',
      'export interface Contract {',
      '  input: { name?: string }',
      '  output: { greeting: string }',
      '}',
      '',
      'export const hello = defineServerAction({',
      '  handler: (ctx) => {',
      '    const name = (ctx.args as any)?.name ?? "world"',
      '    return { greeting: "hi " + name }',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'server', 'tick.ts'),
    [
      'export async function handle(ctx: any) {',
      '  return { ok: true }',
      '}',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'server', 'onOrder.ts'),
    [
      "import { defineServerAction } from '@morgana/sdk'",
      '',
      'export const onOrder = defineServerAction({',
      '  handler: (ctx) => ({ ok: true }),',
      '})',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'browser', 'checkout.ts'),
    [
      "import { defineClientAction } from '@morgana/sdk'",
      '',
      'export const checkout = defineClientAction({',
      "  config: { on: 'clicked' },",
      '  handler: (ctx) => {',
      '    ctx.ui.state.set("cart.open", true)',
      '    return { ok: true }',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  write(
    path.join(dir, 'src', 'actions', 'browser', 'watcher.ts'),
    [
      "import { defineClientAction } from '@morgana/sdk'",
      '',
      'export const watcher = defineClientAction({',
      "  config: { on: 'state:cart.open' },",
      '  handler: (ctx) => {',
      '    ctx.ui.state.set("cart.seen", true)',
      '    return { ok: true }',
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  return dir
}

const EMPTY_GRAPH: BindingGraph = {
  objectIds: new Set(),
  children: new Map(),
  componentNames: new Set(),
  componentEvents: new Set(),
  componentOf: new Map(),
  emittable: EMITTABLE,
}

describe('extract', () => {
  it('finds factory + plain actions and promotes hook compile targets', () => {
    const dir = makeProject()
    try {
      const scan = scanProject({ dir })
      const names = scan.actions.map((a) => a.name).sort()
      expect(names).toEqual(['checkout', 'declare', 'hello', 'onOrder', 'seed', 'tick', 'watcher'])
      expect(scan.actions.find((a) => a.name === 'seed')?.lane).toBe('compile')
      expect(scan.actions.find((a) => a.name === 'declare')?.lane).toBe('compile')
      expect(scan.actions.find((a) => a.name === 'checkout')?.lane).toBe('client')
      expect(scan.actions.find((a) => a.name === 'tick')?.factory).toBe('plain-handle')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('event split', () => {
  it('treats interaction events as frontend bindings, not triggers', () => {
    expect(isFrontendEvent('clicked')).toBe(true)
    expect(isFrontendEvent('state:cart.open')).toBe(true)
    expect(isFrontendEvent('state.cart.open')).toBe(true)
    expect(isFrontendEvent('button#submit.click')).toBe(true)
    expect(isFrontendEvent('store.orders.created')).toBe(false)
    expect(isFrontendEvent('cron(* * * * *)')).toBe(false)
    expect(isFrontendEvent('http.get /hello')).toBe(false)
    expect(isFrontendEvent('channel:ops')).toBe(false)
  })

  it('sends http to apis and everything else to unified triggers', () => {
    const dir = makeProject()
    try {
      const scan = scanProject({ dir })
      const runtime = scan.actions.filter((a) => a.lane !== 'compile')
      const errors: string[] = []
      const { apis, triggers, bindings } = deriveRoutes(
        runtime,
        (scan.config.hooks ?? []) as never,
        // No compiled graph here — this case only asserts apis and triggers.
        EMPTY_GRAPH,
        errors,
      )
      expect(apis).toHaveLength(1)
      expect(apis[0]).toMatchObject({ method: 'GET', path: '/hello', action: 'hello', auth: 'public' })
      expect(triggers.map((t) => t.name).sort()).toEqual(['onOrder:store.orders.created', 'tick:cron'])
      expect(triggers.find((t) => t.name === 'tick:cron')?.cron).toBe('* * * * *')
      expect(triggers.find((t) => t.name === 'onOrder:store.orders.created')?.event).toBe('store.orders.created')
      // state: selectors stay on the page — bindings, never server triggers.
      expect(triggers.some((t) => t.run === 'watcher')).toBe(false)
      expect(bindings).toContainEqual({ event: 'clicked', action: 'checkout' })
      expect(bindings).toContainEqual({ event: 'state:cart.open', action: 'watcher' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('compileProject', () => {
  it('builds pages, server modules, routes, triggers and stores', async () => {
    const dir = makeProject()
    try {
      const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
      expect(result.compileActions.sort()).toEqual(['declare', 'seed'])
      expect(result.serverActions.sort()).toEqual(['hello', 'onOrder', 'tick'])
      expect(result.pages).toEqual(['home'])
      expect(result.entry).toBe('home')

      const { readFileSync, existsSync } = await import('node:fs')
      const html = readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
      expect(html).toContain('data-entity="hero"')
      expect(html).toContain('data-entity="cta"')
      expect(html).toContain('Hello')
      const client = readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
      expect(client).toContain('"checkout"')
      expect(client).toContain('__bindings')
      // The live runtime module ships with the page: handles, pages, dom.
      expect(client).toContain('__morgana_runtime')
      expect(client).toContain('makeUi')
      // Runtime ctx satisfies the StateHandle/UiApi surface browser actions use.
      expect(client).toContain('state:ui.state')
      expect(client).toContain('setState')
      // The surfaces BaseContext/ClientContext declare but that were absent
      // from the built ctx, so calling them threw "undefined is not an object".
      for (const key of ['libraries:', 'apps:', 'vars:', 'assets:', 'log:']) {
        expect(client, key).toContain(key)
      }
      // Server-lane surfaces fail with a named error instead of being undefined.
      expect(client).toContain('is server-lane only')
      const css = readFileSync(path.join(dir, 'dist', 'assets', 'style.css'), 'utf8')
      expect(css).toContain('@media (min-width:640px){[data-entity="hero"]{display:flex;flex-direction:row}}')
      // Real declarations from props/tokens — not comments.
      expect(css).toContain('[data-entity="hero"]{display:flex;flex-direction:column')
      expect(css).toContain('padding:24px')
      expect(css).toContain('background:var(--card)')
      const hello = readFileSync(path.join(dir, 'dist', 'server', 'actions', 'hello.js'), 'utf8')
      expect(hello).toContain('export function handle(ctx)')
      expect(hello).not.toContain('import ')
      expect(existsSync(path.join(dir, 'dist', 'server', 'actions', 'checkout.js'))).toBe(false)
      const apis = JSON.parse(readFileSync(path.join(dir, 'dist', 'server', 'apis.json'), 'utf8') as string)
      expect(apis).toHaveLength(1)
      const triggers = JSON.parse(readFileSync(path.join(dir, 'dist', 'server', 'triggers.json'), 'utf8') as string)
      expect(triggers).toHaveLength(2)
      const stores = JSON.parse(readFileSync(path.join(dir, 'dist', 'server', 'stores.json'), 'utf8') as string)
      expect(stores).toEqual([{ name: 'orders', shape: { columns: [{ name: 'total', type: 'number' }] } }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
