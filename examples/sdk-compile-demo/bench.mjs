/**
 * Bench — what does a compiled page actually cost?
 *
 * Builds the demo, serves dist/, then drives real Chrome over it and measures
 * the things that decide whether a page feels light:
 *
 *   CLS / LCP / FCP        from the browser's own performance entries
 *   transfer               raw / gzip / brotli per artefact
 *   DOM                    node count, and the weight per rendered object
 *   script cost            time to parse+execute client.js
 *   runtime cost           one state commit against a page of N bound rows
 *
 * The runtime numbers are the point: a commit should cost the records that
 * moved, not the size of the page.
 *
 * Usage: node bench.mjs [--runs 5] [--url http://localhost:4318]
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const dir = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(dir, 'dist')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const RUNS = Number(arg('runs', '5'))
const PORT = Number(arg('port', '4318'))
const BASE = `http://localhost:${PORT}`

const fmt = (n, d = 1) => (n === null || n === undefined ? '—' : Number(n).toFixed(d))
const kb = (n) => `${(n / 1024).toFixed(1)} kB`
const ms = (n) => `${fmt(n, 2)} ms`
const grade = (cls) =>
  cls === null ? '—' : cls < 0.1 ? 'good' : cls < 0.25 ? 'needs work' : 'poor'

/** What a visitor actually downloads: raw, gzip and brotli for one file. */
function wire(path_) {
  const buf = fs.readFileSync(path_)
  return {
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(buf).length,
  }
}

/** Installed before any page script so no shift is missed. */
const CLS_INIT = () => {
  window.__cls = 0
  window.__shifts = []
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue
      window.__cls += entry.value
      window.__shifts.push({
        value: entry.value,
        at: entry.startTime,
        nodes: (entry.sources || []).map((s) => ({
          tag: s.node?.nodeName ?? '?',
          entity: s.node?.getAttribute?.('data-entity') ?? null,
          kind: s.node?.getAttribute?.('data-kind') ?? null,
          from: [Math.round(s.previousRect.width), Math.round(s.previousRect.height)],
          to: [Math.round(s.currentRect.width), Math.round(s.currentRect.height)],
          top: Math.round(s.currentRect.top),
        })),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
  window.__lcp = null
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      window.__lcp = entries[entries.length - 1].startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch { /* not supported */ }
}

function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now()
  return (async () => {
    for (;;) {
      try {
        const res = await fetch(url)
        if (res.ok || res.status === 404) return true
      } catch { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return false
      await new Promise((r) => setTimeout(r, 250))
    }
  })()
}

async function main() {
  const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
  if (!chrome) throw new Error('no Chrome or Edge found')

  console.log('building…')
  execFileSync('node', ['build.mjs'], { cwd: dir, stdio: 'ignore' })

  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const stop = () => server.kill()
  process.on('exit', stop)

  try {
    if (!(await waitForServer(`${BASE}/`))) throw new Error('server never came up')

    // ── transfer sizes ──────────────────────────────────────────────────
    const artefacts = {}
    for (const rel of ['assets/client.js', 'assets/style.css', 'pages/bench.html', 'pages/landing.html']) {
      const full = path.join(dist, rel)
      if (fs.existsSync(full)) artefacts[rel] = wire(full)
    }
    let total = { raw: 0, gzip: 0, brotli: 0 }
    for (const v of Object.values(artefacts)) {
      total.raw += v.raw
      total.gzip += v.gzip
      total.brotli += v.brotli
    }

    console.log('\n─── transfer (what a visitor downloads) ───────────────────────────')
    console.log('artefact                      raw       gzip     brotli')
    for (const [rel, v] of Object.entries(artefacts)) {
      console.log(
        `${rel.padEnd(26)} ${kb(v.raw).padStart(8)} ${kb(v.gzip).padStart(9)} ${kb(v.brotli).padStart(10)}`,
      )
    }
    console.log(
      `${'TOTAL'.padEnd(26)} ${kb(total.raw).padStart(8)} ${kb(total.gzip).padStart(9)} ${kb(total.brotli).padStart(10)}`,
    )

    // ── drive the browser ───────────────────────────────────────────────
    const browser = await chromium.launch({ executablePath: chrome })

    // Prime the browser process. A freshly launched Chrome paints an empty
    // document before the real content arrives, which registers as a layout
    // shift against the first elements — an artifact of process startup, not
    // of the page. Warming it once separates the two. Each MEASURED run still
    // gets a fresh context, so the HTTP cache is empty: a cold first visit.
    {
      const warm = await browser.newContext()
      const p = await warm.newPage()
      await p.goto(`${BASE}/pages/home.html`, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await p.waitForTimeout(1500)
      await p.close()
      await warm.close()
    }

    const results = []
    const allShifts = []
    let dom = null
    let commit = null
    let warmResult = null
    let scaling = []

    for (let i = 0; i < RUNS; i++) {
      // A fresh context per run means an empty HTTP cache, so every run is a
      // COLD load — what a first-time visitor pays. Warming the cache and
      // measuring that too is the number that flatters frameworks.
      const context = await browser.newContext()
      const page = await context.newPage()
      // A real render, not a 0x0 viewport.
      await page.setViewportSize({ width: 1280, height: 900 })

      await page.addInitScript(CLS_INIT)

      await page.goto(`${BASE}/pages/bench.html`, { waitUntil: 'networkidle' })
      // Let first paint + the loaded action settle.
      await page.waitForFunction(() => window.__morgana_bindings() > 0, null, { timeout: 10_000 })
      await page.waitForTimeout(400)

      const measured = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        const paints = performance.getEntriesByType('paint')
        const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
        const scripts = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script')
        const fcpEntry = paints.find((p) => p.name === 'first-contentful-paint')
        return {
          cls: window.__cls,
          shifts: window.__shifts,
          fcp: fcpEntry ? fcpEntry.startTime : null,
          lcp: window.__lcp,
          domNodes: document.getElementsByTagName('*').length,
          entities: document.querySelectorAll('[data-entity]').length,
          bindings: window.__morgana_bindings(),
          stateSize: JSON.stringify(window.__morgana_state()).length,
          domReady: nav ? nav.domContentLoadedEventEnd : null,
          loadEnd: nav ? nav.loadEventEnd : null,
          scriptBytes: scripts.reduce((a, s) => a + (s.decodedBodySize || 0), 0),
          scriptTransfer: scripts.reduce((a, s) => a + (s.transferSize || 0), 0),
          resources: performance.getEntriesByType('resource').map((r) => ({
            name: r.name.split('/').slice(3).join('/') || r.name,
            start: r.startTime,
            end: r.responseEnd,
            size: r.decodedBodySize || 0,
          })),
        }
      })

      // Runtime cost: one commit on a page of N bound rows. Repeat it so the
      // number is a mean, not a first-call artefact.
      commit = await page.evaluate(async () => {
        const N = 200
        const set = window.__morgana_set
        // One row out of ROWS bound records.
        const PATH = 'bench.r3'
        // warm up
        for (let i = 0; i < 20; i++) set(PATH, i)
        const samples = []
        for (let i = 0; i < N; i++) {
          const t0 = performance.now()
          set(PATH, i)
          samples.push(performance.now() - t0)
        }
        samples.sort((a, b) => a - b)
        const at = (p) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))]
        // ── A/B: the algorithm Phase 1 replaced, run on this same DOM.
        // A faithful reimplementation of the removed per-commit scan, so the
        // comparison is like-for-like rather than a claim.
        const readState = () => {
          const el = document.getElementById('__MORGANA_STATE__')
          try { return el ? JSON.parse(el.textContent || '{}') : {} } catch { return {} }
        }
        const getPath = (root, p) => {
          if (!p) return root
          let cur = root
          for (const k of String(p).split('.')) { if (cur == null) return undefined; cur = cur[k] }
          return cur
        }
        const overlaps = (a, b) => {
          if (a === '' || b === '') return true
          return a === b || a.indexOf(b + '.') === 0 || b.indexOf(a + '.') === 0
        }
        const writeOld = (el, prop, value) => {
          if (value === undefined || value === null) return
          const s = String(value)
          if (prop === '*' || prop === 'content' || prop === 'label' || prop === 'text') {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.value = s
            else el.textContent = s
          } else if (prop === 'value') { if ('value' in el) el.value = s; else el.textContent = s }
          else if (prop === 'src' || prop === 'href' || prop === 'alt') el.setAttribute(prop, s)
          else el.setAttribute('data-prop-' + prop, s)
        }
        const oldCommit = (changed, value) => {
          const root = readState()
          const els = document.querySelectorAll('[data-bind]')
          for (let i = 0; i < els.length; i++) {
            const el = els[i]
            const spec = el.getAttribute('data-bind') || ''
            const parts = spec.split(';')
            for (let j = 0; j < parts.length; j++) {
              const kv = parts[j].split(':')
              if (kv.length < 2) continue
              const src = kv.slice(1).join(':')
              if (src && overlaps(src, changed)) { writeOld(el, kv[0], getPath(root, src)); break }
            }
          }
        }
        for (let i = 0; i < 20; i++) oldCommit(PATH, i)
        const oldSamples = []
        for (let i = 0; i < N; i++) {
          const t0 = performance.now()
          oldCommit(PATH, i)
          oldSamples.push(performance.now() - t0)
        }
        oldSamples.sort((a, b) => a - b)
        const oldAt = (p) => oldSamples[Math.min(oldSamples.length - 1, Math.floor(oldSamples.length * p))]

        return {
          p50: at(0.5), p95: at(0.95), p99: at(0.99), max: samples[samples.length - 1],
          oldP50: oldAt(0.5), oldP95: oldAt(0.95), oldP99: oldAt(0.99), oldMax: oldSamples[oldSamples.length - 1],
        }
      })

      scaling = await page.evaluate(async () => {
        // The claim under test: a commit costs the records that moved, so cost
        // must stay flat as the page grows. The 61-record page above is too
        // small to show it, so scale the bound set synthetically and measure
        // both algorithms at each size.
        const host = document.createElement('div')
        document.body.appendChild(host)
        const build = (n) => {
          host.textContent = ''
          window.__morgana_forget && [...host.children].forEach((c) => window.__morgana_forget(c))
          for (let i = 0; i < n; i++) {
            const el = document.createElement('p')
            el.setAttribute('data-bind', `*:scale.r${i}`)
            host.appendChild(el)
            window.__morgana_index(el)
          }
        }
        const readState = () => JSON.parse(document.getElementById('__MORGANA_STATE__').textContent || '{}')
        const getPath = (root, p) => { let c = root; for (const k of String(p).split('.')) { if (c == null) return undefined; c = c[k] } return c }
        const overlaps = (a, b) => a === '' || b === '' || a === b || a.startsWith(b + '.') || b.startsWith(a + '.')
        const writeOld = (el, prop, value) => {
          if (value == null) return
          const s = String(value)
          if (prop === '*' || prop === 'content' || prop === 'label' || prop === 'text') el.textContent = s
          else el.setAttribute('data-prop-' + prop, s)
        }
        const oldCommit = (changed) => {
          const root = readState()
          const els = document.querySelectorAll('[data-bind]')
          for (let i = 0; i < els.length; i++) {
            const el = els[i]
            const parts = (el.getAttribute('data-bind') || '').split(';')
            for (let j = 0; j < parts.length; j++) {
              const kv = parts[j].split(':')
              if (kv.length < 2) continue
              const src = kv.slice(1).join(':')
              if (src && overlaps(src, changed)) { writeOld(el, kv[0], getPath(root, src)); break }
            }
          }
        }
        const median = (a) => { a = [...a].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
        const out = []
        for (const n of [100, 1000, 5000]) {
          build(n)
          const set = window.__morgana_set
          const path = 'scale.r0'
          set(path, 0)
          for (let i = 0; i < 20; i++) { set(path, i); oldCommit(path) }
          const newS = [], oldS = []
          for (let i = 0; i < 120; i++) {
            let t = performance.now(); set(path, i); newS.push(performance.now() - t)
            t = performance.now(); oldCommit(path); oldS.push(performance.now() - t)
          }
          out.push({ n, index: median(newS), scan: median(oldS) })
        }
        host.remove()
        return out
      })

      dom = measured
      allShifts.push(...measured.shifts.map((sh) => ({ ...sh, run: i })))
      results.push(measured)

      // One warm navigation in the same context, for comparison.
      if (i === 0) {
        const warm = await context.newPage()
        await warm.addInitScript(CLS_INIT)
        await warm.goto(`${BASE}/pages/bench.html`, { waitUntil: 'networkidle' })
        await warm.waitForTimeout(500)
        warmResult = await warm.evaluate(() => ({
          cls: window.__cls,
          fcp: (performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint') || {}).startTime ?? null,
          domReady: (performance.getEntriesByType('navigation')[0] || {}).domContentLoadedEventEnd ?? null,
        }))
        await warm.close()
      }

      await page.close()
      await context.close()
    }
    await browser.close()

    const best = (key) => Math.min(...results.map((r) => r[key]).filter((v) => v !== null))
    const worst = (key) => Math.max(...results.map((r) => r[key]).filter((v) => v !== null))
    const mean = (key) => {
      const vals = results.map((r) => r[key]).filter((v) => v !== null)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }

    console.log(`\n─── rendering (${RUNS} runs, Chrome ${(await Promise.resolve('')) || ''}1280x900) ─────────────`)
    console.log(`CLS          ${fmt(worst('cls'), 4)}  (${grade(worst('cls'))})`)
    console.log(`FCP          ${ms(mean('fcp'))}`)
    console.log(`LCP          ${ms(mean('lcp'))}`)
    console.log(`DOM ready    ${ms(mean('domReady'))}`)
    console.log(`load         ${ms(mean('loadEnd'))}`)
    console.log(`
  cold = empty HTTP cache (a first visit). warm = cache primed.`)
    if (warmResult) {
      console.log(`  warm CLS      ${fmt(warmResult.cls, 4)}  ·  FCP ${ms(warmResult.fcp)}  ·  DCL ${ms(warmResult.domReady)}`)
    }

    console.log(`\n─── document ─────────────────────────────────────────────────────`)
    console.log(`DOM nodes          ${dom.domNodes}`)
    console.log(`rendered objects   ${dom.entities}`)
    console.log(`bound records      ${dom.bindings}`)
    console.log(`state JSON         ${kb(dom.stateSize)}`)
    console.log(`nodes per object   ${fmt(dom.entities ? dom.domNodes / dom.entities : 0, 2)}`)

    console.log(`\n─── runtime ──────────────────────────────────────────────────────`)
    console.log(`one state commit against ${dom.bindings} bound records:`)
    console.log(`  p50              ${ms(commit.p50)}`)
    console.log(`  p95              ${ms(commit.p95)}`)
    console.log(`  p99              ${ms(commit.p99)}`)
    console.log(`  max              ${ms(commit.max)}`)
    console.log(`
  the scan this replaced, same DOM, same path:`)
    console.log(`  old p50          ${ms(commit.oldP50)}`)
    console.log(`  old p95          ${ms(commit.oldP95)}`)
    console.log(`  old p99          ${ms(commit.oldP99)}`)
    console.log(`  old max          ${ms(commit.oldMax)}`)
    const ratio = commit.oldP95 > 0 ? commit.oldP95 / Math.max(commit.p95, 1e-4) : 0
    console.log(`  speedup p95      ${fmt(ratio, 1)}x`)

    console.log(`
─── commit cost vs page size (median, ms) ─────────────────────────`)
    console.log('bound records      index     per-commit scan   speedup')
    for (const row of scaling) {
      console.log(
        `${String(row.n).padStart(13)} ${fmt(row.index, 3).padStart(9)} ${fmt(row.scan, 3).padStart(17)} ` +
          `${(row.scan / Math.max(row.index, 1e-4)).toFixed(1).padStart(9)}x`,
      )
    }

    console.log(`
─── resource timeline (last run) ──────────────────────────────────`)
    for (const r of dom.resources) {
      console.log(`  ${r.name.padEnd(28)} ${fmt(r.start).padStart(8)} → ${fmt(r.end).padStart(8)} ms  ${kb(r.size)}`)
    }

    if (allShifts.length) {
      console.log(`\n─── layout shifts seen ───────────────────────────────────────────`)
      for (const s of allShifts.slice(0, 10)) {
        console.log(`  run ${s.run}  ${fmt(s.value, 5)}  at ${fmt(s.at)}ms`)
        for (const n of s.nodes) {
          console.log(
            `      <${n.tag.toLowerCase()}${n.entity ? ` data-entity="${n.entity}"` : ''}${n.kind ? ` data-kind="${n.kind}"` : ''}> ` +
              `${n.from[0]}x${n.from[1]} → ${n.to[0]}x${n.to[1]} @top=${n.top}`,
          )
        }
      }
    } else {
      console.log(`\nno layout shifts recorded`)
    }
  } finally {
    stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
