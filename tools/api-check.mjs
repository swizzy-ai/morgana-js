#!/usr/bin/env node
/**
 * API contract — every method the SDK types promise exists on the live handle.
 *
 *   node tools/api-check.mjs --browser <chrome.exe>
 *
 * Reads `UiApi` (kind → handle interface) and the handle interfaces (with
 * their `extends` chains) from the SDK source, renders one object of every
 * kind in a real browser, and checks `typeof handle[method] === 'function'`
 * for each promised method. A typed method with no implementation is a call
 * that type-checks and then throws in the visitor's browser.
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
const bi = process.argv.indexOf('--browser')
const browserPath = bi >= 0 ? process.argv[bi + 1] : undefined
if (!browserPath) throw new Error('--browser <chrome executable> is required')

const sdk = (f) => fs.readFileSync(path.join(root, 'packages/sdk/src', f), 'utf8')
const typeSrc = sdk('handles.ts') + '\n' + sdk('components.ts')

// interface Name<...> extends A<...>, B { body }
const interfaces = new Map()
for (const m of typeSrc.matchAll(/export interface (\w+)(?:<[^{]*?>)?(?:\s+extends\s+([^{]+))?\{([\s\S]*?)\n\}/g)) {
  const parents = (m[2] ?? '')
    .replace(/<[^<>]*(?:<[^<>]*>[^<>]*)*>/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const methods = [...m[3].matchAll(/^\s{2}(?:readonly\s+)?([a-zA-Z_]\w*)\??(?:<[^>]*>)?\(/gm)].map((x) => x[1])
  interfaces.set(m[1], { parents, methods })
}
function methodsOf(name, seen = new Set()) {
  if (seen.has(name)) return []
  seen.add(name)
  const it = interfaces.get(name)
  if (!it) return []
  return [...new Set([...it.methods, ...it.parents.flatMap((p) => methodsOf(p, seen))])]
}

const uiApi = /export interface UiApi \{([\s\S]*?)\n\}/.exec(sdk('contexts/client.ts'))[1]
const kindHandles = [...uiApi.matchAll(/^\s{2}(\w+): Creatable<\w+, (\w+)>/gm)].map((m) => [m[1], m[2]])

// Construction props a few kinds need to render meaningfully.
const NEEDS = {
  table: { columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] },
  chart: { series: [[1, 2]], labels: ['a', 'b'] },
  select: { options: [{ label: 'A', value: 'a' }] },
  tabs: { items: [{ key: 'a', label: 'A', content: 'x' }] },
  accordion: { items: [{ key: 'a', title: 'A', content: 'x' }] },
  image: { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'x' },
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-api-'))
const w = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}
w('package.json', '{"name":"api-check","private":true,"type":"module"}')
w('morgana.config.ts', `import { defineConfig } from '@morgana/sdk'\nexport default defineConfig({ name: 'api-check', entry: 'home' })\n`)
const plan = kindHandles.map(([kind, handle]) => ({ kind, handle, methods: methodsOf(handle) }))
w(
  'src/actions/compile/page.ts',
  `import { defineClientAction } from '@morgana/sdk'
const KINDS: string[] = ${JSON.stringify(plan.map((p) => p.kind))}
const NEEDS: Record<string, Record<string, unknown>> = ${JSON.stringify(NEEDS)}
export const page = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('main', { displayName: 'A' })
    const p = ctx.ui.pages.create({ name: 'home', address: '/' })
    p.app('main')
    p.place(ctx.ui.button({ id: 'probe', label: 'probe' }))
    p.place(ctx.ui.text({ id: 'out', content: '' }))
    const all = ctx.ui.box({ id: 'all', layout: 'column' })
    for (const k of KINDS) all.place((ctx.ui as any)[k]({ id: 'k-' + k, ...(NEEDS[k] ?? {}) }))
    p.place(all)
    return { ok: true }
  },
})
`,
)
w(
  'src/actions/client/probe.ts',
  `import { defineClientAction } from '@morgana/sdk'
const PLAN: Array<{ kind: string; methods: string[] }> = ${JSON.stringify(plan.map(({ kind, methods }) => ({ kind, methods })))}
export const probe = defineClientAction({
  config: { on: 'probe.clicked' },
  handler: (ctx) => {
    const report: Record<string, string[]> = {}
    for (const { kind, methods } of PLAN) {
      const h = ctx.ui.get('k-' + kind) as Record<string, unknown> | undefined
      if (!h) { report[kind] = ['<no handle>']; continue }
      const missing = methods.filter((m) => typeof h[m] !== 'function')
      if (missing.length) report[kind] = missing
    }
    ctx.ui.get('out')!.set('content', JSON.stringify(report))
  },
})
`,
)

execFileSync(process.execPath, [cli, 'build'], { cwd: dir, stdio: 'pipe' })
const port = 5100 + Math.floor(Math.random() * 90)
const dev = spawn(process.execPath, [cli, 'dev', '--port', String(port)], { cwd: dir, stdio: 'ignore' })
const base = `http://localhost:${port}`
for (let n = 0; n < 60; n++) {
  if (await new Promise((r) => http.get(base, (res) => (res.resume(), r(true))).on('error', () => r(false)))) break
  await new Promise((r) => setTimeout(r, 500))
}
const require = createRequire(path.join(root, 'package.json'))
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ executablePath: browserPath })
let report = {}
const errors = []
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(base + '/')
  await page.click('[data-entity="probe"]')
  await page.waitForFunction(() => (document.querySelector('[data-entity="out"]')?.textContent ?? '').startsWith('{'), null, { timeout: 10000 })
  report = JSON.parse((await page.textContent('[data-entity="out"]')) ?? '{}')
} finally {
  await browser.close()
  dev.kill()
}
const total = plan.reduce((n, p) => n + p.methods.length, 0)
const missing = Object.entries(report)
for (const [kind, ms] of missing) console.log(`FAIL  ${kind.padEnd(16)} missing: ${ms.join(', ')}`)
if (errors.length) console.log(`page errors: ${errors.join(' | ')}`)
console.log(`\n${plan.length - missing.length}/${plan.length} kinds implement every typed method (${total} methods checked)`)
try {
  fs.rmSync(dir, { recursive: true, force: true })
} catch {}
if (missing.length || errors.length) process.exitCode = 1
