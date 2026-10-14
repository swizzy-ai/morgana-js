/**
 * App auth for `morgana dev` — the shared core from `server-host`, stored in
 * the same SQLite file as the project's collections.
 *
 * Only the storage is local; hashing, sessions, validation and the
 * `/api/session` surface are the exact code the worker runs, so a sign-up flow
 * that works here works deployed.
 */
import { AppAuth, pageAccessRefusal, readSessionToken } from '@morgana/sdk-compile/server-host'

const USERS = '__auth_users'
const EMAILS = '__auth_emails'
const SESSIONS = '__auth_sessions'

/** @param {import('./store.mjs').StoreEngine} store */
export function createLocalAppAuth(store) {
  for (const name of [USERS, EMAILS, SESSIONS]) {
    if (!store.shape(name)) store.create(name, { columns: [] })
  }
  // Each record is one opaque JSON string. Collection rows coerce their fields
  // by declared column type, which is right for app data and wrong here: it
  // turned `roles: ['admin']` into a string's characters.
  const read = (table, id) => {
    const row = store.get(table, id)
    if (!row || typeof row.json !== 'string') return null
    try {
      return JSON.parse(row.json)
    } catch {
      return null
    }
  }
  const write = (table, id, value) => store.set(table, id, { json: JSON.stringify(value) })
  /** @type {import('@morgana/sdk-compile/server-host').AppAuthStorage} */
  const storage = {
    getUser: async (id) => read(USERS, id),
    getUserIdByEmail: async (email) => read(EMAILS, email)?.userId ?? null,
    async putUser(user) {
      write(USERS, user.id, user)
      write(EMAILS, user.email, { userId: user.id })
    },
    putSession: async (hash, session) => void write(SESSIONS, hash, session),
    getSession: async (hash) => read(SESSIONS, hash),
    deleteSession: async (hash) => void store.remove(SESSIONS, hash),
  }
  return new AppAuth(storage)
}

/** The session token on a Node request (cookie, or `x-morgana-session`). */
export function tokenOf(req) {
  return readSessionToken({ cookie: req.headers['cookie'], session: req.headers['x-morgana-session'] })
}

/**
 * Whether a page may be served to this request. Returns null to serve, or the
 * response to send instead: a redirect when the page names one, else 401/403.
 */
export async function pageGate(auth, page, req) {
  if (!page?.access) return null
  const user = await auth.resolve(tokenOf(req))
  const refusal = pageAccessRefusal(page.access, user)
  if (!refusal) return null
  if (page.redirect) {
    const target = /^[a-z]+:\/\//i.test(page.redirect) || page.redirect.startsWith('/')
      ? page.redirect
      : `/${page.redirect.replace(/^\/+|\/+$/g, '')}/`
    const sep = target.includes('?') ? '&' : '?'
    const next = encodeURIComponent(req.url ?? '/')
    return { status: 302, location: refusal === 401 ? `${target}${sep}next=${next}` : target }
  }
  return { status: refusal, body: refusal === 401 ? 'Sign in to see this page.' : 'You do not have access to this page.' }
}
