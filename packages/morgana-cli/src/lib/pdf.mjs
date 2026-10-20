/**
 * PDFs on the dev host — `ctx.server.pdf(html)`.
 *
 * Prints an HTML page with the machine's own Chrome, Edge or Chromium in
 * headless mode, so the PDF is exactly what the page looks like in a browser,
 * with real, selectable text. The page sets its own paper size and margins
 * with CSS (`@page { size: A4; margin: 0 }`). Nothing to install.
 *
 * MORGANA_BROWSER points at a browser when it isn't in a usual place. The
 * cloud host prints with Cloudflare Browser Rendering behind the same call.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const PLACES = {
  win32: [
    ['PROGRAMFILES', 'Google/Chrome/Application/chrome.exe'],
    ['PROGRAMFILES(X86)', 'Google/Chrome/Application/chrome.exe'],
    ['LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'],
    ['PROGRAMFILES(X86)', 'Microsoft/Edge/Application/msedge.exe'],
    ['PROGRAMFILES', 'Microsoft/Edge/Application/msedge.exe'],
  ],
  darwin: [
    [null, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    [null, '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    [null, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  ],
}
const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']

let found
/** The browser that prints, or null. Looked up once. */
export function findBrowser(env = process.env) {
  if (env.MORGANA_BROWSER) return env.MORGANA_BROWSER
  if (found !== undefined) return found
  found = null
  for (const [base, rel] of PLACES[process.platform] ?? []) {
    const root = base ? env[base] : ''
    if (base && !root) continue
    const full = base ? path.join(root, rel) : rel
    if (fs.existsSync(full)) return (found = full)
  }
  for (const name of ON_PATH) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' })
    const hit = r.status === 0 && r.stdout.split(/\r?\n/)[0]?.trim()
    if (hit) return (found = hit)
  }
  return found
}

/** The `ctx.server.pdf` function. */
export function createPdf(env = process.env) {
  return async (html, opts = {}) => {
    if (typeof html !== 'string' || !html.trim()) throw new Error('ctx.server.pdf(html): html is the page to print, as a string')
    const browser = findBrowser(env)
    if (!browser) {
      throw new Error('ctx.server.pdf needs Chrome, Edge or Chromium on this machine to print with. Install one, or set MORGANA_BROWSER to its path.')
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-pdf-'))
    const page = path.join(dir, 'page.html')
    const out = path.join(dir, 'page.pdf')
    fs.writeFileSync(page, html)
    try {
      const args = [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        `--user-data-dir=${path.join(dir, 'profile')}`, '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
        `--virtual-time-budget=${opts.wait ?? 2000}`, `--print-to-pdf=${out}`, pathToUrl(page),
      ]
      await run(browser, args, opts.timeout ?? 60000)
      // Some browsers hand the work to a helper process and exit first: give the file a moment.
      for (let i = 0; i < 50 && !done(out); i++) await new Promise((r) => setTimeout(r, 200))
      if (!fs.existsSync(out)) throw new Error('ctx.server.pdf: the browser finished without writing a PDF')
      return new Uint8Array(fs.readFileSync(out))
    } finally {
      // A browser helper can still hold the profile for a moment; the temp folder is left to the OS then.
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
    }
  }
}

/** A finished PDF: present, and ending with its end-of-file marker. */
function done(file) {
  try { return fs.readFileSync(file).subarray(-1024).includes('%%EOF') } catch { return false }
}

function pathToUrl(p) {
  const slashed = path.resolve(p).replace(/\\/g, '/')
  return encodeURI(`file://${slashed.startsWith('/') ? '' : '/'}${slashed}`)
}

function run(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let err = ''
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error(`ctx.server.pdf: printing took longer than ${timeout} ms`)) }, timeout)
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`ctx.server.pdf: could not start ${cmd}: ${e.message}`)) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`ctx.server.pdf: the browser exited with ${code}${err ? `: ${err.trim().split('\n').pop()}` : ''}`))
    })
  })
}
