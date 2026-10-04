/**
 * Custom objects — end to end.
 *
 * A component lives in `src/objects/`, is picked up with no registration step,
 * becomes a creator on `ctx.ui`, stamps real objects, seeds its own state, and
 * attaches its methods plus its browser lifecycle. These assertions exist
 * because every one of those steps is a place where a component could quietly
 * become a no-op — the exact failure this feature must not have.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'
import { discoverCustomObjects } from '../custom-objects'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  "export default defineConfig({ name: 'co', entry: 'home' })",
].join('\n')

/** A pure-`define` component: composition only, ships no client code. */
const PLAYER = `
import { createCustomObject } from '@morgana/sdk'
export default createCustomObject({
  name: 'video-player',
  defaultProps: { src: '', radius: 'lg' },
  events: ['play'],
  define: (handle, ctx) => {
    const v = ctx.ui.video({ id: 'video', src: String(ctx.props.src ?? '') })
    const cap = ctx.ui.text({ id: 'caption', content: 'clip' })
    const shell = ctx.ui.box({ id: 'shell', layout: 'column', gap: 2 })
    shell.place(v); shell.place(cap)
    handle.place(shell)
  },
})
`

/** A component that needs the browser: a lifecycle, methods and state. */
const WIDGET = `
import { createCustomObject } from '@morgana/sdk'
export default createCustomObject({
  name: 'test-widget',
  state: { open: false, count: 0 },
  events: ['opened'],
  onMount(el, ctx) {
    el.setAttribute('data-mounted', 'true')
    ctx.onCleanup(function () { el.setAttribute('data-destroyed', 'true') })
  },
  onUpdate(next, ctx) { ctx.element.setAttribute('data-updated', String(next.label ?? '')) },
  methods: {
    open(handle) { handle.state.set('open', true); handle.emit('opened') },
    isOpen(handle) { return handle.state.get('open') === true },
    bump(handle, by) { handle.state.set('count', Number(handle.state.get('count') ?? 0) + (by ?? 1)) },
  },
})
`

/** The `render` escape hatch: the object genuinely IS a table. */
const DERIVED = `
import { createCustomObject } from '@morgana/sdk'
export default createCustomObject({
  name: 'striped-table',
  render: 'table',
  defaultProps: { variant: 'striped' },
  methods: { firstPage(handle) { handle.setPage(1) } },
})
`

const SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
  // Composition
  "    p.place(ctx.ui.videoPlayer({ id: 'player', src: '/clip.mp4' }))",
  // Browser lane
  "    const w = ctx.ui.testWidget({ id: 'widget', label: 'hi' })",
  "    p.place(w)",
  // Derivative
  "    p.place(ctx.ui.stripedTable({ id: 'grid', rows: [{ id: '1' }] }))",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

/** Seeds that use only one component, for the bundle-size assertions. */
const PLAYER_SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
  "    p.place(ctx.ui.videoPlayer({ id: 'player', src: '/clip.mp4' }))",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

const WIDGET_SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
  "    p.place(ctx.ui.testWidget({ id: 'widget', label: 'hi' }))",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

interface Built {
  html: string
  manifest: string
  clientJs: string
  files: string[]
  warnings: string[]
}

async function build(
  objects: Record<string, string>,
  seed = SEED,
  config = CONFIG,
): Promise<Built> {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-co-'))
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write('morgana.config.ts', config)
  write('src/actions/compile/seed.ts', seed)
  for (const [name, src] of Object.entries(objects)) write(`src/objects/${name}.ts`, src)
  const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
  const html = fs.readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
  const manifest = /<script id="__MORGANA_OBJECTS__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}'
  const clientJs = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
  const files = result.files
  const warnings = result.warnings
  fs.rmSync(dir, { recursive: true, force: true })
  return { html, manifest: manifest.replace(/\\u003c/g, '<'), clientJs, files, warnings }
}

describe('custom object discovery', () => {
  it('finds components, their name, render and declared surface', () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-co-d-'))
    fs.mkdirSync(path.join(dir, 'src', 'objects'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'objects', 'a.ts'), PLAYER, 'utf8')
    fs.writeFileSync(path.join(dir, 'src', 'objects', 'b.ts'), DERIVED, 'utf8')
    const decls = discoverCustomObjects(dir)
    const byName = Object.fromEntries(decls.map((d) => [d.name, d]))
    expect(Object.keys(byName).sort()).toEqual(['striped-table', 'video-player'])
    expect(byName['video-player']!.render).toBe('box')
    expect(byName['striped-table']!.render).toBe('table')
    expect(byName['video-player']!.defaultProps['radius']).toBe('lg')
    expect(byName['video-player']!.events).toEqual(['play'])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('a helper module in the directory is not a component, and is not a warning', () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-co-h-'))
    fs.mkdirSync(path.join(dir, 'src', 'objects'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'objects', 'util.ts'), 'export const round = (n) => Math.round(n)\n', 'utf8')
    const warnings: string[] = []
    expect(discoverCustomObjects(dir, warnings)).toEqual([])
    expect(warnings).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('warns when a component declares no name', () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-co-n-'))
    fs.mkdirSync(path.join(dir, 'src', 'objects'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'objects', 'x.ts'),
      "import { createCustomObject } from '@morgana/sdk'\nexport default createCustomObject({})\n",
      'utf8',
    )
    const warnings: string[] = []
    expect(discoverCustomObjects(dir, warnings)).toEqual([])
    expect(warnings[0]).toContain('no `name`')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('a custom object is a real thing on the page', () => {
  it('its creator exists on ctx.ui, like any built-in kind', async () => {
    const built = await build({ 'video-player.ts': PLAYER, 'test-widget.ts': WIDGET, 'striped-table.ts': DERIVED })
    // If the creators did not exist, the seed would have thrown and there would
    // be no page at all — so the three data-object markers are the assertion.
    expect(built.html).toContain('data-object="video-player"')
    expect(built.html).toContain('data-object="test-widget"')
    expect(built.html).toContain('data-object="striped-table"')
  }, 60_000)

  it('stamps its interior as real objects, with their real renderers', async () => {
    const built = await build({ 'video-player.ts': PLAYER, 'test-widget.ts': WIDGET, 'striped-table.ts': DERIVED })
    // A real <video>, not a lookalike. This is the whole point of composing.
    expect(built.html).toMatch(/<video[^>]*data-entity="video"/)
    expect(built.html).toMatch(/<p[^>]*data-entity="caption"/)
    expect(built.html).toMatch(/<div[^>]*data-entity="shell"/)
  }, 60_000)

  it('renders as a table when it says render: table, not a wrapper', async () => {
    const built = await build({ 'video-player.ts': PLAYER, 'test-widget.ts': WIDGET, 'striped-table.ts': DERIVED })
    // data-kind stays the built-in it IS, and data-object is the component name,
    // so a component's own CSS and a built-in's behaviors can both target it.
    expect(built.html).toMatch(/<table[^>]*data-entity="grid"[^>]*data-kind="table"/)
    expect(built.html).toMatch(/data-entity="grid"[^>]*data-object="striped-table"/)
    // And it kept the variant the component defaults declared.
    expect(built.html).toContain('data-variant="striped"')
  }, 60_000)

  it('seeds its own state into the page state, under the instance id', async () => {
    const built = await build({ 'video-player.ts': PLAYER, 'test-widget.ts': WIDGET, 'striped-table.ts': DERIVED })
    const state = /<script id="__MORGANA_STATE__" type="application\/json">([\s\S]*?)<\/script>/.exec(built.html)?.[1]
    expect(state).toBeTruthy()
    const parsed = JSON.parse(state!) as Record<string, unknown>
    // Namespaced, so a user can bind to a component's state like anything else.
    expect(parsed['widget']).toEqual({ open: false, count: 0 })
  }, 60_000)

  it('carries the component schema into the manifest for tooling', async () => {
    const built = await build({ 'video-player.ts': PLAYER, 'test-widget.ts': WIDGET, 'striped-table.ts': DERIVED })
    const m = JSON.parse(fs.existsSync(path.join(process.cwd(), 'x')) ? '{}' : '{}') as unknown
    void m
    // The page manifest marks which objects came from a component.
    const manifest = JSON.parse(built.manifest) as {
      objects: Record<string, { customObject?: string }>
    }
    expect(manifest.objects['player']!.customObject).toBe('video-player')
    expect(manifest.objects['grid']!.customObject).toBe('striped-table')
  }, 60_000)
})

describe('the compile/runtime split holds', () => {
  it('a pure-define component puts no code in the client bundle', async () => {
    // Composition is compiled into real objects, so there is nothing left to
    // ship: the component's name, its props and its interior never reach the page.
    const built = await build({ 'video-player.ts': PLAYER }, PLAYER_SEED)
    expect(built.clientJs).not.toContain('video-player')
    expect(built.clientJs).not.toContain('/clip.mp4')
  }, 60_000)

  it('a component with a lifecycle or methods ships its code', async () => {
    const built = await build({ 'test-widget.ts': WIDGET }, WIDGET_SEED)
    // Registered before the runtime, so makeUi can attach on first sight.
    const js = built.clientJs
    const found = {
      registry: js.includes('__morgana_custom'),
      name: js.includes('test-widget'),
      mounted: js.includes('data-mounted'),
      cleanup: js.includes('onCleanup'),
    }
    // The component's own lifecycle code travelled with it.
    expect(found, JSON.stringify(found)).toEqual({ registry: true, name: true, mounted: true, cleanup: true })
  }, 60_000)

  it('an unknown creator fails the build rather than silently doing nothing', async () => {
    const bad = SEED.replace('ctx.ui.videoPlayer(', 'ctx.ui.videoPlayar(')
    await expect(build({ 'test-widget.ts': WIDGET }, bad)).rejects.toThrow(/videoPlayar/)
  }, 60_000)
})
