import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { StoreEngine } from '../store.mjs'
import { createLocalAppAuth, pageGate } from '../app-auth.mjs'

const engine = () => new StoreEngine({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mg-store-')), 'm.db') })

describe('StoreEngine undeclared fields', () => {
  it('keep their type, as on the worker', () => {
    const s = engine()
    s.create('posts', { columns: [{ name: 'title', type: 'string' }] })
    const rec = s.add('posts', { title: 7, tags: ['a', 'b'], views: 3, meta: { x: 1 } })
    const back = s.get('posts', rec.id)
    expect(back.title).toBe('7')
    expect(back.tags).toEqual(['a', 'b'])
    expect(back.views).toBe(3)
    expect(back.meta).toEqual({ x: 1 })
  })
})

describe('local app auth', () => {
  it('round-trips users, roles and sessions through SQLite', async () => {
    const auth = createLocalAppAuth(engine())
    const s = await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    await auth.setRoles(s.user.id, ['admin'])
    const u = await auth.resolve(s.token)
    expect(u.roles).toEqual(['admin'])
    expect(typeof u.createdAt).toBe('number')
  })

  it('pageGate redirects anonymous visitors with next=, 403s the wrong role', async () => {
    const auth = createLocalAppAuth(engine())
    const req = (cookie) => ({ url: '/dash/', headers: cookie ? { cookie } : {} })
    expect(await pageGate(auth, { access: 'member', redirect: 'login' }, req())).toEqual({
      status: 302,
      location: '/login/?next=%2Fdash%2F',
    })
    const s = await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    const signedIn = req(`mg_session=${s.token}`)
    expect(await pageGate(auth, { access: 'member' }, signedIn)).toBeNull()
    expect((await pageGate(auth, { access: { role: ['admin'] } }, signedIn)).status).toBe(403)
  })
})
