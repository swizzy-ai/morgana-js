/**
 * The consent flow, without a browser.
 *
 * The parts worth asserting are the parts that protect a credential: the
 * callback binds loopback only, and the `state` nonce is what proves a response
 * belongs to the request this process started. Everything else here is
 * arrangement, but the arrangement is what the protections are bolted to.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { login, logout, credentialsPath, readCredentials } from '../commands/login.mjs'

const WORKER = 'https://morgana-server.example.workers.dev'

let home
let restore

function useScratchHome() {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-login-'))
  restore = process.env.MORGANA_HOME
  process.env.MORGANA_HOME = home
}

function restoreHome() {
  if (restore === undefined) delete process.env.MORGANA_HOME
  else process.env.MORGANA_HOME = restore
  if (home) fs.rmSync(home, { recursive: true, force: true })
}

afterEach(restoreHome)

/**
 * Run `login` and resolve with the loopback port and nonce.
 *
 * `onAuthorize` fires once the server is listening and before the wait begins,
 * which is the only moment the port is knowable — it is ephemeral, so it cannot
 * be predicted and must not be pinned. Listening is itself async, so `ready` is
 * a promise: reading the value synchronously after calling `login` gets
 * `undefined`.
 */
function startLogin(options = {}) {
  let resolveReady
  const ready = new Promise((resolve) => { resolveReady = resolve })
  const done = login({
    url: WORKER,
    timeout: 5_000,
    onAuthorize: (info) => resolveReady(info),
    ...options,
  })
  return { done, ready }
}

const post = (port, route, body) =>
  fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('morgana login', () => {
  it('stores the token when the callback returns the right state', async () => {
    useScratchHome()
    const { done, ready } = startLogin()
    const { port, state } = await ready

    const res = await post(port, '/token', {
      token: 'a-token',
      projectId: 'prj_x',
      expiresAt: '99999999999',
      state,
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Signed in')

    const result = await done
    expect(result.token).toBe('a-token')

    const stored = readCredentials()[WORKER]
    expect(stored.token).toBe('a-token')
    expect(stored.projectId).toBe('prj_x')
  })

  it('refuses a token whose state it did not issue', async () => {
    useScratchHome()
    const { done, ready } = startLogin()
    const { port } = await ready

    // Attached before the POST, not after. The refusal rejects `done` inside the
    // request handler, so awaiting the response first would leave the rejection
    // unhandled for a tick and Node reports it.
    const refused = expect(done).rejects.toThrow(/state this login did not start/)

    // Anything on the machine can reach a loopback port. Without the nonce, a
    // second local process could hand the CLI a token of its choosing and have
    // it stored as though a person had approved it.
    const res = await post(port, '/token', { token: 'not-mine', state: 'wrong' })
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('State mismatch')

    await refused
    expect(readCredentials()[WORKER]).toBeUndefined()
  })

  it('asks the worker for a loopback redirect and the scopes it was told to', async () => {
    useScratchHome()
    const { done, ready } = startLogin({ scope: 'read deploy' })
    const { authorizeUrl, port, state } = await ready

    const query = new URL(authorizeUrl).searchParams
    expect(authorizeUrl.startsWith(`${WORKER}/cli/authorize?`)).toBe(true)
    expect(query.get('redirect_uri')).toBe(`http://127.0.0.1:${port}/callback`)
    expect(query.get('scope')).toBe('read deploy')
    expect(query.get('state')).toBe(state)
    expect(query.get('client')).toBe('morgana-cli')

    done.catch(() => {}) // resolved by the timeout; only the URL matters here
  })

  it('serves a page that moves the fragment out of the browser', async () => {
    useScratchHome()
    const { done, ready } = startLogin()
    const { port } = await ready

    const res = await fetch(`http://127.0.0.1:${port}/callback`)
    expect(res.status).toBe(200)
    const page = await res.text()

    // The fragment is never sent to a server, so the callback cannot read the
    // token off its own request. This page is what bridges that: it reads
    // `location.hash` in the browser and posts it back.
    expect(page).toContain('location.hash')
    expect(page).toContain("'/token'")

    done.catch(() => {})
  })

  it('gives up rather than waiting forever when nothing comes back', async () => {
    useScratchHome()
    const { done, ready } = startLogin({ timeout: 300 })
    await ready
    await expect(done).rejects.toThrow(/no sign-in within/)
    // A denial produces no fragment and closes the window, so the CLI cannot
    // distinguish it from a person who walked away. It must never read either
    // as success.
    expect(readCredentials()[WORKER]).toBeUndefined()
  })
})

describe('morgana logout', () => {
  it('removes the stored token and says so when there was none', async () => {
    useScratchHome()
    fs.mkdirSync(home, { recursive: true })
    fs.writeFileSync(
      credentialsPath(),
      JSON.stringify({ [WORKER]: { token: 'x' } }),
    )

    expect(logout({ url: WORKER })).toBe(true)
    expect(readCredentials()[WORKER]).toBeUndefined()
    expect(logout({ url: WORKER })).toBe(false)
  })
})