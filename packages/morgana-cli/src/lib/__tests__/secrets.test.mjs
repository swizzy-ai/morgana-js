import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildVarsHandle, localPrivateVars, readLocalSecrets, writeLocalSecrets } from '../secrets.mjs'
import { secrets } from '../../commands/secrets.mjs'
import { makeHostContext } from '../host-context.mjs'
import { StoreEngine } from '../store.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mg-secrets-'))

describe('local secrets', () => {
  it('set / list / remove through the command, in .morgana/secrets.json', async () => {
    const dir = tmp()
    await secrets({ action: 'set', name: 'RESEND_API_KEY', value: 're_1', local: true, dir })
    await secrets({ action: 'set', name: 'OTHER', value: 'x', local: true, dir })
    expect(readLocalSecrets(dir)).toEqual({ RESEND_API_KEY: 're_1', OTHER: 'x' })
    expect(await secrets({ action: 'list', local: true, dir })).toEqual(['OTHER', 'RESEND_API_KEY'])
    await secrets({ action: 'remove', name: 'OTHER', local: true, dir })
    expect(readLocalSecrets(dir)).toEqual({ RESEND_API_KEY: 're_1' })
  })

  it('rejects names that would not survive the worker', async () => {
    await expect(secrets({ action: 'set', name: 'bad-name', value: 'v', local: true, dir: tmp() })).rejects.toThrow(
      /invalid secret name/,
    )
  })

  it('MORGANA_VAR_ overrides the file and keeps its case', () => {
    const dir = tmp()
    writeLocalSecrets(dir, { API_KEY: 'file' })
    const vars = localPrivateVars(dir, { MORGANA_VAR_API_KEY: 'env', UNRELATED: 'no' })
    expect(vars.API_KEY).toBe('env')
    expect(vars.api_key).toBe('env')
    expect(vars.UNRELATED).toBeUndefined()
  })

  it('vars handle: reads durable, set is a per-invocation overlay', () => {
    const stored = { A: '1' }
    const h = buildVarsHandle(stored)
    h.set('A', '2')
    expect(h.get('A')).toBe('2')
    expect(buildVarsHandle(stored).get('A')).toBe('1')
    expect(h.getAll()).toEqual({ A: '2' })
  })

  it('ctx.vars in the dev host is the SDK handle, carrying secrets', async () => {
    const dir = tmp()
    const store = new StoreEngine({ file: path.join(dir, 'm.db') })
    const { ctx } = await makeHostContext({
      store,
      filesDir: path.join(dir, 'files'),
      config: { vars: { public: { siteName: 's' }, private: { RESEND_API_KEY: 're_1' } } },
    })
    expect(ctx.vars.get('siteName')).toBe('s')
    expect(ctx.vars.get('RESEND_API_KEY')).toBe('re_1')
  })
})
