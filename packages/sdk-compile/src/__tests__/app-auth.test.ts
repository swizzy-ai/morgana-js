import { describe, expect, it } from 'vitest'
import {
  AppAuth,
  buildServerAuth,
  handleSessionRoute,
  pageAccessRefusal,
  readSessionToken,
  serializeSessionCookie,
  type AppAuthStorage,
  type AppSessionRecord,
  type AppUserRecord,
} from '../server-host'

function memoryStorage() {
  const users = new Map<string, AppUserRecord>()
  const emails = new Map<string, string>()
  const sessions = new Map<string, AppSessionRecord>()
  const storage: AppAuthStorage = {
    getUser: async (id) => (users.has(id) ? structuredClone(users.get(id)!) : null),
    getUserIdByEmail: async (e) => emails.get(e) ?? null,
    putUser: async (u) => {
      users.set(u.id, structuredClone(u))
      emails.set(u.email, u.id)
    },
    putSession: async (h, s) => void sessions.set(h, s),
    getSession: async (h) => sessions.get(h) ?? null,
    deleteSession: async (h) => void sessions.delete(h),
  }
  return { storage, users, sessions }
}

describe('AppAuth', () => {
  it('signs up, resolves the session, and never exposes the hash', async () => {
    const m = memoryStorage()
    const auth = new AppAuth(m.storage)
    const s = await auth.signUp({ email: ' Ada@Example.com ', password: 'correct horse', name: 'Ada' })
    expect(s.user.email).toBe('ada@example.com')
    expect(s.user).not.toHaveProperty('passwordHash')
    expect((await auth.resolve(s.token))?.id).toBe(s.user.id)
    // Storage holds the token's hash, not the token.
    expect([...m.sessions.keys()]).not.toContain(s.token)
  })

  it('signs in with the right password only, one message for both failures', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    expect((await auth.signIn({ email: 'A@x.com', password: 'password-1' })).user.email).toBe('a@x.com')
    const wrong = await auth.signIn({ email: 'a@x.com', password: 'nope-nope' }).catch((e) => e)
    const missing = await auth.signIn({ email: 'b@x.com', password: 'nope-nope' }).catch((e) => e)
    expect(wrong.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(wrong.message).toBe(missing.message)
  })

  it('rejects duplicate emails, weak passwords and bad addresses', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    await expect(auth.signUp({ email: 'a@x.com', password: 'password-2' })).rejects.toMatchObject({ status: 409 })
    await expect(auth.signUp({ email: 'b@x.com', password: 'short' })).rejects.toMatchObject({ status: 400 })
    await expect(auth.signUp({ email: 'not-an-email', password: 'password-1' })).rejects.toMatchObject({ status: 400 })
  })

  it('a provider-only account never passes a password sign-in', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    await auth.createUser({ email: 'g@x.com', provider: 'google' })
    await expect(auth.signIn({ email: 'g@x.com', password: 'anything-at-all' })).rejects.toMatchObject({ status: 401 })
  })

  it('signOut revokes, and expired sessions resolve to null', async () => {
    const m = memoryStorage()
    const auth = new AppAuth(m.storage, { sessionTtlMs: 1 })
    const s = await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    await new Promise((r) => setTimeout(r, 5))
    expect(await auth.resolve(s.token)).toBeNull()
    const live = new AppAuth(m.storage)
    const s2 = await live.signIn({ email: 'a@x.com', password: 'password-1' })
    await live.signOut(s2.token)
    expect(await live.resolve(s2.token)).toBeNull()
  })

  it('roles and password changes persist', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    const { user } = await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    expect((await auth.setRoles(user.id, ['admin', 'admin', 'editor'])).roles).toEqual(['admin', 'editor'])
    await auth.setPassword(user.id, 'password-2')
    await expect(auth.signIn({ email: 'a@x.com', password: 'password-1' })).rejects.toMatchObject({ status: 401 })
    expect((await auth.signIn({ email: 'a@x.com', password: 'password-2' })).user.roles).toEqual(['admin', 'editor'])
  })
})

describe('server ctx.auth', () => {
  it('require throws 401/403, signIn reports the session to the host', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    const sessions: unknown[] = []
    const h = buildServerAuth({ auth, user: null, token: null, onSession: (s) => sessions.push(s) })
    expect(() => h.require()).toThrow(expect.objectContaining({ status: 401 }))
    const u = await h.signIn({ email: 'a@x.com', password: 'password-1' })
    expect(h.user?.id).toBe(u.id)
    expect(h.require().id).toBe(u.id)
    expect(() => h.require('admin')).toThrow(expect.objectContaining({ status: 403 }))
    expect(sessions).toHaveLength(1)
    await h.signOut()
    expect(h.user).toBeNull()
    expect(sessions[1]).toBeNull()
  })
})

describe('session transport', () => {
  it('reads the cookie (either name) or the explicit header, never Bearer', () => {
    expect(readSessionToken({ cookie: 'a=1; __Host-mg_session=tok; b=2' })).toBe('tok')
    expect(readSessionToken({ cookie: 'mg_session=dev' })).toBe('dev')
    expect(readSessionToken({ session: 'hdr', cookie: 'mg_session=dev' })).toBe('hdr')
    expect(readSessionToken({ cookie: 'other=1' })).toBeNull()
  })

  it('cookie attributes: HttpOnly, Lax, __Host- and Secure on https', () => {
    const c = serializeSessionCookie('t', { secure: true, maxAgeSeconds: 60 })
    expect(c).toMatch(/^__Host-mg_session=t; Path=\/; HttpOnly; SameSite=Lax; Max-Age=60; Secure$/)
    expect(serializeSessionCookie('t', { secure: false, maxAgeSeconds: 60 })).toMatch(/^mg_session=t;/)
  })

  it('handleSessionRoute: signup sets a cookie, session reads it, signout clears it', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    const up = await handleSessionRoute(auth, {
      method: 'POST', path: '/api/session/signup', token: null, secure: true,
      body: { email: 'a@x.com', password: 'password-1' },
    })
    expect(up?.status).toBe(200)
    const token = /__Host-mg_session=([^;]+)/.exec(up!.setCookie!)![1]!
    const who = await handleSessionRoute(auth, { method: 'GET', path: '/api/session', token, secure: true, body: null })
    expect((who!.body as { data: { user: { email: string } } }).data.user.email).toBe('a@x.com')
    const out = await handleSessionRoute(auth, { method: 'POST', path: '/api/session/signout', token, secure: true, body: null })
    expect(out!.setCookie).toMatch(/Max-Age=0/)
    expect(await auth.resolve(token)).toBeNull()
    const bad = await handleSessionRoute(auth, {
      method: 'POST', path: '/api/session/signin', token: null, secure: true,
      body: { email: 'a@x.com', password: 'wrong-pass' },
    })
    expect(bad?.status).toBe(401)
    expect(bad?.setCookie).toBeUndefined()
  })
})

describe('page access', () => {
  const user = { id: 'u', roles: ['editor'] }
  it('public, member, role', () => {
    expect(pageAccessRefusal(undefined, null)).toBeNull()
    expect(pageAccessRefusal('member', null)).toBe(401)
    expect(pageAccessRefusal('member', user)).toBeNull()
    expect(pageAccessRefusal({ role: ['admin'] }, user)).toBe(403)
    expect(pageAccessRefusal({ role: ['admin', 'editor'] }, user)).toBeNull()
  })
})

describe('one-time tokens', () => {
  it('password reset: works once, never as a session, unknown email gives null', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    expect(await auth.createPasswordReset('nobody@x.com')).toBeNull()
    const reset = (await auth.createPasswordReset('A@x.com'))!
    // A reset token is not a session.
    expect(await auth.resolve(reset.token)).toBeNull()
    const user = await auth.resetPassword(reset.token, 'password-2')
    expect(user.emailVerified).toBe(true)
    await expect(auth.resetPassword(reset.token, 'password-3')).rejects.toMatchObject({ status: 400 })
    await expect(auth.signIn({ email: 'a@x.com', password: 'password-1' })).rejects.toMatchObject({ status: 401 })
    expect((await auth.signIn({ email: 'a@x.com', password: 'password-2' })).user.email).toBe('a@x.com')
  })

  it('email verification: tokens are purpose-bound and single-use', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    const { user, token: session } = await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    const verify = await auth.createEmailVerification(user.id)
    // Neither kind of token can stand in for the other.
    await expect(auth.resetPassword(verify, 'password-9')).rejects.toMatchObject({ status: 400 })
    await expect(auth.verifyEmail(session)).rejects.toMatchObject({ status: 400 })
    const v2 = await auth.createEmailVerification(user.id)
    expect((await auth.verifyEmail(v2)).emailVerified).toBe(true)
    await expect(auth.verifyEmail(v2)).rejects.toMatchObject({ status: 400 })
  })

  it('expired tokens are refused', async () => {
    const auth = new AppAuth(memoryStorage().storage)
    await auth.signUp({ email: 'a@x.com', password: 'password-1' })
    const reset = (await auth.createPasswordReset('a@x.com'))!
    const realNow = Date.now
    Date.now = () => realNow() + 2 * 60 * 60 * 1000
    try {
      await expect(auth.resetPassword(reset.token, 'password-2')).rejects.toMatchObject({ status: 400 })
    } finally {
      Date.now = realNow
    }
  })
})
