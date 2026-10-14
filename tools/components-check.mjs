#!/usr/bin/env node
/**
 * Component behaviour — the newer components driven by a real browser.
 *
 *   node tools/components-check.mjs --browser <chrome.exe>
 *
 * For each component: a user interaction changes its state, the right event
 * fires exactly once with the right payload, and the handle methods paint the
 * same state an interaction does. Events are recorded by real client actions
 * bound with `config.on`, so the bindings themselves are under test too.
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
const i = process.argv.indexOf('--browser')
const browserPath = i >= 0 ? process.argv[i + 1] : undefined
if (!browserPath) throw new Error('--browser <chrome executable> is required')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-comp-'))
const w = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}
w('package.json', '{"name":"components-check","private":true,"type":"module"}')
w('morgana.config.ts', `import { defineConfig } from '@morgana/sdk'\nexport default defineConfig({ name: 'components-check', entry: 'home' })\n`)
w(
  'src/actions/compile/page.ts',
  `import { defineClientAction } from '@morgana/sdk'
export const page = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('main', { displayName: 'C' })
    const p = ctx.ui.pages.create({ name: 'home', address: '/' })
    p.app('main')
    const col = ctx.ui.box({ id: 'col', layout: 'column', gap: 4, pad: 4 })
    col.place(ctx.ui.text({ id: 'log', content: '' }))
    col.place(ctx.ui.button({ id: 'methods', label: 'methods' }))
    col.place(ctx.ui.datePicker({ id: 'dp', value: '2026-10-15', min: '2026-10-05' }))
    col.place(ctx.ui.dateRange({ id: 'dr', start: '2026-10-02', end: '2026-10-04' }))
    col.place(ctx.ui.radioGroup({ id: 'rg', value: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }, { label: 'C', value: 'c', description: 'third' }] }))
    col.place(ctx.ui.pagination({ id: 'pg', total: 200, pageSize: 10, page: 1 }))
    const cl = ctx.ui.collapsible({ id: 'cl', title: 'More' })
    cl.place(ctx.ui.text({ id: 'cl-body', content: 'HIDDEN BODY' }))
    col.place(cl)
    col.place(ctx.ui.carousel({ id: 'cr', items: [{ title: 'one' }, { title: 'two' }, { title: 'three' }], height: 40 }))
    col.place(ctx.ui.colorPicker({ id: 'cpk', value: '#000000', swatches: ['#ff0000', '#00ff00'] }))
    col.place(ctx.ui.contextMenu({ id: 'cm', content: 'RIGHT CLICK HERE', items: [{ label: 'Copy', value: 'copy', shortcut: '⌘C' }, { separator: true }, { label: 'Delete', value: 'delete', disabled: true }] }))
    col.place(ctx.ui.commandPalette({ id: 'cpa', items: [{ label: 'Open settings', value: 'settings', group: 'App' }, { label: 'Sign out', value: 'signout', group: 'Account' }] }))
    p.place(col)
    return { ok: true }
  },
})
`,
)
const EVENTS = [
  ['dp', 'changed'], ['dp', 'opened'], ['dp', 'closed'],
  ['dr', 'changed'], ['rg', 'changed'], ['pg', 'changed'], ['cl', 'opened'], ['cl', 'closed'], ['cr', 'changed'],
  ['cpk', 'changed'], ['cm', 'opened'], ['cm', 'selected'], ['cm', 'closed'],
  ['cpa', 'opened'], ['cpa', 'selected'], ['cpa', 'closed'],
]
for (const [id, ev] of EVENTS) {
  w(
    `src/actions/client/log_${id}_${ev}.ts`,
    `import { defineClientAction } from '@morgana/sdk'
export const log_${id}_${ev} = defineClientAction({
  config: { on: '${id}.${ev}' },
  handler: (ctx) => {
    const log = ctx.ui.get('log')!
    const p = (ctx.event?.payload ?? {}) as Record<string, unknown>
    const brief = ['value', 'page', 'index'].filter((k) => k in p).map((k) => k + '=' + String(p[k])).join(',')
    log.set('content', String(log.get('content') ?? '') + ' ${id}.${ev}' + (brief ? '(' + brief + ')' : ''))
  },
})
`,
  )
}
w(
  'src/actions/client/methods.ts',
  `import { defineClientAction } from '@morgana/sdk'
export const methods = defineClientAction({
  config: { on: 'methods.clicked' },
  handler: (ctx) => {
    const u = ctx.ui as any
    u.get('dp').setValue('2026-12-25')
    u.get('dr').setValue('2026-11-20', '2026-11-03')
    u.get('rg').setValue('c')
    u.get('pg').setPage(5)
    u.get('cr').goTo(2)
    u.get('cpk').setValue('#123456')
    u.get('cl').open()
  },
})
`,
)

execFileSync(process.execPath, [cli, 'build'], { cwd: dir, stdio: 'pipe' })
const port = 5000 + Math.floor(Math.random() * 90)
const dev = spawn(process.execPath, [cli, 'dev', '--port', String(port)], { cwd: dir, stdio: 'ignore' })
const base = `http://localhost:${port}`
for (let n = 0; n < 60; n++) {
  if (await new Promise((r) => http.get(base, (res) => (res.resume(), r(true))).on('error', () => r(false)))) break
  await new Promise((r) => setTimeout(r, 500))
}

const results = []
const check = async (name, fn) => {
  try {
    await fn()
    results.push([name, true])
  } catch (e) {
    results.push([name, false, e.message])
  }
}
const expect = (c, m) => {
  if (!c) throw new Error(m)
}

const require = createRequire(path.join(root, 'package.json'))
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ executablePath: browserPath })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(base + '/')
  // The logger appends to the log object's prop, so "clearing" means marking
  // where this check's events start, not blanking the DOM.
  let mark = 0
  const fullLog = async () => (await page.textContent('[data-entity="log"]')) ?? ''
  const log = async () => (await fullLog()).slice(mark)
  const clearLog = async () => {
    mark = (await fullLog()).length
  }
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur())
  const attr = (sel, a) => page.getAttribute(sel, a)
  const count = (s, needle) => s.split(needle).length - 1

  await check('datePicker: open, pick a day, closed, changed once', async () => {
    await clearLog()
    await page.click('[data-entity="dp"] [data-part="field"]')
    expect(await page.isVisible('[data-entity="dp"] [data-part="calendar"]'), 'calendar not shown')
    expect(await attr('[data-entity="dp"] [data-date="2026-10-01"]', 'disabled') !== null, 'day before min should be disabled')
    expect(await attr('[data-entity="dp"] [data-date="2026-10-15"]', 'data-selected') === 'true', 'value not selected')
    await page.click('[data-entity="dp"] [data-date="2026-10-20"]')
    expect((await page.inputValue('[data-entity="dp"] [data-part="field"]')) === '2026-10-20', 'field not updated')
    expect(!(await page.isVisible('[data-entity="dp"] [data-part="calendar"]')), 'calendar still open')
    const l = await log()
    expect(count(l, 'dp.changed(value=2026-10-20)') === 1 && l.includes('dp.opened') && l.includes('dp.closed'), l)
  })
  await check('datePicker: month navigation and Escape', async () => {
    await page.click('[data-entity="dp"] [data-part="trigger"]')
    await page.click('[data-entity="dp"] [data-part="cal-nav"][data-dir="1"]')
    expect(((await page.textContent('[data-entity="dp"] [data-part="cal-label"]')) ?? '').includes('November 2026'), 'next month')
    await page.keyboard.press('Escape')
    expect(!(await page.isVisible('[data-entity="dp"] [data-part="calendar"]')), 'Esc did not close')
  })
  await check('dateRange: two clicks make a range, days between marked, changed once', async () => {
    await clearLog()
    await page.click('[data-entity="dr"] [data-part="field"]')
    await page.click('[data-entity="dr"] [data-date="2026-10-14"]')
    expect(await page.isVisible('[data-entity="dr"] [data-part="calendar"]'), 'closed after the first click')
    await page.click('[data-entity="dr"] [data-date="2026-10-10"]')
    expect((await attr('[data-entity="dr"]', 'data-start')) === '2026-10-10' && (await attr('[data-entity="dr"]', 'data-end')) === '2026-10-14', 'range not swapped/stored')
    expect((await page.inputValue('[data-entity="dr"] [data-part="field"]')) === '2026-10-10 → 2026-10-14', 'field text')
    await page.click('[data-entity="dr"] [data-part="trigger"]')
    expect((await attr('[data-entity="dr"] [data-date="2026-10-12"]', 'data-in-range')) === 'true', 'in-range day not marked')
    await page.keyboard.press('Escape')
    const l = await log()
    expect(count(l, 'dr.changed') === 1 && l.includes('dr.changed(value=2026-10-10..2026-10-14)'), l)
  })
  await check('radioGroup: pick fires changed once', async () => {
    await clearLog()
    await page.click('[data-entity="rg"] [data-part="option"][data-value="b"]')
    expect((await attr('[data-entity="rg"]', 'data-value')) === 'b', 'value')
    const l = await log()
    expect(count(l, 'rg.changed') === 1 && l.includes('rg.changed(value=b)'), l)
  })
  await check('pagination: next, last page, next disabled', async () => {
    await clearLog()
    await page.click('[data-entity="pg"] [data-part="next"]')
    expect((await attr('[data-entity="pg"]', 'data-page')) === '2', 'next')
    await page.click('[data-entity="pg"] [data-part="page"][data-page="20"]')
    expect((await attr('[data-entity="pg"]', 'data-page')) === '20', 'last')
    expect(await page.isDisabled('[data-entity="pg"] [data-part="next"]'), 'next should disable on the last page')
    expect((await page.$$('[data-entity="pg"] [data-part="gap"]')).length >= 1, 'gaps')
    expect((await log()).includes('pg.changed(page=20)'), await log())
  })
  await check('collapsible: toggles its children', async () => {
    await clearLog()
    expect(!(await page.isVisible('[data-entity="cl-body"]')), 'body visible while closed')
    await page.click('[data-entity="cl"] [data-part="trigger"]')
    expect(await page.isVisible('[data-entity="cl-body"]'), 'body hidden while open')
    await page.click('[data-entity="cl"] [data-part="trigger"]')
    const l = await log()
    expect(l.includes('cl.opened') && l.includes('cl.closed'), l)
  })
  await check('carousel: next, dot, loop', async () => {
    await clearLog()
    await page.click('[data-entity="cr"] [data-part="next"]')
    expect((await attr('[data-entity="cr"]', 'data-index')) === '1', 'next')
    await page.click('[data-entity="cr"] [data-part="dot"][data-slide="2"]')
    await page.click('[data-entity="cr"] [data-part="next"]')
    expect((await attr('[data-entity="cr"]', 'data-index')) === '0', 'loop to first')
    expect((await log()).includes('cr.changed(index=0)'), await log())
  })
  await check('colorPicker: swatch and typed hex', async () => {
    await clearLog()
    await page.click('[data-entity="cpk"] [data-part="swatch"][data-value="#ff0000"]')
    expect((await attr('[data-entity="cpk"]', 'data-value')) === '#ff0000', 'swatch')
    await page.fill('[data-entity="cpk"] [data-part="hex"]', '0f0')
    await page.press('[data-entity="cpk"] [data-part="hex"]', 'Enter')
    await blur()
    expect((await attr('[data-entity="cpk"]', 'data-value')) === '#00ff00', 'hex')
    const l = await log()
    expect(count(l, 'cpk.changed') === 2, l)
  })
  await check('contextMenu: right-click opens at pointer, pick, disabled item inert', async () => {
    await clearLog()
    await page.click('[data-entity="cm"] [data-part="area"]', { button: 'right' })
    expect(await page.isVisible('[data-entity="cm"] [data-part="menu"]'), 'menu not shown')
    await page.click('[data-entity="cm"] [data-part="item"][data-value="delete"]', { force: true })
    expect(await page.isVisible('[data-entity="cm"] [data-part="menu"]'), 'disabled item closed the menu')
    await page.click('[data-entity="cm"] [data-part="item"][data-value="copy"]')
    expect(!(await page.isVisible('[data-entity="cm"] [data-part="menu"]')), 'menu still open')
    const l = await log()
    expect(l.includes('cm.opened') && l.includes('cm.selected(value=copy)') && !l.includes('value=delete'), l)
  })
  await check('commandPalette: hotkey, filter, Enter picks, Esc closes', async () => {
    await clearLog()
    await blur()
    await page.keyboard.press('Control+k')
    expect(await page.isVisible('[data-entity="cpa"] [data-part="search"]'), 'not opened by Ctrl+K')
    await page.keyboard.type('sign')
    expect(!(await page.isVisible('[data-entity="cpa"] [data-part="command"][data-value="settings"]')), 'filter did not hide settings')
    await page.keyboard.press('Enter')
    expect(!(await page.isVisible('[data-entity="cpa"] [data-part="panel"]')), 'still open after pick')
    await page.keyboard.press('Control+k')
    await page.keyboard.press('Escape')
    expect(!(await page.isVisible('[data-entity="cpa"] [data-part="panel"]')), 'Esc did not close')
    const l = await log()
    expect(l.includes('cpa.selected(value=signout)') && count(l, 'cpa.opened') === 2 && count(l, 'cpa.closed') === 2, l)
  })
  await check('handle methods paint like interactions and emit once', async () => {
    await clearLog()
    await page.click('[data-entity="methods"]')
    await page.waitForTimeout(150)
    expect((await page.inputValue('[data-entity="dp"] [data-part="field"]')) === '2026-12-25', 'dp.setValue')
    expect((await attr('[data-entity="dr"]', 'data-start')) === '2026-11-03', 'dr.setValue swaps')
    expect((await page.isChecked('[data-entity="rg"] input[value="c"]')), 'rg.setValue')
    expect((await attr('[data-entity="pg"]', 'data-page')) === '5', 'pg.setPage')
    expect((await attr('[data-entity="cr"]', 'data-index')) === '2', 'cr.goTo')
    expect((await attr('[data-entity="cpk"]', 'data-value')) === '#123456', 'cpk.setValue')
    expect(await page.isVisible('[data-entity="cl-body"]'), 'cl.open')
    const l = await log()
    for (const ev of ['dp.changed', 'dr.changed', 'rg.changed', 'pg.changed', 'cr.changed', 'cpk.changed', 'cl.opened']) {
      expect(count(l, ev) === 1, `${ev} fired ${count(l, ev)}× — ${l}`)
    }
  })
  await check('no page errors', async () => expect(!errors.length, errors.join('; ')))
} finally {
  await browser.close()
  dev.kill()
}
for (const [name, ok, why] of results) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n      ${why}`}`)
const bad = results.filter((r) => !r[1])
console.log(`\n${results.length - bad.length}/${results.length} component behaviours`)
try {
  fs.rmSync(dir, { recursive: true, force: true })
} catch {}
if (bad.length) process.exitCode = 1
