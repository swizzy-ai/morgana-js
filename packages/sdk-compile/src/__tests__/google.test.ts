import { beforeEach, describe, expect, it } from 'vitest'
import { AppAuth, clearGoogleKeyCache, handleSessionRoute, verifyGoogleIdToken } from '../server-host'

const b64url = (bytes: Uint8Array | string) => {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function keypair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as JsonWebKey
  return { kp, jwk: { kid: 'k1', kty: 'RSA', n: jwk.n!, e: jwk.e!, alg: 'RS256' } }
}

async function sign(priv: CryptoKey, payload: Record<string, unknown>, kid = 'k1') {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))
  const p = b64url(JSON.stringify(payload))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(`${h}.${p}`))
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`
}

const CLIENT = 'client-123.apps.googleusercontent.com'
const now = Math.floor(Date.now() / 1000)
const good = {
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  sub: '1234',
  email: 'Ada@Example.com',
  email_verified: true,
  exp: now + 600,
  name: 'Ada',
}

describe('verifyGoogleIdToken', () => {
  beforeEach(() => clearGoogleKeyCache())

  it('accepts a correctly signed, fresh, verified token for our client', async () => {
    const { kp, jwk } = await keypair()
    const fetchJwks = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch
    const id = await verifyGoogleIdToken(await sign(kp.privateKey, good), { clientId: CLIENT, fetch: fetchJwks })
    expect(id).toEqual({ sub: '1234', email: 'ada@example.com', name: 'Ada' })
  })

  it('refuses every way a token can be untrustworthy', async () => {
    const { kp, jwk } = await keypair()
    const other = await keypair()
    const fetchJwks = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch
    const opts = { clientId: CLIENT, fetch: fetchJwks }
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['forged signature', async () => verifyGoogleIdToken(await sign(other.kp.privateKey, good), opts)],
      ['other app', async () => verifyGoogleIdToken(await sign(kp.privateKey, { ...good, aud: 'evil' }), opts)],
      ['wrong issuer', async () => verifyGoogleIdToken(await sign(kp.privateKey, { ...good, iss: 'https://evil.com' }), opts)],
      ['expired', async () => verifyGoogleIdToken(await sign(kp.privateKey, { ...good, exp: now - 3600 }), opts)],
      ['unverified email', async () => verifyGoogleIdToken(await sign(kp.privateKey, { ...good, email_verified: false }), opts)],
      ['unknown key', async () => verifyGoogleIdToken(await sign(kp.privateKey, good, 'nope'), opts)],
      ['garbage', async () => verifyGoogleIdToken('not.a.jwt', opts)],
      ['no client id', async () => verifyGoogleIdToken(await sign(kp.privateKey, good), { clientId: '', fetch: fetchJwks })],
    ]
    for (const [name, run] of cases) {
      await expect(run(), name).rejects.toMatchObject({ status: 401 })
    }
  })
})

describe('Google sign-in through the session route', () => {
  beforeEach(() => clearGoogleKeyCache())

  function memoryAuth() {
    const users = new Map<string, any>()
    const emails = new Map<string, string>()
    const sessions = new Map<string, any>()
    return new AppAuth({
      getUser: async (id) => users.get(id) ?? null,
      getUserIdByEmail: async (e) => emails.get(e) ?? null,
      putUser: async (u) => void (users.set(u.id, u), emails.set(u.email, u.id)),
      putSession: async (h, s) => void sessions.set(h, s),
      getSession: async (h) => sessions.get(h) ?? null,
      deleteSession: async (h) => void sessions.delete(h),
    })
  }

  it('creates the user, links an existing email account, refuses a forged token', async () => {
    const { kp, jwk } = await keypair()
    const fetchJwks = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch
    const auth = memoryAuth()
    const existing = await auth.signUp({ email: 'ada@example.com', password: 'password-1' })
    const req = (credential: string) => ({
      method: 'POST', path: '/api/session/google', token: null, secure: true, body: { credential },
    })
    const ok = await handleSessionRoute(auth, req(await sign(kp.privateKey, good)), { googleClientId: CLIENT, fetch: fetchJwks })
    expect(ok?.status).toBe(200)
    expect((ok?.body as any).data.user.id).toBe(existing.user.id)
    expect(ok?.setCookie).toMatch(/^__Host-mg_session=/)

    const fresh = await handleSessionRoute(auth, req(await sign(kp.privateKey, { ...good, email: 'new@example.com', sub: '9' })), { googleClientId: CLIENT, fetch: fetchJwks })
    expect((fresh?.body as any).data.user.provider).toBe('google')
    // A Google-created account has no password: password sign-in is refused.
    await expect(auth.signIn({ email: 'new@example.com', password: 'anything-1' })).rejects.toMatchObject({ status: 401 })

    const other = await keypair()
    const forged = await handleSessionRoute(auth, req(await sign(other.kp.privateKey, good)), { googleClientId: CLIENT, fetch: fetchJwks })
    expect(forged?.status).toBe(401)
    expect(forged?.setCookie).toBeUndefined()

    const unconfigured = await handleSessionRoute(auth, req('x.y.z'), {})
    expect(unconfigured?.status).toBe(501)
  })
})
