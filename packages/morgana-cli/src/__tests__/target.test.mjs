/**
 * Target resolution and credential selection.
 *
 * Both of these were wrong in ways that presented as something else entirely,
 * which is why they are pinned here rather than left to the end-to-end deploy:
 *
 *   - the default backend never applied, because the command table hands absent
 *     string flags to `resolveTarget` as `''` and `??` does not treat `''` as
 *     absent. The symptom was `no credentials for ` with nothing after it.
 *   - `deploy` never read the stored credential, so `login` followed by `deploy`
 *     ignored the token that had just been minted and the worker answered 401.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BACKEND, resolveTarget, resolveCredential } from '../commands/deploy.mjs'

const ENV_KEYS = ['MORGANA_URL', 'MORGANA_PROJECT', 'MORGANA_TOKEN', 'MORGANA_HOME']
let saved

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('resolveTarget', () => {
  it('points at the Morgana cloud when nothing is specified', () => {
    expect(resolveTarget().base).toBe(DEFAULT_BACKEND)
  })

  it('points at the Morgana cloud for an empty url, which is what an absent flag is', () => {
    // `str(args, 'url')` answers '' for a flag nobody passed. Treating that as
    // "no url given" is the whole difference between the default working and
    // every command failing against an empty host.
    expect(resolveTarget({ url: '' }).base).toBe(DEFAULT_BACKEND)
    expect(resolveTarget({ url: '', project: '', env: '' }).base).toBe(DEFAULT_BACKEND)
  })

  it('lets --url win over the default', () => {
    process.env.MORGANA_URL = 'https://from-env.workers.dev'
    expect(resolveTarget({ url: 'https://self.hosted/' }).base).toBe('https://self.hosted')
  })

  it('lets MORGANA_URL win over the default', () => {
    process.env.MORGANA_URL = 'https://from-env.workers.dev'
    expect(resolveTarget().base).toBe('https://from-env.workers.dev')
  })

  it('strips trailing slashes so a pasted URL still builds valid routes', () => {
    expect(resolveTarget({ url: 'https://self.hosted///' }).base).toBe('https://self.hosted')
  })

  it('defaults the project and the environment', () => {
    expect(resolveTarget()).toMatchObject({ projectId: '__default', envName: 'production' })
  })
})

describe('resolveCredential', () => {
  const base = 'https://morgana-server.hello-ad4.workers.dev'

  it('prefers an explicit --token', async () => {
    process.env.MORGANA_TOKEN = 'from-env'
    const { bearer, source } = await resolveCredential({ base, token: 'from-flag' })
    expect(bearer).toBe('from-flag')
    expect(source).toBe('--token')
  })

  it('falls back to MORGANA_TOKEN, which is how CI runs unattended', async () => {
    process.env.MORGANA_TOKEN = 'from-env'
    const { bearer, source } = await resolveCredential({ base })
    expect(bearer).toBe('from-env')
    expect(source).toBe('MORGANA_TOKEN')
  })

  it('uses the stored token, so signing in once is enough', async () => {
    // This is the step that was missing: `login` wrote a credential that
    // `deploy` never read.
    process.env.MORGANA_HOME = mkdtemp()
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const home = process.env.MORGANA_HOME
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'credentials.json'), JSON.stringify({ [base]: { token: 'stored-token' } }))

    const { bearer, source } = await resolveCredential({ base })
    expect(bearer).toBe('stored-token')
    expect(source).toBe('stored')
  })

  it('fails fast with --no-login rather than opening a browser that cannot appear', async () => {
    process.env.MORGANA_HOME = mkdtemp()
    // A CI job that lost its token would otherwise wait the full timeout on a
    // consent window nobody is there to answer.
    await expect(resolveCredential({ base, allowLogin: false })).rejects.toThrow(/--no-login/)
  })
})

function mkdtemp() {
  const { mkdtempSync } = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  return mkdtempSync(path.join(os.tmpdir(), 'morgana-cred-'))
}