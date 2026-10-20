/**
 * Seeds and randomness. Everything in Media is a pure function of its seed, so
 * the same seed always makes the same piece, and a new seed a new one.
 */

/** A 32-bit hash of a string (cyrb53, folded). */
export function hash(text: string): number {
  let h1 = 0xdeadbeef ^ text.length
  let h2 = 0x41c6ce57 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 ^ h2) >>> 0
}

/** A random source: numbers in [0, 1), the same sequence for the same seed. */
export interface Random {
  (): number
  /** A number in [min, max). */
  between(min: number, max: number): number
  /** Somewhere in [min, max), leaning toward `around` (a triangle): varied, but rarely extreme. */
  near(around: number, min: number, max: number): number
  /** One of the list. */
  pick<T>(list: readonly T[]): T
  /** An integer in [min, max]. */
  int(min: number, max: number): number
}

/** mulberry32: small, fast and good enough for art. */
export function random(seed: string | number): Random {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(seed)
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Random
  next.between = (min, max) => min + (max - min) * next()
  next.near = (around, min, max) => {
    const c = Math.min(max, Math.max(min, around))
    const u = next()
    const span = max - min
    if (span <= 0) return min
    const f = (c - min) / span
    // Inverse CDF of a triangular distribution peaking at c.
    return u < f ? min + Math.sqrt(u * span * (c - min)) : max - Math.sqrt((1 - u) * span * (max - c))
  }
  next.pick = (list) => list[Math.floor(next() * list.length)]!
  next.int = (min, max) => Math.floor(next.between(min, max + 1))
  return next
}

/** A child seed: the same parent and name always give the same child, and moving one node never re-rolls another. */
export const childSeed = (seed: string, name: string) => hash(`${seed}/${name}`).toString(36)

/** A fresh seed, for when none is pinned. */
export function newSeed(): string {
  const bytes = new Uint32Array(1)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else bytes[0] = Math.floor(Math.random() * 2 ** 32)
  return bytes[0]!.toString(36)
}
