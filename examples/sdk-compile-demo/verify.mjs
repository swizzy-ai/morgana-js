/**
 * Verify a deployed page the way a visitor meets it.
 *
 * Why this exists, concretely: the deploy pipeline reported success while
 * serving a page whose stylesheet and client runtime both 404'd. The page
 * returned 200. The deploy returned 200. Every status code was correct, and the
 * site was unstyled and completely inert — no CSS, no event handlers, no
 * bindings, nothing clickable. A status-code check cannot see that. Only a
 * browser can.
 *
 * So this drives a real browser and asserts the four things that have to be true
 * for a page to be alive:
 *
 *   1. no console errors and no uncaught exceptions
 *   2. no failed sub-resources (nothing 4xx/5xx behind the page)
 *   3. the stylesheet actually applied — verified by reading a computed value
 *      that only exists if the CSS was parsed, not merely downloaded
 *   4. the client runtime booted — `window.__morgana_run` is a function, which
 *      can only be true if client.js was fetched, parsed and executed
 *
 * and, with `--action <name>`, a fifth that is the one that actually proves the
 * backend is reachable: a real browser action invoked through the real runtime,
 * over the real transport, inside the real sandbox. That is the round trip a
 * user triggers by clicking, and it is the only check that would catch a broken
 * runtime key or a project that resolves to the wrong store.
 *
 * Usage:
 *   node verify.mjs --url https://host/apps/production/demo/main/landing
 *   node verify.mjs --url … --action loadStats
 *   node verify.mjs --url … --json
 *
 * Exit code is the point: 0 means the page is alive, 1 means it is not.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { findChrome } from './lib/chrome.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const url = arg('url', '')
const action = arg('action', '')
const asJson = process.argv.includes('--json')
const timeout = Number(arg('timeout', '20000'))

if (!url) {
  console.error('missing --url — the page to verify, e.g. https://host/apps/production/demo/main/landing')
  process.exit(1)
}

const chrome = findChrome()
if (!chrome) {
  // Not a soft failure, and there is deliberately no flag to make it one. A
  // deploy that cannot be verified has not been verified, and reporting success
  // anyway is the exact behaviour this file exists to stop. Fix the machine.
  console.error(
    'no Chrome/Chromium/Edge found — cannot verify.\n' +
      '  The candidate list is lib/chrome.mjs CHROME_CANDIDATES. Install a browser, or run\n' +
      '  this where one exists. There is no skip flag on purpose.',
  )
  process.exit(1)
}

/**
 * Console noise that is not the page's fault.
 *
 * Kept to an explicit list on purpose. A blanket ignore would hide the class of
 * failure this is meant to find, and every entry here is a third-party fetch
 * failing for reasons outside the deploy.
 */
const IGNORED_CONSOLE = [
  /favicon/i,
  /Failed to load resource.*fonts\.googleapis/i,
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED).*unpkg/i,
]

async function verify() {
  const browser = await chromium.launch({ executablePath: chrome })
  const context = await browser.newContext()
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  const failedResponses = []
  const checks = []

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return
    consoleErrors.push(text)
  })
  // An uncaught exception is the single most damning signal: the page threw
  // during boot and nothing else here would necessarily notice.
  page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)))
  page.on('response', (res) => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`)
  })
  page.on('requestfailed', (req) => {
    failedResponses.push(`FAILED ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`)
  })

  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: detail ?? '' })

  let response
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout })
  } catch (err) {
    await browser.close()
    return {
      url,
      ok: false,
      checks: [{ name: 'page loads', ok: false, detail: String(err?.message ?? err) }],
      consoleErrors,
      pageErrors,
      failedResponses,
    }
  }

  check('page loads', response && response.status() === 200, `status ${response?.status()}`)

  // Give first paint a beat: the client runtime boots on DOMContentLoaded and
  // its first paint is on a 0ms timeout after that.
  await page.waitForTimeout(600)

  // 3 — the stylesheet applied. Read a value that only a parsed stylesheet can
  // produce. `--background` is emitted on :root by the compiler's token layer, so
  // a resolved custom property means the CSS was fetched, parsed and applied;
  // a 200 that served base64 text, or a 404, or a 200 with a wrong content-type,
  // all leave it empty.
  const css = await page
    .evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const tokens = ['--background', '--foreground', '--primary', '--card', '--border']
        .map((n) => [n, root.getPropertyValue(n).trim()])
        .filter(([, v]) => v)
      const sheets = [...document.styleSheets].map((s) => {
        try {
          return s.cssRules.length
        } catch {
          return -1 // cross-origin, unreadable
        }
      })
      return {
        tokens,
        rules: sheets.reduce((n, r) => n + Math.max(r, 0), 0),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      }
    })
    .catch(() => ({ tokens: [], rules: 0, bodyBackground: '' }))

  check(
    'stylesheet applied',
    css.tokens.length > 0,
    css.tokens.length
      ? `resolved ${css.tokens.map(([n, v]) => `${n}=${v}`).join(' ')} across ${css.rules} rule(s)`
      : `no design tokens resolved — the stylesheet did not apply (body background ${css.bodyBackground || 'unknown'})`,
  )

  // 4 — the runtime booted.
  const runtime = await page
    .evaluate(() => {
      const run = window.__morgana_run
      const key = document.querySelector('meta[name="morgana-runtime-key"]')
      return {
        booted: typeof run === 'function',
        actions: Object.keys(window.__morgana_actions || {}).length,
        runtimeKey: key ? (key.getAttribute('content') || '').length : 0,
        project: document.querySelector('meta[name="morgana-project"]')?.getAttribute('content') ?? '',
        env: document.querySelector('meta[name="morgana-env"]')?.getAttribute('content') ?? '',
        entities: document.querySelectorAll('[data-entity]').length,
        bound: typeof window.__morgana_bindings === 'function' ? window.__morgana_bindings() : null,
      }
    })
    .catch(() => ({ booted: false, actions: 0, runtimeKey: 0, project: '', env: '', entities: 0, bound: null }))

  check(
    'client runtime booted',
    runtime.booted,
    runtime.booted
      ? `window.__morgana_run present, ${runtime.actions} client action(s), ${runtime.entities} rendered object(s), ${runtime.bound ?? '?'} live binding(s)`
      : 'window.__morgana_run is not a function — client.js did not execute',
  )
  check(
    'page carries a runtime key',
    runtime.runtimeKey > 0,
    runtime.runtimeKey ? 'present' : 'missing — action calls from this page will be refused',
  )
  check('page declares its project', Boolean(runtime.project), `project=${runtime.project || '(none)'} env=${runtime.env || '(none)'}`)

  // 1 and 2, asserted last so the reason is reported alongside the symptom.
  check('no uncaught exceptions', pageErrors.length === 0, pageErrors.join(' | '))
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '))
  check('no failed sub-resources', failedResponses.length === 0, failedResponses.join(' | '))

  // 5 — the round trip, if asked for.
  //
  // Two lanes, and picking the wrong one produces a misleading "unknown action"
  // for an action that is deployed and working fine:
  //
  //   browser action — bundled into client.js, so it is reachable from the page
  //     as `window.__morgana_actions[name]` and invoked via `__morgana_run`.
  //   server action — lives in the sandbox, not in the page bundle. Calling
  //     `__morgana_run` on it returns "unknown action" no matter how healthy the
  //     deploy is. These are invoked the way the page's own server-bound calls
  //     reach them: POST to the run endpoint, carrying the page's runtime key.
  //
  // So: try the page's own registry first, and fall back to the transport. Both
  // paths prove a different thing — the first that the bundle is wired, the
  // second that the key, the worker and the sandbox all agree.
  if (action) {
    let result
    try {
      result = await page.evaluate(
        async ({ name, runUrl }) => {
          const started = Date.now()
          const ms = () => Date.now() - started

          const inPage = typeof window.__morgana_actions?.[name] === 'function'
          if (inPage) {
            try {
              const value = await window.__morgana_run(
                name,
                {},
                { name: 'direct', origin: 'verify', element: null, payload: {}, timestamp: Date.now() },
              )
              return { ok: true, lane: 'browser', ms: ms(), value }
            } catch (err) {
              return { ok: false, lane: 'browser', ms: ms(), error: String(err?.message ?? err) }
            }
          }

          const meta = document.querySelector('meta[name="morgana-runtime-key"]')
          const project = document.querySelector('meta[name="morgana-project"]')?.getAttribute('content') ?? ''
          const env = document.querySelector('meta[name="morgana-env"]')?.getAttribute('content') ?? ''
          const headers = { 'Content-Type': 'application/json' }
          if (meta?.getAttribute('content')) headers['x-morgana-runtime'] = meta.getAttribute('content')

          const sep = runUrl.includes('?') ? '&' : '?'
          const qs = new URLSearchParams({ projectId: project, env }).toString()
          const res = await fetch(`${runUrl}${sep}${qs}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ params: {} }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok || body.success === false) {
            return {
              ok: false,
              lane: 'server',
              ms: ms(),
              error: `HTTP ${res.status}: ${body?.message ?? 'no message'}`,
            }
          }
          return { ok: true, lane: 'server', ms: ms(), value: body?.data?.result ?? body?.data }
        },
        { name: action, runUrl: `/api/actions/${encodeURIComponent(action)}/run` },
      )
    } catch (err) {
      result = { ok: false, lane: 'transport', ms: 0, error: String(err?.message ?? err) }
    }
    check(
      `action "${action}" round-trips`,
      result.ok,
      result.ok
        ? `${result.lane} lane, ${result.ms}ms: ${JSON.stringify(result.value)?.slice(0, 120)}`
        : `${result.lane} lane — ${result.error}`,
    )
  }

  const ok = checks.every((c) => c.ok)
  // A picture of the broken page, next to the errors that describe it. Only on
  // failure — there is no reason to render a screenshot of a working page.
  const screenshot = ok ? null : await page.screenshot({ fullPage: false }).catch(() => null)
  await browser.close()

  return {
    url,
    ok,
    checks,
    consoleErrors,
    pageErrors,
    failedResponses,
    metrics: { ...runtime, ...css },
    screenshot,
  }
}

const result = await verify()

if (asJson) {
  const { screenshot, ...rest } = result
  console.log(JSON.stringify(rest, null, 2))
} else {
  const mark = (ok) => (ok ? '  ok  ' : ' FAIL ')
  console.log(`verify  ${result.url}`)
  for (const c of result.checks) {
    console.log(`${mark(c.ok)} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  if (!result.ok) {
    if (result.pageErrors.length) console.error(`\nuncaught: ${result.pageErrors.join('; ')}`)
    if (result.consoleErrors.length) console.error(`console:  ${result.consoleErrors.join('; ')}`)
    if (result.failedResponses.length) console.error(`network:  ${result.failedResponses.join('; ')}`)
    // A picture of the broken page, next to the errors that describe it.
    if (result.screenshot) {
      const out = path.join('verify-failure.png')
      fs.writeFileSync(out, result.screenshot)
      console.error(`\nscreenshot: ${out}`)
    }
    console.error('\nThis deploy is live but the page is not usable. Not a success.')
  }
  // A single machine-readable verdict line, so a caller can report the outcome
  // without parsing the per-check lines. Always last.
  const passed = result.checks.filter((c) => c.ok).length
  console.log(`result  ${result.ok ? 'ok' : 'FAILED'} — ${passed}/${result.checks.length} checks passed`)
}

process.exit(result.ok ? 0 : 1)
