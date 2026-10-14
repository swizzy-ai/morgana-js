#!/usr/bin/env node
/**
 * Style conformance — every component kind, styled by props, checked in a real
 * browser.
 *
 *   node tools/style-check.mjs --browser <chrome.exe> [--kinds button,input]
 *
 * For each creatable kind it renders one object with the same style props and
 * reads the *computed* style of the element that carries the object:
 *
 *   bg / pad / radius / borderColor   the props land on the object, and win over
 *                                     the component's own variant styling
 *   hover                             the state style applies on hover
 *   theme                             a themed parent's tokens reach the object
 *
 * A kind that fails is a kind whose props do not style it — the claim
 * "everything stylable is stylable" is exactly this table passing.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(root, 'packages', 'morgana-cli', 'bin', 'morgana.mjs')
const argv = process.argv.slice(2)
const flag = (n) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const browserPath = flag('browser')
// Without --browser, Playwright's own Chromium (`npx playwright-core install chromium`).

const registries = fs.readFileSync(path.join(root, 'packages/sdk-compile/src/kinds.ts'), 'utf8')
const block = /CREATABLE_KINDS = \[([\s\S]*?)\] as const/.exec(registries)[1]
let kinds = [...block.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]).filter((k) => k !== 'page')
if (flag('kinds')) kinds = flag('kinds').split(',')

/** Props a kind needs to render something at all. */
const NEEDS = {
  text: { content: 'text' }, button: { label: 'Button', variant: 'primary' }, label: { content: 'Label' },
  markdown: { content: 'md' }, code: { content: 'x = 1' }, codeBlock: { content: 'x = 1' },
  link: { href: '#', content: 'link' }, badge: { label: 'badge', variant: 'success' }, tag: { label: 'tag' },
  alert: { title: 'Alert', variant: 'info' }, image: { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'x' },
  table: { columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] }, chart: { series: [[1, 2]], labels: ['a', 'b'] },
  tabs: { items: [{ key: 'a', label: 'A', content: 'x' }] }, accordion: { items: [{ key: 'a', title: 'A', content: 'x' }] },
  select: { options: [{ label: 'A', value: 'a' }] }, combobox: { options: [{ label: 'A', value: 'a' }] },
  dropdown: { label: 'Menu', items: [{ label: 'A', value: 'a' }] }, menu: { items: [{ label: 'A', value: 'a' }] },
  breadcrumbs: { items: [{ label: 'Home', href: '#' }] }, steps: { items: [{ key: 'a', title: 'A' }] },
  timeline: { items: [{ title: 'A', time: 'now' }] }, treeView: { items: [{ key: 'a', label: 'A' }] },
  dataList: { items: [{ label: 'A', value: '1' }] }, stat: { label: 'Stat', value: '1' }, avatar: { name: 'Ada L' },
  avatarGroup: { avatars: [{ name: 'Ada' }] }, progress: { value: 40 }, progressCircle: { value: 40 },
  blockquote: { content: 'quote' }, kbd: { content: 'K' }, status: { label: 'ok', value: 'success' },
  emptyState: { title: 'Empty' }, tooltip: { content: 'tip', label: 'hover me' }, popover: { triggerLabel: 'open', content: 'x' },
  dialog: { title: 'Dialog' }, drawer: { title: 'Drawer' }, toast: {}, slider: { value: 3 },
  list: {}, lister: {}, timelineItems: {},
}

const STYLE = { bg: '#010203', pad: 3, radius: 7, borderColor: 'primary', border: true, hover: { bg: '#040506' } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-style-'))
fs.mkdirSync(path.join(dir, 'src/actions/compile'), { recursive: true })
fs.mkdirSync(path.join(dir, 'src/actions/client'), { recursive: true })
fs.writeFileSync(
  path.join(dir, 'src/actions/client/go.ts'),
  `import { defineClientAction } from '@morgana/sdk'
export const go = defineClientAction({
  config: { on: 'rt-go.clicked' },
  handler: (ctx) => {
    ctx.ui.get('rt-hover')!.set('hover', { bg: '#070809' })
    ctx.ui.get('rt-dark')!.make('theme:dark')
    ctx.ui.setTheme('dark')
  },
})
`,
)
fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"style-check","private":true,"type":"module"}')
fs.writeFileSync(path.join(dir, 'morgana.config.ts'), `import { defineConfig } from '@morgana/sdk'\nexport default defineConfig({ name: 'style-check', entry: 'home' })\n`)
fs.writeFileSync(
  path.join(dir, 'src/actions/compile/page.ts'),
  `import { defineClientAction } from '@morgana/sdk'
const KINDS = ${JSON.stringify(kinds)}
const NEEDS: Record<string, Record<string, unknown>> = ${JSON.stringify(NEEDS)}
const STYLE = ${JSON.stringify(STYLE)}
export const page = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('main', { displayName: 'S' })
    ctx.ui.themes.define('brand', { primary: '#0A0B0C', border: '#0D0E0F' })
    const p = ctx.ui.pages.create({ name: 'home', address: '/' })
    p.app('main')
    const scope = ctx.ui.box({ id: 'scope', layout: 'column', gap: 2 })
    scope.make('theme:brand')
    const failed: string[] = []
    for (const k of KINDS) {
      try {
        const o = (ctx.ui as any)[k]({ id: 'k-' + k, ...(NEEDS[k] ?? {}), ...STYLE })
        scope.place(o)
      } catch (e) { failed.push(k + ': ' + (e as Error).message) }
    }
    // Runtime phase targets: restyled by a client action after load.
    const rt = ctx.ui.box({ id: 'rt', layout: 'column', gap: 2 })
    rt.place(ctx.ui.button({ id: 'rt-go', label: 'go' }))
    rt.place(ctx.ui.box({ id: 'rt-hover', pad: 4, bg: '#010203' }))
    rt.place(ctx.ui.box({ id: 'rt-dark', pad: 4, bg: 'primary' }))
    rt.place(ctx.ui.box({ id: 'rt-bg', pad: 4, bg: 'background' }))
    p.place(rt)
    p.place(scope)
    if (failed.length) ctx.ui.state.set('createFailed', failed)
    return { ok: true, failed }
  },
})
`,
)

execFileSync(process.execPath, [cli, 'build'], { cwd: dir, stdio: 'pipe' })
const port = 4900 + Math.floor(Math.random() * 90)
const dev = spawn(process.execPath, [cli, 'dev', '--port', String(port)], { cwd: dir, stdio: 'ignore' })
const base = `http://localhost:${port}`
for (let i = 0; i < 60; i++) {
  if (await new Promise((r) => http.get(base, (res) => (res.resume(), r(true))).on('error', () => r(false)))) break
  await new Promise((r) => setTimeout(r, 500))
}

const require = createRequire(path.join(root, 'package.json'))
const { chromium } = require('playwright-core')
const browser = await chromium.launch(browserPath ? { executablePath: browserPath } : {})
const rows = []
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(base + '/')
  for (const k of kinds) {
    const sel = `[data-entity="k-${k}"]`
    const el = await page.$(sel)
    if (!el) {
      rows.push({ kind: k, ok: false, why: 'not rendered' })
      continue
    }
    const read = () =>
      page.$eval(sel, (e) => {
        const cs = getComputedStyle(e)
        return {
          bg: cs.backgroundColor,
          pad: cs.paddingTop,
          radius: cs.borderTopLeftRadius,
          border: cs.borderTopColor,
          visible: e.getBoundingClientRect().width > 0 && cs.display !== 'none',
          // A pass-through region (toast) cannot be hovered by design.
          interactive: cs.pointerEvents !== 'none',
        }
      })
    const before = await read()
    let hovered = null
    if (before.visible) {
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await el.hover({ force: true, timeout: 2000 }).catch(() => {})
      hovered = await read()
      await page.mouse.move(0, 0)
    }
    const why = []
    if (before.bg !== 'rgb(1, 2, 3)') why.push(`bg ${before.bg}`)
    if (before.pad !== '12px') why.push(`pad ${before.pad}`)
    if (before.radius !== '7px') why.push(`radius ${before.radius}`)
    if (before.border !== 'rgb(10, 11, 12)') why.push(`themed border ${before.border}`)
    if (before.visible && before.interactive && hovered && hovered.bg !== 'rgb(4, 5, 6)') why.push(`hover ${hovered.bg}`)
    if (!before.interactive) why.push('(pass-through — hover not checked)')
    if (!before.visible) why.push('(hidden — hover not checked)')
    rows.push({ kind: k, ok: why.filter((w) => !w.startsWith('(')).length === 0, why: why.join(', ') })
  }
  // Runtime: set('hover'), make('theme:dark'), setTheme('dark').
  const bgOf = (id) => page.$eval(`[data-entity="${id}"]`, (e) => getComputedStyle(e).backgroundColor)
  const lightBg = await bgOf('rt-bg')
  await page.click('[data-entity="rt-go"]')
  await page.waitForTimeout(200)
  await page.hover('[data-entity="rt-hover"]')
  const rtChecks = [
    ['runtime set(hover)', await bgOf('rt-hover'), 'rgb(7, 8, 9)'],
    ["runtime make('theme:dark') → primary", await bgOf('rt-dark'), 'rgb(250, 250, 250)'],
    ["setTheme('dark') → page background token", await bgOf('rt-bg'), 'rgb(9, 9, 11)'],
  ]
  rows.push({ kind: '(light bg before)', ok: lightBg === 'rgb(255, 255, 255)', why: lightBg })
  for (const [name, got, want] of rtChecks) rows.push({ kind: name, ok: got === want, why: got === want ? '' : `got ${got}, want ${want}` })
} finally {
  await browser.close()
  dev.kill()
}
const bad = rows.filter((r) => !r.ok)
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.kind.padEnd(16)} ${r.why}`)
console.log(`\n${rows.length - bad.length}/${rows.length} kinds styled by props`)
try {
  fs.rmSync(dir, { recursive: true, force: true })
} catch {
  // The dev server may still hold the SQLite file on Windows; the OS cleans temp.
}
if (bad.length) process.exitCode = 1
