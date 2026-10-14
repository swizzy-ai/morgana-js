/**
 * Page address matching for both hosts — `products/:id` style addresses.
 *
 * A literal page always wins over a param page, and among param pages the one
 * with more literal segments wins, so `products/new` beats `products/:id` and
 * `:slug` at the root never shadows a real page.
 */

export const PARAM_SEGMENT_RE = /^:[A-Za-z_][A-Za-z0-9_]*$/

const segs = (p: string) => (p === '/' ? [] : String(p).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean))

export function isParamAddress(address: string): boolean {
  return segs(address).some((s) => s.startsWith(':'))
}

/** Params when `path` matches `address`, else null. Literal segments compare case-insensitively. */
export function matchAddress(address: string, path: string): Record<string, string> | null {
  const a = segs(address)
  const b = segs(path)
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    const want = a[i]!
    const got = b[i]!
    if (want.startsWith(':')) {
      try {
        params[want.slice(1)] = decodeURIComponent(got)
      } catch {
        return null
      }
    } else if (want.toLowerCase() !== got.toLowerCase()) {
      return null
    }
  }
  return params
}

/** The page a path addresses, with its params. */
export function findPageByPath<P extends { address: string }>(
  pages: readonly P[],
  path: string,
): { page: P; params: Record<string, string> } | null {
  let best: { page: P; params: Record<string, string>; literals: number } | null = null
  for (const page of pages) {
    const params = matchAddress(page.address, path)
    if (!params) continue
    const literals = segs(page.address).filter((s) => !s.startsWith(':')).length
    if (!best || literals > best.literals) best = { page, params, literals }
  }
  return best ? { page: best.page, params: best.params } : null
}
