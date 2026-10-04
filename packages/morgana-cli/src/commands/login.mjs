/**
 * `morgana login` — mint and store a CLI token.
 *
 * A token from this command is scoped to one person and one project, expires
 * after 30 days, and is recorded against an identity — so a deploy is
 * attributable to a person, and one person's credential cannot write into
 * another person's project.
 *
 * That is the reason this is the only way in. There is no shared deploy secret:
 * deploying means shipping code that runs, so the credential is scoped like the
 * thing it grants.
 *
 * The token is written to `~/.morgana/credentials.json` with 0600 on POSIX. It is
 * a bearer credential: anyone reading that file can deploy as this user, so the
 * write is as narrow as the machine allows.
 *
 * ## Why this opens a browser
 *
 * The worker is the authority on what a CLI token is, and it says a token is
 * minted for a *verified identity*, behind a permission screen that lists the
 * scopes being asked for. So this command drives that flow rather than
 * short-circuiting it:
 *
 *   1. a loopback server opens on 127.0.0.1:<ephemeral>
 *   2. the browser goes to GET /cli/authorize?redirect_uri=…&state=…&scope=…
 *   3. the worker renders the consent screen; the person signs in and allows
 *   4. the worker mints a token and sends the browser to
 *      `redirect_uri#token=…&projectId=…&state=…`
 *   5. step 6 below captures it
 *
 * ## Why the token comes back in a fragment, and what that costs
 *
 * Step 4 puts the credential in the URL *fragment*, which by definition is never
 * sent to a server — the callback server receives a bare `GET /callback`. That is
 * not an obstacle to work around, it is the property that makes this safe: the
 * token does not pass through a request line, so it cannot land in an access log,
 * a proxy log or a `Referer`. It also means step 5 cannot be the server reading
 * its own request, so the callback route serves one small page that reads
 * `location.hash` and posts it back to `/token`.
 *
 * The consequence to be honest about: a *denied* request produces no fragment,
 * and the consent screen's Deny button simply closes the window. Nothing tells
 * this process what happened, so the wait is bounded by `--timeout` rather than
 * ending on its own. A denial is reported as a timeout, which is imprecise but
 * never a false success.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

import { say, row, bold, green, dim, warn } from '../ui.mjs'
import { resolveTarget } from './deploy.mjs'

/** Where the token lives. Overridable so a CI job can use a scratch path. */
export function credentialsPath() {
  const home = process.env.MORGANA_HOME || path.join(os.homedir(), '.morgana')
  return path.join(home, 'credentials.json')
}

export function readCredentials(file = credentialsPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // No credentials file is the normal first-run state, not an error.
    return {};
  }
}

function writeCredentials(creds, file = credentialsPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 })
}

/**
 * Hand a URL to the person's default browser.
 *
 * The platform opener, not a Chrome we locate ourselves: this is "show the
 * person a page", and the OS already knows which browser that is. Failure is not
 * fatal — the URL is printed either way, so a machine with no browser (a
 * container, an SSH session) can still finish by opening the link by hand.
 */
function openBrowser(url) {
  const table = {
    darwin: ['open', [url]],
    win32: ['cmd', ['/c', 'start', '', url]],
  }
  const [cmd, argv] = table[process.platform] ?? ['xdg-open', [url]]
  try {
    const child = spawn(cmd, argv, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

/**
 * The page served at the redirect target.
 *
 * It exists only to move the credential out of the fragment and into a POST body.
 * `location.hash` is same-document, so this never leaves the browser except as
 * the body of a loopback request to the server that just served this page.
 */
function capturePage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Morgana CLI</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;
       margin:0;background:#120a10;color:#f3e8f0}
  .card{text-align:center;max-width:420px;padding:32px}
  h1{color:#f033a8;font-size:18px;letter-spacing:.5px;margin:0 0 10px}
  p{color:#a38da0;font-size:14px;line-height:1.6;margin:0}
  code{background:#251622;border:1px solid #3a2333;border-radius:6px;padding:2px 6px;font-size:13px}
</style></head>
<body><div class="card">
  <h1>&#10022; MORGANA</h1>
  <p id="m">Signing you in&hellip;</p>
</div>
<script>
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const done = (html) => { document.getElementById('m').innerHTML = html; };
  if (!p.get('token')) {
    // The worker redirects with an error rather than a token when it refuses.
    done('Authorization did not complete. You can close this tab.');
  } else {
    fetch('/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: p.get('token'),
        projectId: p.get('projectId'),
        expiresAt: p.get('expiresAt'),
        state: p.get('state'),
      }),
    })
      .then((r) => r.text())
      .then((html) => done(html))
      .catch(() => done('Could not reach the CLI. Return to your terminal.'));
  }
</script>
</body></html>`
}

function html(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>Morgana CLI</title><style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;
       margin:0;background:#120a10;color:#f3e8f0}
  .card{text-align:center;max-width:420px;padding:32px}
  h1{color:#f033a8;font-size:18px;letter-spacing:.5px;margin:0 0 10px}
  p{color:#a38da0;font-size:14px;line-height:1.6;margin:0}
</style></head><body><div class="card">${body}</div></body></html>`
}

/**
 * `morgana login` — run the consent flow and store the resulting token.
 *
 * Binds loopback only. `0.0.0.0` would make the callback reachable from the
 * network, which turns "a person on this machine approved a token" into
 * "anything that can reach this port can hand the CLI a token".
 */
export async function login({ url, scope, timeout = 300_000, env, onAuthorize } = {}) {
  const { base, projectId: requested } = resolveTarget({ url, project: undefined, env })


  const state = randomBytes(24).toString('hex')
  const scopes = scope || 'read write deploy'

  let settle
  const captured = new Promise((resolve, reject) => {
    settle = { resolve, reject }
  })

  const server = http.createServer((req, res) => {
    // Only this machine may talk to the callback.
    const remote = req.socket.remoteAddress ?? ''
    if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
      res.writeHead(403).end()
      return
    }

    const route = (req.url ?? '').split('?')[0]

    if (route === '/callback' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(capturePage())
      return
    }

    if (route === '/token' && req.method === 'POST') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        let body
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          res.writeHead(400).end(html('<p>Malformed callback.</p>'))
          return
        }

        // The nonce is what proves this response belongs to the request this
        // process started. Without it, any local process can post a token of its
        // choosing and have it stored as though the user had approved it.
        if (body?.state !== state) {
          res.writeHead(400).end(html('<p>State mismatch — refusing this token.</p>'))
          settle.reject(new Error('the callback returned a state this login did not start — refused'))
          return
        }
        if (!body?.token) {
          res.writeHead(400).end(html('<p>No token in the callback.</p>'))
          settle.reject(new Error('the worker redirected without a token'))
          return
        }

        res
          .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          .end(html('<h1>&#10022; MORGANA</h1><p>Signed in. You can close this tab and return to your terminal.</p>'))
        settle.resolve(body)
      })
      return
    }

    res.writeHead(404).end(html('<p>Not found.</p>'))
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const redirect = `http://127.0.0.1:${port}/callback`
  const params = new URLSearchParams({
    redirect_uri: redirect,
    state,
    scope: scopes,
    client: 'morgana-cli',
  })
  const authorizeUrl = `${base}/cli/authorize?${params}`

  // The one seam in this file. A person watching the terminal needs the URL
  // printed; a test needs to reach the loopback port, and it cannot get there by
  // scraping stdout without asserting on the exact wording of the output.
  if (onAuthorize) {
    onAuthorize({ authorizeUrl, port, state })
  } else {
    say(`${bold('morgana')} ${dim('·')} opening your browser to sign in`)
    say(row('worker', base))
    if (requested) say(row('project', requested))
    say(row('scopes', scopes))
    say()
    say(dim('  ' + authorizeUrl))
    say()

    if (!openBrowser(authorizeUrl)) {
      warn('could not launch a browser — open the link above by hand')
    }
  }

  // A denied request produces no fragment and the consent screen just closes the
  // window, so nothing tells this process what happened. The wait is therefore
  // bounded, and a denial surfaces as a timeout — imprecise, but never a
  // false success.
  let timer
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `no sign-in within ${Math.round(timeout / 1000)}s.
` +
              '  The consent window may have been closed or denied. Nothing was stored.',
          ),
        ),
      timeout,
    )
  })

  try {
    const result = await Promise.race([captured, expiry])

    const file = credentialsPath()
    const creds = readCredentials(file)
    writeCredentials(
      {
        ...creds,
        [base]: {
          token: result.token,
          projectId: result.projectId ?? requested ?? '__default',
          scope: scopes,
          expiresAt: result.expiresAt ? Number(result.expiresAt) : undefined,
        },
      },
      file,
    )

    say(`${green('logged in')} to ${bold(base)}`)
    say(row('token', 'stored in ' + file))
    say(row('project', String(result.projectId ?? requested ?? '__default')))
    say()
    warn('That file is a bearer credential — anyone who can read it can deploy as you.')
    return { token: result.token, projectId: result.projectId }
  } finally {
    clearTimeout(timer)
    // Every exit closes the listener. A refused token and an expired wait are
    // both failures, and neither may leave a port open on the machine.
    server.close()
  }
}

/**
 * `morgana logout` — forget the stored token for this worker.
 *
 * Only the local copy is removed. A token already minted stays valid server-side
 * until it expires, so this is "stop using it here", not "revoke it".
 */
export function logout({ url } = {}) {
  const { base } = resolveTarget({ url })
  const file = credentialsPath()
  const creds = readCredentials(file)
  if (!creds[base]) {
    say('no stored credentials for that worker')
    return false
  }
  delete creds[base]
  writeCredentials(creds, file)
  say(`${green('logged out')} — removed the stored token for ${base}`)
  return true
}