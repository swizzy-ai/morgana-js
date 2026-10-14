/**
 * Google ID token verification — the only thing that makes "signed in with
 * Google" mean anything.
 *
 * A Google ID token is a JWT signed (RS256) by one of Google's published keys.
 * It proves an identity only after all of: the signature verifies against
 * Google's JWKS, `iss` is Google, `aud` is *our* OAuth client id (a token minted
 * for another app must not sign in to this one), `exp` is in the future, and
 * `email_verified` is true. Accepting an email from a request body, or a token
 * whose signature was never checked, lets anyone sign in as anyone.
 *
 * WebCrypto only, so it runs on the worker and under `morgana dev` alike.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com'])

export interface GoogleIdentity {
  sub: string
  email: string
  name?: string
  picture?: string
}

interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

let jwksCache: { keys: Jwk[]; at: number } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeJson(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)))
}

async function googleKeys(doFetch: typeof fetch, forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys
  const res = await doFetch(JWKS_URL)
  if (!res.ok) throw new Error(`could not fetch Google signing keys (${res.status})`)
  const body = (await res.json()) as { keys?: Jwk[] }
  const keys = Array.isArray(body.keys) ? body.keys : []
  jwksCache = { keys, at: Date.now() }
  return keys
}

export class GoogleTokenError extends Error {
  status = 401
}

/**
 * Verify a Google ID token for `clientId`. Returns the identity or throws
 * GoogleTokenError — never a partially trusted result.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string | string[]; fetch?: typeof fetch; now?: number },
): Promise<GoogleIdentity> {
  const fail = (why: string): never => {
    throw new GoogleTokenError(`Google sign-in refused: ${why}`)
  }
  const audiences = (Array.isArray(opts.clientId) ? opts.clientId : [opts.clientId]).filter(Boolean)
  if (!audiences.length) fail('no Google client id is configured (GOOGLE_CLIENT_ID)')
  if (typeof idToken !== 'string' || idToken.split('.').length !== 3) fail('malformed token')

  const [h, p, sig] = idToken.split('.') as [string, string, string]
  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    header = decodeJson(h)
    payload = decodeJson(p)
  } catch {
    return fail('malformed token')
  }
  if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') fail('unexpected token algorithm')

  const doFetch = opts.fetch ?? fetch
  let jwk = (await googleKeys(doFetch)).find((k) => k.kid === header['kid'])
  // Google rotates keys; an unknown kid may just mean our cache is stale.
  if (!jwk) jwk = (await googleKeys(doFetch, true)).find((k) => k.kid === header['kid'])
  if (!jwk) fail('signing key not found')

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk!.n, e: jwk!.e, alg: 'RS256', ext: true } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(sig) as unknown as BufferSource,
    new TextEncoder().encode(`${h}.${p}`),
  )
  if (!ok) fail('bad signature')

  const now = Math.floor((opts.now ?? Date.now()) / 1000)
  if (!ISSUERS.has(String(payload['iss']))) fail('wrong issuer')
  const aud = payload['aud']
  if (!(typeof aud === 'string' && audiences.includes(aud))) fail('token was issued for a different app')
  if (typeof payload['exp'] !== 'number' || payload['exp'] < now - 60) fail('token expired')
  if (payload['email_verified'] !== true && payload['email_verified'] !== 'true') fail('email not verified by Google')
  if (typeof payload['email'] !== 'string' || typeof payload['sub'] !== 'string') fail('token has no email')

  return {
    sub: payload['sub'] as string,
    email: (payload['email'] as string).toLowerCase(),
    ...(typeof payload['name'] === 'string' ? { name: payload['name'] as string } : {}),
    ...(typeof payload['picture'] === 'string' ? { picture: payload['picture'] as string } : {}),
  }
}

/** Test seam. */
export function clearGoogleKeyCache(): void {
  jwksCache = null
}
