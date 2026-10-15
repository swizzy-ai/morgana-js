#!/usr/bin/env node
/**
 * Morgana page-performance benchmark.
 *
 * Measures a built `dist/` the way a visitor's browser sees it, and does a
 * static pass over the emitted artefacts. Reports the things Morgana controls:
 *
 *   - render-blocking resources (stylesheets, fonts, scripts)
 *   - the head/body script tags and whether they defer
 *   - CLS and where each shift came from (element attribution)
 *   - FCP / LCP / TTFB / DCL / load, long tasks, total blocking time
 *   - per-resource transfer sizes, and which were render-blocking
 *   - images with no width/height, no lazy decoding, no srcset
 *   - CSS size and how much of it is repeated theme token blocks
 *
 * Usage:
 *   node tools/perf.mjs                       # ../budding-gilgamesh/swizzy/dist
 *   node tools/perf.mjs --dist <dir>
 *   node tools/perf.mjs --url http://host/    # measure a running server instead
 *   node tools/perf.mjs --runs 5 --slow       # medians, Slow-4G + 4x CPU
 *   node tools/perf.mjs --json out.json
 *
 * A real Chrome/Edge is used (playwright-core with an explicit executable).
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))

const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  if (i < 0) return d
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const dist = String(flag('dist', path.join(root, '..', 'budding-gilgamesh', 'swizzy', 'dist')))
const urlArg = flag('url', null)
const runs = Number(flag('runs', 3))
const slow = Boolean(flag('slow', false))
const jsonOut = flag('json', null)
const browserPath =
  flag('browser', null) ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}
const mime = (p) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream'
const TEXTY = /^(text\/|application\/(javascript|json|xml)|image\/svg)/

// ── static pass: what is in the build, no browser ───────────────────────────

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, base, out)
    else out.push({ file: path.relative(base, full).split(path.sep).join('/'), bytes: fs.statSync(full).size })
  }
  return out
}

function staticReport(dir) {
  const files = walk(dir).sort((a, b) => b.bytes - a.bytes)
  const index = path.join(dir, 'pages', 'console.html')
  const indexFile = fs.existsSync(path.join(dir, 'index.html')) ? path.join(dir, 'index.html') : index
  const html = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : ''

  const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
  const scripts = scriptTags.map((t) => ({
    tag: t,
    src: /src="([^"]+)"/.exec(t)?.[1] ?? null,
    defer: /\bdefer\b/.test(t),
    async: /\basync\b/.test(t),
    module: /type="module"/.test(t),
    blocking: !/\b(defer|async)\b/.test(t) && !/type="module"/.test(t) && /src=/.test(t),
  }))

  const inlineStyle = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
  const imports = [...html.matchAll(/@import\s+url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2])

  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  const images = imgs.map((t) => ({
    src: /src="([^"]{0,60})/.exec(t)?.[1] ?? '',
    hasWidth: /\swidth="[^"]+"/.test(t) && !/\swidth="(stretch|hug|full)"/.test(t),
    hasHeight: /\sheight="[^"]+"/.test(t),
    lazy: /loading="lazy"/.test(t),
    asyncDecode: /decoding="async"/.test(t),
    fetchpriority: /fetchpriority="/.test(t),
    srcset: /srcset="/.test(t),
  }))

  let css = ''
  const cssPath = path.join(dir, 'assets', 'style.css')
  if (fs.existsSync(cssPath)) css = fs.readFileSync(cssPath, 'utf8')
  const varBlocks = [...css.matchAll(/\{([^{}]*--background[^{}]*)\}/g)].map((m) => m[1])
  const dupBytes = (() => {
    const seen = new Map()
    for (const b of varBlocks) seen.set(b, (seen.get(b) ?? 0) + 1)
    let wasted = 0
    for (const [b, n] of seen) wasted += (n - 1) * b.length
    return wasted
  })()

  const jsBytes = files.filter((f) => f.file.endsWith('.js')).reduce((a, f) => a + f.bytes, 0)
  const gz = (s) => (s ? zlib.gzipSync(Buffer.from(s), { level: 6 }).length : 0)

  return {
    files,
    totalBytes: files.reduce((a, f) => a + f.bytes, 0),
    indexBytes: html.length,
    indexGz: gz(html),
    cssGz: gz(css),
    scripts,
    hasBlockingScript: scripts.some((s) => s.blocking),
    inlineStyleImports: imports,
    images,
    imagesMissingDims: images.filter((i) => !i.hasWidth || !i.hasHeight).length,
    css: {
      bytes: css.length,
      imports: (css.match(/@import/g) ?? []).length,
      mediaQueries: (css.match(/@media/g) ?? []).length,
      entityRules: (css.match(/\[data-entity=/g) ?? []).length,
      kindRules: (css.match(/\[data-kind=/g) ?? []).length,
      varBlockOccurrences: varBlocks.length,
      duplicateVarBytes: dupBytes,
    },
    jsBytes,
  }
}

const gzOf = (p) => (fs.existsSync(p) ? zlib.gzipSync(fs.readFileSync(p), { level: 6 }).length : 0)

// ── static server ───────────────────────────────────────────────────────────

function serve(dir, gz = true) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    let file = path.join(dir, p)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const idx = path.join(dir, p, 'index.html')
      if (fs.existsSync(idx)) file = idx
      else if (p === '/') file = path.join(dir, 'index.html')
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    let body = fs.readFileSync(file)
    const type = mime(file)
    const headers = { 'content-type': type, 'cache-control': 'no-cache' }
    // A real Morgana host (Cloudflare) compresses text. Do the same, so the
    // critical-path bytes we measure are the ones a visitor actually gets.
    if (gz && TEXTY.test(type) && body.length > 1024 && /gzip/.test(String(req.headers['accept-encoding']))) {
      body = zlib.gzipSync(body, { level: 6 })
      headers['content-encoding'] = 'gzip'
    }
    headers['content-length'] = body.length
    res.writeHead(200, headers)
    res.end(body)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })))
}

// ── the in-page collector ───────────────────────────────────────────────────

const INIT = `(() => {
  const P = { shifts: [], lcp: [], longtasks: [], paints: {} };
  window.__perf = P;
  const describe = (n) => {
    if (!n) return '?';
    const el = n.nodeType === 3 ? n.parentElement : n;
    if (!el || !el.tagName) return '#text';
    const ent = el.getAttribute && el.getAttribute('data-entity');
    const kind = el.getAttribute && el.getAttribute('data-kind');
    return el.tagName.toLowerCase() + (ent ? '[data-entity=' + ent + ']' : '') + (kind ? '[data-kind=' + kind + ']' : '');
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.shifts.push({ value: e.value, sources: (e.sources||[]).map(s => describe(s.node)) }); })
      .observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lcp.push({ t: e.startTime, size: e.size, el: describe(e.element), url: e.url || '' }); })
      .observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push({ t: e.startTime, dur: e.duration, name: e.name }); })
      .observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.paints[e.name] = e.startTime; })
      .observe({ type: 'paint', buffered: true });
  } catch {}
})()`

async function measure(page, url, { slow }) {
  const context = page.context()
  const client = await context.newCDPSession(page)
  if (slow) {
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    })
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  const failed = []
  const consoleErrors = []
  page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText }))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  let cssUsage = null
  let jsCoverage = null
  try {
    await client.send('DOM.enable')
    await client.send('CSS.enable')
    await client.send('Profiler.enable')
    await client.send('CSS.startRuleUsageTracking')
    await client.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true })
  } catch {}

  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  // Let fonts swap and late layout shifts land.
  await page.waitForTimeout(2500)

  try {
    const r = await client.send('CSS.stopRuleUsageTracking')
    const used = new Set()
    let total = 0
    for (const u of r.ruleUsage) {
      if (u.used) used.add(`${u.styleSheetId}:${u.startOffset}`)
      total += u.endOffset - u.startOffset
    }
    cssUsage = { usedBytes: used.size ? [...r.ruleUsage].filter((u) => u.used).reduce((a, u) => a + (u.endOffset - u.startOffset), 0) : 0, totalRuleBytes: total, rules: r.ruleUsage.length }
  } catch {}
  try {
    const c = await client.send('Profiler.takePreciseCoverage')
    const byUrl = new Map()
    for (const s of c.result) {
      const url = s.url || 'anonymous'
      const ranges = []
      let total = 0
      for (const f of s.functions) for (const r of f.ranges) {
        if (r.endOffset > total) total = r.endOffset
        if (r.count > 0) ranges.push([r.startOffset, r.endOffset])
      }
      ranges.sort((a, b) => a[0] - b[0])
      let cov = 0
      let end = -1
      for (const [a, b] of ranges) {
        const start = Math.max(a, end)
        if (b > start) { cov += b - start; end = b }
      }
      const cur = byUrl.get(url) ?? { used: 0, total: 0 }
      byUrl.set(url, { used: cur.used + cov, total: Math.max(cur.total, total) })
    }
    jsCoverage = [...byUrl].map(([u, v]) => ({ url: u.replace(url.split('/').slice(0, 3).join('/'), ''), ...v }))
  } catch {}

  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {}
    const res = performance.getEntriesByType('resource').map((r) => ({
      name: r.name.replace(location.origin, ''),
      type: r.initiatorType,
      transfer: r.transferSize,
      encoded: r.encodedBodySize,
      decoded: r.decodedBodySize,
      dur: r.duration,
      renderBlocking: r.renderBlockingStatus || '',
    }))
    const fonts = []
    document.fonts.forEach((f) => fonts.push({ family: f.family, weight: f.weight, status: f.status }))
    const P = window.__perf || { shifts: [], lcp: [], longtasks: [], paints: {} }
    return {
      nav: {
        ttfb: nav.responseStart,
        domContentLoaded: nav.domContentLoadedEventEnd,
        load: nav.loadEventEnd,
        domInteractive: nav.domInteractive,
      },
      paints: P.paints,
      cls: P.shifts.reduce((a, s) => a + s.value, 0),
      shiftCount: P.shifts.length,
      shiftSources: P.shifts,
      lcp: P.lcp.at(-1) || null,
      longtasks: P.longtasks,
      tbt: P.longtasks.reduce((a, t) => a + Math.max(0, t.dur - 50), 0),
      resources: res,
      renderBlocking: res.filter((r) => r.renderBlocking === 'blocking'),
      fonts: [...new Set(fonts.map((f) => f.family + ' ' + f.weight))],
      domNodes: document.getElementsByTagName('*').length,
    }
  })
  data.failed = failed
  data.consoleErrors = consoleErrors
  data.wallMs = Date.now() - t0
  data.cssUsage = cssUsage
  data.jsCoverage = jsCoverage
  return data
}

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : 0
}
const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const ms = (n) => `${Math.round(n)} ms`

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  const stat = staticReport(dist)
  let base = urlArg
  let closeServer = () => {}
  if (!base) {
    const { server, port } = await serve(dist, !flag('no-gzip', false))
    base = `http://127.0.0.1:${port}/`
    closeServer = () => server.close()
  }

  let browser
  const { chromium } = require('playwright-core')
  try {
    browser = await chromium.launch({ executablePath: browserPath, headless: true })
  } catch (e) {
    console.error('could not launch a browser:', e.message)
    if (browserPath) console.error('tried:', browserPath)
    await closeServer()
    process.exit(1)
  }

  const perRun = []
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await context.addInitScript(INIT)
    const page = await context.newPage()
    const d = await measure(page, base, { slow })
    perRun.push(d)
    await context.close()
  }
  await browser.close()
  await closeServer()

  const med = {
    ttfb: median(perRun.map((r) => r.nav.ttfb)),
    fcp: median(perRun.map((r) => r.paints['first-contentful-paint'] ?? 0)),
    lcp: median(perRun.map((r) => r.lcp?.t ?? 0)),
    dcl: median(perRun.map((r) => r.nav.domContentLoaded)),
    load: median(perRun.map((r) => r.nav.load)),
    cls: median(perRun.map((r) => r.cls)),
    tbt: median(perRun.map((r) => r.tbt)),
    longtasks: median(perRun.map((r) => r.longtasks.length)),
    domNodes: perRun[0].domNodes,
    wall: median(perRun.map((r) => r.wallMs)),
  }

  const result = { dist, base, slow, runs, static: stat, perRun, median: med }
  const line = '─'.repeat(72)
  const H = (t) => `\n${line}\n${t}\n${line}`

  console.log(H(`Morgana perf — ${dist}`))
  console.log(`  served at        ${base}${slow ? '   [Slow-4G + 4x CPU]' : ''}`)
  console.log(`  runs             ${runs} (medians below)`)

  console.log(H('Build (static)'))
  const clientJs = path.join(dist, 'assets', 'client.js')
  console.log(`  total dist       ${kb(stat.totalBytes)}  in ${stat.files.length} files`)
  console.log(`  console.html     ${kb(stat.indexBytes)} raw / ${kb(stat.indexGz)} gzip`)
  console.log(`  client.js        ${kb(fs.existsSync(clientJs) ? fs.statSync(clientJs).size : stat.jsBytes)} raw / ${kb(gzOf(clientJs))} gzip`)
  console.log(`  style.css        ${kb(stat.css.bytes)} raw / ${kb(stat.cssGz)} gzip  (${stat.css.entityRules} entity rules, ${stat.css.kindRules} kind rules, ${stat.css.mediaQueries} @media)`)
  console.log(`  CSS theme waste  ~${kb(stat.css.duplicateVarBytes)} in ${stat.css.varBlockOccurrences} repeated token blocks`)
  console.log(`  blocking <script> ${stat.hasBlockingScript ? 'YES' : 'no'}`)
  for (const s of stat.scripts.filter((x) => x.src)) console.log(`      ${s.src}  ${s.blocking ? 'BLOCKING' : s.module ? 'module' : s.defer ? 'defer' : s.async ? 'async' : ''}`)
  const imports = [...new Set(stat.inlineStyleImports)]
  if (imports.length) console.log(`  render-blocking @import in head: ${imports.join(', ')}`)
  console.log(`  images           ${stat.images.length}, missing width/height: ${stat.imagesMissingDims}, lazy: ${stat.images.filter((i) => i.lazy).length}, srcset: ${stat.images.filter((i) => i.srcset).length}`)

  console.log(H('Timing (median)'))
  console.log(`  TTFB             ${ms(med.ttfb)}`)
  console.log(`  First paint/FCP  ${ms(med.fcp)}`)
  console.log(`  Largest paint    ${ms(med.lcp)}  ${perRun[0].lcp?.el ? '(' + perRun[0].lcp.el + ')' : ''}`)
  console.log(`  DOMContentLoaded ${ms(med.dcl)}`)
  console.log(`  load             ${ms(med.load)}`)
  console.log(`  wall to settle   ${ms(med.wall)}`)

  console.log(H('CLS & main-thread'))
  console.log(`  CLS              ${med.cls.toFixed(4)}  ${med.cls > 0.1 ? 'NEEDS WORK' : med.cls > 0 ? 'ok' : 'clean'}   (${perRun[0].shiftCount} shifts)`)
  console.log(`  long tasks       ${med.longtasks}    TBT ${ms(med.tbt)}`)
  console.log(`  DOM nodes        ${med.domNodes}`)
  const shiftAgg = new Map()
  for (const r of perRun) for (const s of r.shiftSources) for (const src of s.sources) shiftAgg.set(src, (shiftAgg.get(src) ?? 0) + s.value)
  if (shiftAgg.size) {
    console.log('  shifts from:')
    for (const [k, v] of [...shiftAgg].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${v.toFixed(4)}  ${k}`)
  }

  console.log(H('Resources (median run, by transfer)'))
  const resources = perRun[0].resources.sort((a, b) => b.transfer - a.transfer)
  for (const r of resources.slice(0, 20)) {
    console.log(`  ${String(r.transfer).padStart(8)} B  ${r.renderBlocking === 'blocking' ? 'BLOCK' : '     '}  ${r.type.padEnd(9)} ${r.dur.toFixed(0).padStart(5)}ms  ${r.name.slice(0, 60)}`)
  }
  if (perRun[0].renderBlocking.length) {
    console.log('  render-blocking:')
    for (const r of perRun[0].renderBlocking) console.log(`      ${r.name}  (${r.transfer} B)`)
  }
  console.log(`  external          ${resources.filter((r) => r.name.startsWith('http')).length} request(s)`)
  for (const r of resources.filter((r) => r.name.startsWith('http'))) console.log(`      ${r.name}`)
  if (perRun[0].failed.length) {
    console.log('  failed:')
    for (const f of perRun[0].failed) console.log(`      ${f.url}  ${f.err}`)
  }
  if (perRun[0].consoleErrors.length) {
    console.log('  console errors:')
    for (const c of perRun[0].consoleErrors.slice(0, 5)) console.log(`      ${c.slice(0, 100)}`)
  }
  console.log(`  fonts loaded      ${perRun[0].fonts.join(', ') || '(none reported)'}`)

  if (jsonOut) {
    fs.writeFileSync(String(jsonOut), JSON.stringify(dropObservers(result), null, 2))
    console.log(`\n  json → ${jsonOut}`)
  }
}

function dropObservers(r) {
  // Keep the report lean: the raw shift list is only useful interactively.
  return r
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
