/**
 * Host capabilities shared by both server hosts — `morgana dev` (Node) and the
 * cloud worker (workerd). Worker-safe by construction: no compiler, no esbuild,
 * no `node:` imports. A capability that both hosts implement separately is two
 * capabilities that drift; the ones here are written once.
 */
export { createEmailHandle } from './email'
export type { EmailHandle, EmailHostDeps, EmailMessage, EmailResult } from './email'
export {
  AppAuth,
  AuthError,
  buildServerAuth,
  clearSessionCookie,
  handleSessionRoute,
  hashPassword,
  pageAccessRefusal,
  publicUser,
  readSessionToken,
  serializeSessionCookie,
  sessionCookieName,
  verifyPassword,
  SESSION_TTL_MS,
} from './auth'
export type { AppAuthStorage, AppSessionRecord, AppUserRecord, IssuedSession, PageAccess, SessionRouteResult } from './auth'
export { verifyGoogleIdToken, GoogleTokenError, clearGoogleKeyCache } from './google'
export type { GoogleIdentity } from './google'
export { assertDeclaredFields, undeclaredFields } from './collections'
export { findPageByPath, isParamAddress, matchAddress, PARAM_SEGMENT_RE } from './routes'
