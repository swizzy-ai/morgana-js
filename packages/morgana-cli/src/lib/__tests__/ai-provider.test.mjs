// Where `morgana dev` gets its models: the Morgana cloud by default, with the
// token `morgana login` saved for it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localProvider } from '../ai.mjs'
import { DEFAULT_BACKEND } from '../../commands/deploy.mjs'

let home
const before = process.env.MORGANA_HOME
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-ai-'))
  process.env.MORGANA_HOME = home
})
afterEach(() => {
  if (before === undefined) delete process.env.MORGANA_HOME
  else process.env.MORGANA_HOME = before
})
const signIn = (base, token) => fs.writeFileSync(path.join(home, 'credentials.json'), JSON.stringify({ [base]: { token, projectId: 'p1' } }))

describe('models in morgana dev', () => {
  it('use the Morgana cloud and the saved login token, with nothing set', async () => {
    signIn(DEFAULT_BACKEND, 'tok-login')
    const p = await localProvider({})
    expect(p.config.baseUrl).toBe(DEFAULT_BACKEND)
    expect(p.config.token).toBe('tok-login')
    expect(p.signedIn).toBe(true)
  })

  it('follow MORGANA_URL, with the token saved for that server', async () => {
    signIn('https://my-morgana.example.com', 'tok-mine')
    const p = await localProvider({ MORGANA_URL: 'https://my-morgana.example.com/' })
    expect(p.config.baseUrl).toBe('https://my-morgana.example.com')
    expect(p.config.token).toBe('tok-mine')
  })

  it('prefer MORGANA_TOKEN to the saved one', async () => {
    signIn(DEFAULT_BACKEND, 'tok-login')
    const p = await localProvider({ MORGANA_TOKEN: 'tok-env' })
    expect(p.config.token).toBe('tok-env')
  })

  it('say when the machine is not signed in', async () => {
    const p = await localProvider({})
    expect(p.config.baseUrl).toBe(DEFAULT_BACKEND)
    expect(p.config.token).toBeUndefined()
    expect(p.signedIn).toBe(false)
  })

  it('leave another provider alone', async () => {
    const p = await localProvider({ MORGANA_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' })
    expect(p.config.provider).toBe('openai')
    expect(p.config.token).toBe('sk-test')
  })
})
