/**
 * Object-scoped and prop-scoped bindings, end to end.
 *
 * `parseSelector`/`resolveBindings` are unit-tested in `bindings.test.ts`. This
 * file is the half that cannot be unit-tested: does a scoped binding actually
 * fire in a real compiled page, and does an unresolvable one fail the build
 * instead of shipping dead?
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  "export default defineConfig({ name: 'b', entry: 'home' })",
].join('\n')

const SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    const cta = ctx.ui.button({ id: "cta", label: "Buy" })',
  '    const hero = ctx.ui.box({ id: "hero" })',
  '    hero.place(ctx.ui.text({ id: "heroTitle", content: "Hi" }))',
  '    p.place(hero)',
  '    p.place(cta)',
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

async function build(actions: Record<string, string>, seed = SEED): Promise<{
  bindings: Array<Record<string, unknown>>
  warnings: string[]
  clientJs: string
}> {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-bind-'))
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write('morgana.config.ts', CONFIG)
  write('src/actions/compile/seed.ts', seed)
  for (const [name, src] of Object.entries(actions)) write(`src/actions/browser/${name}.ts`, src)
  const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
  const clientJs = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
  // Bindings ship in the client bundle, not the manifest — read them from where
  // they actually run, by bracket-matching the emitted literal.
  const marker = 'var __bindings = '
  const start = clientJs.indexOf(marker)
  let raw: string | undefined
  if (start >= 0) {
    let depth = 0
    for (let i = start + marker.length; i < clientJs.length; i++) {
      const c = clientJs[i]!
      if (c === '[') depth++
      else if (c === ']') {
        depth--
        if (depth === 0) {
          raw = clientJs.slice(start + marker.length, i + 1)
          break
        }
      }
    }
  }
  const bindings = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : []
  fs.rmSync(dir, { recursive: true, force: true })
  return { bindings, warnings: result.warnings, clientJs }
}

const action = (name: string, on: string) =>
  [
    "import { defineClientAction } from '@morgana/sdk'",
    `export const ${name} = defineClientAction({`,
    `  config: { on: ${JSON.stringify(on)} },`,
    '  handler: (ctx) => { ctx.log("ran") ; return { ok: true } },',
    '})',
  ].join('\n')

describe('object-scoped bindings compile to real, scoped bindings', () => {
  it('a bare event has no origin — it still means any object', async () => {
    const { bindings, warnings } = await build({ a: action('a', 'clicked') })
    expect(warnings).toEqual([])
    expect(bindings).toEqual([{ event: 'clicked', action: 'a' }])
  }, 60_000)

  it('a scoped event binds to that object only', async () => {
    const { bindings, warnings } = await build({ a: action('a', 'cta.clicked') })
    expect(warnings).toEqual([])
    expect(bindings).toEqual([{ event: 'clicked', action: 'a', origin: 'cta' }])
  }, 60_000)

  it('a DOM alias compiles to the name the runtime dispatches', async () => {
    // `cta.click` used to compile and never fire.
    const { bindings, warnings } = await build({ a: action('a', 'cta.click') })
    expect(warnings).toEqual([])
    expect(bindings[0]).toMatchObject({ event: 'clicked', origin: 'cta' })
  }, 60_000)

  it('a prop watcher compiles to a namespaced prop event', async () => {
    const { bindings, warnings } = await build({ a: action('a', 'cta.label.changed') })
    expect(warnings).toEqual([])
    expect(bindings[0]).toMatchObject({ event: 'prop:changed', origin: 'cta', prop: 'label' })
  }, 60_000)

  it('a state path is untouched by any of this', async () => {
    const { bindings, warnings } = await build({ a: action('a', 'state:cart.open') })
    expect(warnings).toEqual([])
    expect(bindings[0]).toMatchObject({ event: 'state:cart.open', action: 'a' })
  }, 60_000)

  it('two objects can listen to the same event independently', async () => {
    const { bindings } = await build({
      a: action('a', 'cta.clicked'),
      b: action('b', 'hero.clicked'),
    })
    const origins = bindings.map((b) => `${b['origin']}->${b['action']}`).sort()
    expect(origins).toEqual(['cta->a', 'hero->b'])
  }, 60_000)
})

describe('a selector that names nothing real is caught at build time', () => {
  it('warns about a missing object', async () => {
    const { bindings, warnings } = await build({ a: action('a', 'nope.clicked') })
    expect(bindings).toEqual([])
    expect(warnings.join('\n')).toContain('no object named "nope"')
  }, 60_000)

  it('warns about an event nothing dispatches', async () => {
    const { bindings, warnings } = await build({ a: action('a', 'cta.clickked') })
    expect(bindings).toEqual([])
    expect(warnings.join('\n')).toContain('nothing dispatches')
  }, 60_000)

  it('the warning names the action', async () => {
    const { warnings } = await build({ a: action('checkout', 'nope.clicked') })
    expect(warnings.join('\n')).toContain('checkout')
  }, 60_000)
})

describe('the client can actually match a scoped binding', () => {
  it('the shipped bus filters on origin and prop', async () => {
    const { clientJs } = await build({ a: action('a', 'cta.label.changed') })
    // Without these two guards a scoped binding would fire for everything, which
    // is the bug the origin field exists to fix.
    expect(clientJs).toContain('b.origin && b.origin !== (target||"")')
    expect(clientJs).toContain('p !== b.prop')
  }, 60_000)

  it('a prop change dispatches prop:changed', async () => {
    const { clientJs } = await build({ a: action('a', 'cta.label.changed') })
    expect(clientJs).toContain('prop:changed')
    // And it comes from set(), not from state — so it fires with no bind().
    expect(clientJs).toContain('dispatchPropChange')
  }, 60_000)
})
