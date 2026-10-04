#!/usr/bin/env node
/**
 * Mint a deploy token without a browser.
 *
 * This replaces the shared `DEPLOY_TOKEN` worker secret, which is gone. That
 * secret was one value behind which there was no person and no project: it
 * authorised uploading executable code into *any* project on the worker, it had
 * no expiry, nothing recorded who used it, and rotating it broke every holder at
 * once. There is no replacement for it, deliberately.
 *
 * What replaces the *capability* — deploying with no human present — is this: a
 * real sign-in over HTTP. `POST /api/v1/cli/authorize` creates the account on
 * first use, so a machine authenticates the same way a person does and gets a
 * token scoped to one project, expiring in 30 days, attributable to an identity.
 *
 * The identity is generated per run rather than configured. A CI job with a
 * checked-in email and password would be a shared credential with extra steps; a
 * random identity per run leaves nothing to leak and nothing to rotate, and each
 * run gets its own project, which is why the project id is reported back rather
 * than requested.
 *
 * Usage:
 *   node tools/mint-token.mjs <worker-url> [--email <who>] [--shell]
 *
 *   MORGANA_TOKEN=$(node tools/mint-token.mjs http://127.0.0.1:8787)
 *   eval "$(node tools/mint-token.mjs http://127.0.0.1:8787 --shell)"
 */
import process from 'node:process'

const argv = process.argv.slice(2)
const shell = argv.includes('--shell')
const envFile = argv.includes('--env')
if (shell && envFile) {
  process.stderr.write('--shell and --env are mutually exclusive (one quotes, one must not)\n')
  process.exit(2)
}

function flag(name) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) throw new Error(`--${name} needs a value`)
  return next
}

const positionals = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') ?? false))

if (!positionals.length) {
  process.stderr.write('usage: node tools/mint-token.mjs <worker-url> [--email <who>] [--shell]\n')
  process.exit(2)
}

const base = String(positionals[0]).replace(/\/+$/, '')
const run = process.env.GITHUB_RUN_ID ?? String(Date.now())
const email =
  flag('email') ||
  `ci-${run}-${Math.random().toString(36).slice(2, 8)}@morgana.test`
const password = process.env.MORGANA_TEST_PASSWORD || `pw-${Math.random().toString(36).slice(2, 24)}`

// The endpoint validates this shape even though nothing is listening on it: the
// grant endpoint is called directly for its token rather than being redirected to.
const redirectUri = 'http://127.0.0.1/callback'

const res = await fetch(`${base}/api/v1/cli/authorize`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, redirect_uri: redirectUri, scope: 'read write deploy' }),
})

const text = await res.text()
let body
try {
  body = JSON.parse(text)
} catch {
  process.stderr.write(`the worker answered with something that is not JSON (${res.status}): ${text.slice(0, 200)}\n`)
  process.exit(1)
}

if (!res.ok || !body?.success || !body?.data?.token) {
  process.stderr.write(`could not mint a token: ${res.status} ${body?.message ?? 'no token returned'}\n`)
  process.exit(1)
}

const { token, projectId } = body.data

const pairs = { MORGANA_TOKEN: token, MORGANA_PROJECT: projectId, MORGANA_IDENTITY: email }

if (envFile) {
  // For `>> "$GITHUB_ENV"`. NO QUOTES, the opposite of `--shell`, which is why
  // this is a separate mode: GitHub writes the value into the environment
  // verbatim, so quotes become part of the token. That sends `Bearer 'abc…'`, the
  // worker finds no such session, and the deploy fails 401 while every printed
  // value looks correct — which is exactly what happened.
  //
  // Unquoted is safe here for two reasons: the file is read by GitHub rather
  // than by a shell, and these values are hex/base64url with no spaces.
  process.stdout.write(`${Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('\n')}\n`)
} else if (shell) {
  // For `eval`. Quoted, because this one *is* read by a shell and a value that
  // reaches a shell unquoted is a shell injection.
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`
  process.stdout.write(`${Object.entries(pairs).map(([k, v]) => `${k}=${q(v)}`).join('\n')}\n`)
} else {
  process.stdout.write(`${token}\n`)
  process.stderr.write(`  project  ${projectId}\n  identity ${email}\n`)
}