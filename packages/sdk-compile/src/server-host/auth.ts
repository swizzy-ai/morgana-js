/**
 * App auth — the end-users of a project, written once for both hosts.
 *
 * These are the people who sign up to *your app*, not members of the Morgana
 * project. The two must never share a store: a project member can deploy code,
 * so an app user that resolved as one could too. Each host gives this core its
 * own storage (KV on the worker under an `appauth:` namespace, SQLite under
 * `morgana dev`) and nothing else — hashing, sessions and validation live here
 * so the two hosts cannot drift.
 *
 * Sessions are opaque random tokens carried in an HttpOnly cookie. Storage
 * keeps only the token's SHA-256, so a leaked store holds no live sessions.
 */
import type { AuthUser } from '@morgana/sdk'

// ── Password hashing ────────────────────────────────────────────────────────
// PBKDF2-HMAC-SHA-256 via WebCrypto (present on workerd and Node ≥ 20). The
// stored form `pbkdf2$<iter>$<saltHex>$<hashHex>` matches the worker's platform
// auth, so a record is readable by either.

export const PBKDF2_ITERATIONS = 100_000
const PBKDF2_PREFIX = 'pbkdf2'

const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    material,
    256,
  )
  return toHex(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${toHex(salt)}$${await derive(password, salt, PBKDF2_ITERATIONS)}`
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** False for anything malformed — a bad record fails closed, never open. */
export async function verifyPassword(password: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored || typeof stored !== 'string') return false
  const [prefix, iter, saltHex, expected] = stored.split('$')
  const iterations = Number(iter)
  if (prefix !== PBKDF2_PREFIX || !Number.isFinite(iterations) || iterations < 1 || !saltHex || !expected) return false
  try {
    return timingSafeEqual(await derive(password, fromHex(saltHex), iterations), expected)
  } catch {
    return false
  }
}

/** Spent on the missing-user path so "no such account" costs what a wrong password does. */
const DUMMY_HASH = `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`

// ── Records and storage ─────────────────────────────────────────────────────

export interface AppUserRecord {
  id: string
  email: string
  name?: string
  roles: string[]
  provider: string
  createdAt: number
  /** Absent for provider-only accounts, which therefore never pass a password sign-in. */
  passwordHash?: string
  [key: string]: unknown
}

export interface AppSessionRecord {
  userId: string
  expiresAt: number
}

/** What a host supplies. Every method is one bounded read or write — no listing. */
export interface AppAuthStorage {
  getUser(id: string): Promise<AppUserRecord | null>
  getUserIdByEmail(email: string): Promise<string | null>
  /** Writes the record and its email index. */
  putUser(user: AppUserRecord): Promise<void>
  putSession(tokenHash: string, session: AppSessionRecord): Promise<void>
  getSession(tokenHash: string): Promise<AppSessionRecord | null>
  deleteSession(tokenHash: string): Promise<void>
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function publicUser(rec: AppUserRecord): AuthUser {
  const { passwordHash: _omit, ...rest } = rec
  return { ...rest, roles: [...(rec.roles ?? [])] } as AuthUser
}

async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

const randomToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)))
const randomId = () => `usr_${toHex(crypto.getRandomValues(new Uint8Array(10)))}`
const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '')

export interface IssuedSession {
  user: AuthUser
  token: string
  expiresAt: number
}

export class AppAuth {
  constructor(
    private storage: AppAuthStorage,
    private opts: { sessionTtlMs?: number; minPasswordLength?: number } = {},
  ) {}

  private get ttl() {
    return this.opts.sessionTtlMs ?? SESSION_TTL_MS
  }

  async createUser(input: {
    email: string
    password?: string
    name?: string
    roles?: string[]
    provider?: string
  }): Promise<AuthUser> {
    const email = normEmail(input.email)
    if (!EMAIL_RE.test(email)) throw new AuthError('A valid email is required', 400)
    const min = this.opts.minPasswordLength ?? MIN_PASSWORD_LENGTH
    if (input.password !== undefined && (typeof input.password !== 'string' || input.password.length < min)) {
      throw new AuthError(`Password must be at least ${min} characters`, 400)
    }
    if (await this.storage.getUserIdByEmail(email)) {
      throw new AuthError('An account with that email already exists', 409)
    }
    const rec: AppUserRecord = {
      id: randomId(),
      email,
      ...(typeof input.name === 'string' && input.name.trim() ? { name: input.name.trim() } : {}),
      roles: Array.isArray(input.roles) ? input.roles.map(String) : [],
      provider: input.provider ?? 'email',
      createdAt: Date.now(),
      ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
    }
    await this.storage.putUser(rec)
    return publicUser(rec)
  }

  async startSession(userId: string): Promise<{ token: string; expiresAt: number }> {
    const token = randomToken()
    const expiresAt = Date.now() + this.ttl
    await this.storage.putSession(await sha256Hex(token), { userId, expiresAt })
    return { token, expiresAt }
  }

  async signUp(input: { email: string; password: string; name?: string }): Promise<IssuedSession> {
    if (typeof input?.password !== 'string') throw new AuthError('A password is required', 400)
    const user = await this.createUser({ email: input.email, password: input.password, name: input.name })
    return { user, ...(await this.startSession(user.id)) }
  }

  async signIn(input: { email: string; password: string }): Promise<IssuedSession> {
    const email = normEmail(input?.email)
    const password = typeof input?.password === 'string' ? input.password : ''
    if (!email || !password) throw new AuthError('Email and password are required', 400)
    // One message for "no such account" and "wrong password", at the same cost:
    // distinguishing them by text or by time is an account-existence oracle.
    const id = await this.storage.getUserIdByEmail(email)
    const rec = id ? await this.storage.getUser(id) : null
    const ok = await verifyPassword(password, rec?.passwordHash ?? DUMMY_HASH)
    if (!rec || !rec.passwordHash || !ok) throw new AuthError('Email or password is incorrect', 401)
    return { user: publicUser(rec), ...(await this.startSession(rec.id)) }
  }

  async signOut(token: string | null | undefined): Promise<void> {
    if (token) await this.storage.deleteSession(await sha256Hex(token))
  }

  /** The user behind a token, or null for missing, unknown or expired. */
  async resolve(token: string | null | undefined): Promise<AuthUser | null> {
    if (!token || typeof token !== 'string' || token.length > 256) return null
    const hash = await sha256Hex(token)
    const s = await this.storage.getSession(hash)
    if (!s) return null
    if (s.expiresAt <= Date.now()) {
      await this.storage.deleteSession(hash)
      return null
    }
    const rec = await this.storage.getUser(s.userId)
    return rec ? publicUser(rec) : null
  }

  async getUser(id: string): Promise<AuthUser | null> {
    const rec = await this.storage.getUser(id)
    return rec ? publicUser(rec) : null
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const id = await this.storage.getUserIdByEmail(normEmail(email))
    return id ? this.getUser(id) : null
  }

  async setRoles(id: string, roles: string[]): Promise<AuthUser> {
    const rec = await this.storage.getUser(id)
    if (!rec) throw new AuthError(`No user "${id}"`, 404)
    rec.roles = [...new Set((roles ?? []).map(String))]
    await this.storage.putUser(rec)
    return publicUser(rec)
  }

  async setPassword(id: string, password: string): Promise<void> {
    const min = this.opts.minPasswordLength ?? MIN_PASSWORD_LENGTH
    if (typeof password !== 'string' || password.length < min) {
      throw new AuthError(`Password must be at least ${min} characters`, 400)
    }
    const rec = await this.storage.getUser(id)
    if (!rec) throw new AuthError(`No user "${id}"`, 404)
    rec.passwordHash = await hashPassword(password)
    await this.storage.putUser(rec)
  }
}

// ── Cookie transport ────────────────────────────────────────────────────────
// `__Host-` on https: the browser then refuses the cookie unless it is Secure,
// Path=/ and host-only, so a sibling project subdomain cannot plant one over it.

export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-mg_session' : 'mg_session'
}

export function serializeSessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds: number }): string {
  return [
    `${sessionCookieName(opts.secure)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`,
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  return serializeSessionCookie('', { secure, maxAgeSeconds: 0 })
}

/**
 * The session token on a request: the cookie for browsers, `x-morgana-session`
 * for API clients that cannot hold one. Never `authorization: Bearer` — that
 * header carries platform credentials, and the two must not be confused.
 */
export function readSessionToken(headers: { cookie?: string | null; session?: string | null }): string | null {
  const explicit = typeof headers.session === 'string' ? headers.session.trim() : ''
  if (explicit) return explicit
  const cookie = headers.cookie ?? ''
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (name === '__Host-mg_session' || name === 'mg_session') {
      const v = part.slice(eq + 1).trim()
      if (v) return v
    }
  }
  return null
}

// ── Page access ─────────────────────────────────────────────────────────────

export type PageAccess = 'public' | 'member' | { role: string | string[] }

/** null when allowed; otherwise why not (401 = sign in, 403 = signed in but not allowed). */
export function pageAccessRefusal(access: unknown, user: AuthUser | null): 401 | 403 | null {
  if (!access || access === 'public') return null
  if (!user) return 401
  if (access === 'member') return null
  if (typeof access === 'object' && access !== null && 'role' in access) {
    const want = (access as { role: string | string[] }).role
    const roles = Array.isArray(want) ? want : [want]
    return roles.some((r) => user.roles?.includes(r)) ? null : 403
  }
  return null
}

// ── The server-lane ctx.auth ────────────────────────────────────────────────

export interface ServerAuthDeps {
  auth: AppAuth
  /** The resolved user for this invocation (null when signed out). */
  user: AuthUser | null
  /** The incoming token, so signOut can revoke it. */
  token: string | null
  /**
   * Called when the action starts or ends a session, so the host can set or
   * clear the cookie on this response. `null` = signed out.
   */
  onSession(session: { token: string; expiresAt: number } | null): void
}

export function buildServerAuth(deps: ServerAuthDeps) {
  // `user` is a plain property, updated in place by signIn/signOut — not a
  // getter, because the worker copies this object into the QuickJS sandbox and
  // an accessor does not survive that copy.
  const handle = {
    user: deps.user as AuthUser | null,
    hasRole: (role: string) => !!handle.user && (handle.user.roles ?? []).includes(role),
    require(role?: string | string[]) {
      const user = handle.user
      if (!user) throw new AuthError('Sign in required', 401)
      if (role !== undefined) {
        const roles = Array.isArray(role) ? role : [role]
        if (!roles.some((r) => (user.roles ?? []).includes(r))) throw new AuthError('Not allowed', 403)
      }
      return user
    },
    async signUp(input: { email: string; password: string; name?: string }) {
      const s = await deps.auth.signUp(input)
      handle.user = s.user
      deps.onSession({ token: s.token, expiresAt: s.expiresAt })
      return s.user
    },
    async signIn(input: { email: string; password: string }) {
      const s = await deps.auth.signIn(input)
      handle.user = s.user
      deps.onSession({ token: s.token, expiresAt: s.expiresAt })
      return s.user
    },
    /** Start a session for an existing user — invites, magic links, OAuth callbacks. */
    async signInAs(userId: string) {
      const u = await deps.auth.getUser(userId)
      if (!u) throw new AuthError(`No user "${userId}"`, 404)
      const s = await deps.auth.startSession(userId)
      handle.user = u
      deps.onSession(s)
      return u
    },
    async signOut() {
      await deps.auth.signOut(deps.token)
      handle.user = null
      deps.onSession(null)
    },
    users: {
      get: (id: string) => deps.auth.getUser(id),
      findByEmail: (email: string) => deps.auth.findByEmail(email),
      create: (input: { email: string; password?: string; name?: string; roles?: string[] }) => deps.auth.createUser(input),
      setRoles: (id: string, roles: string[]) => deps.auth.setRoles(id, roles),
      setPassword: (id: string, password: string) => deps.auth.setPassword(id, password),
    },
  }
  return handle
}

// ── The session HTTP surface ────────────────────────────────────────────────
// `/api/session[/signup|/signin|/signout]`, answered identically by both hosts.

export interface SessionRouteResult {
  status: number
  body: unknown
  /** A Set-Cookie value to send, when the session changed. */
  setCookie?: string
}

export async function handleSessionRoute(
  auth: AppAuth,
  req: { method: string; path: string; token: string | null; body: unknown; secure: boolean },
): Promise<SessionRouteResult | null> {
  const sub = req.path.replace(/^\/api\/session\/?/, '').replace(/\/+$/, '')
  const input = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const issue = (s: IssuedSession): SessionRouteResult => ({
    status: 200,
    body: { success: true, data: { user: s.user, expiresAt: s.expiresAt } },
    setCookie: serializeSessionCookie(s.token, { secure: req.secure, maxAgeSeconds: (s.expiresAt - Date.now()) / 1000 }),
  })
  try {
    if (sub === '' && req.method === 'GET') {
      return { status: 200, body: { success: true, data: { user: await auth.resolve(req.token) } } }
    }
    if (req.method !== 'POST') return null
    if (sub === 'signup') {
      return issue(
        await auth.signUp({
          email: String(input.email ?? ''),
          password: String(input.password ?? ''),
          name: typeof input.name === 'string' ? input.name : undefined,
        }),
      )
    }
    if (sub === 'signin') {
      return issue(await auth.signIn({ email: String(input.email ?? ''), password: String(input.password ?? '') }))
    }
    if (sub === 'signout') {
      await auth.signOut(req.token)
      return { status: 200, body: { success: true, data: { user: null } }, setCookie: clearSessionCookie(req.secure) }
    }
    return null
  } catch (err) {
    if (err instanceof AuthError) return { status: err.status, body: { success: false, message: err.message } }
    throw err
  }
}
