/**
 * A small client for the Chrome DevTools Protocol: start the machine's own
 * Chrome, Edge or Chromium headless, open tabs, send commands, hear events.
 * Node's own WebSocket; nothing to install. Used by `morgana demo`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { findBrowser } from './pdf.mjs'

/**
 * Start a headless browser and connect to it.
 * @returns {Promise<Browser>}
 */
export async function launch({ flags = [] } = {}) {
  const exe = findBrowser()
  if (!exe) throw new Error('This needs Chrome, Edge or Chromium on this machine. Install one, or set MORGANA_BROWSER to its path.')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-cdp-'))
  const child = spawn(exe, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
    // Nothing gets slowed down for being out of sight: recording runs on real time.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', ...flags, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  const wsUrl = await new Promise((resolve, reject) => {
    let err = ''
    const timer = setTimeout(() => reject(new Error(`the browser didn't open its debugging port: ${err.slice(-300)}`)), 30000)
    child.stderr.on('data', (d) => {
      err += d
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) { clearTimeout(timer); resolve(m[1]) }
    })
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`the browser exited (${code}): ${err.slice(-300)}`)) })
  })
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not connect to the browser')) })
  return new Browser(ws, child, profile)
}

export class Browser {
  #ws
  #child
  #profile
  #next = 1
  #pending = new Map()
  #listeners = new Set()

  constructor(ws, child, profile) {
    this.#ws = ws
    this.#child = child
    this.#profile = profile
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'))
      if (msg.id && this.#pending.has(msg.id)) {
        const { resolve, reject, method } = this.#pending.get(msg.id)
        this.#pending.delete(msg.id)
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
        else resolve(msg.result)
        return
      }
      if (msg.method) for (const l of this.#listeners) l(msg)
    }
  }

  /** One command; `session` for a tab's own commands. */
  send(method, params = {}, session) {
    const id = this.#next++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method })
      this.#ws.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
    })
  }

  /** Every event: `{ method, params, sessionId }`. Returns a function that stops listening. */
  on(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** A new tab, attached: its commands go through `tab.send`. */
  async tab(url = 'about:blank') {
    const { targetId } = await this.send('Target.createTarget', { url })
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true })
    const tab = {
      targetId,
      session: sessionId,
      send: (method, params) => this.send(method, params, sessionId),
      on: (method, fn) => this.on((m) => { if (m.sessionId === sessionId && m.method === method) fn(m.params) }),
      close: () => this.send('Target.closeTarget', { targetId }).catch(() => {}),
    }
    await tab.send('Page.enable')
    await tab.send('Runtime.enable')
    return tab
  }

  async close() {
    try { await this.send('Browser.close') } catch { /* already gone */ }
    try { this.#ws.close() } catch {}
    await new Promise((r) => (this.#child.exitCode !== null ? r() : this.#child.once('exit', r)))
    try { fs.rmSync(this.#profile, { recursive: true, force: true, maxRetries: 3 }) } catch { /* a helper may still hold it */ }
  }
}

/** Load a page in a tab and wait for it to finish loading. */
export async function goto(tab, url, timeout = 30000) {
  const loaded = new Promise((resolve) => {
    const off = tab.on('Page.loadEventFired', () => { off(); resolve() })
    setTimeout(() => { off(); resolve() }, timeout)
  })
  const r = await tab.send('Page.navigate', { url })
  if (r.errorText) throw new Error(`could not open ${url}: ${r.errorText}`)
  await loaded
}

/** Run an expression in the page and return its value. */
export async function evaluate(tab, expression) {
  const r = await tab.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result?.value
}

/**
 * Put a page in a state, the way the storyboard and demos need: after it has
 * loaded and its page-load actions have run, each key is set through the
 * runtime's own console hook (`__morgana_set`), so its conditions, lists and
 * `state:` actions all follow. Nothing in the page exists for this.
 */
export async function setPageState(tab, state, { settle = 650 } = {}) {
  if (!state || !Object.keys(state).length) return
  await sleep(settle)
  const ok = await evaluate(tab, `(() => {
    if (typeof window.__morgana_set !== 'function') return false
    const s = ${JSON.stringify(state)}
    for (const k of Object.keys(s)) window.__morgana_set(k, s[k])
    return true
  })()`)
  if (!ok) throw new Error('This page has no Morgana runtime to set state in.')
  await sleep(350)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
