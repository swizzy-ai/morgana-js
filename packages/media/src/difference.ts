/**
 * No two alike: a fingerprint of a resolved piece, how far two pieces are
 * from each other, and drawing again until a new piece is far enough from
 * what came before.
 */
import { rgb, toHsl } from './colour'
import type { Handles, Values } from './handles'
import type { Generator, PieceSpec, ResolvedPiece } from './piece'
import { resolvePiece } from './piece'
import { childSeed, newSeed } from './random'

/** Every value as a number in 0–1, by handle path. */
export type Fingerprint = Record<string, number>

function walk(handles: Handles, values: Values, prefix: string, out: Fingerprint) {
  for (const [name, h] of Object.entries(handles)) {
    const at = `${prefix}.${name}`
    const v = values[name]
    if (h.kind === 'group') { walk(h.handles, (v ?? {}) as Values, at, out); continue }
    if (h.kind === 'number' && typeof v === 'number') out[at] = h.max > h.min ? (v - h.min) / (h.max - h.min) : 0
    else if (h.kind === 'choice' && typeof v === 'string') out[at] = h.options.length > 1 ? h.options.indexOf(v) / (h.options.length - 1) : 0
    else if (h.kind === 'flag') out[at] = v ? 1 : 0
    else if (h.kind === 'colour' && typeof v === 'string') {
      const [hue, s, l] = toHsl(rgb(v))
      out[`${at}.h`] = hue / 360
      out[`${at}.s`] = s
      out[`${at}.l`] = l
    }
  }
}

/** A piece's fingerprint. Nodes are keyed by kind and their order within it, so ids don't matter. */
export function fingerprint(piece: ResolvedPiece, generators: Generator[]): Fingerprint {
  const out: Fingerprint = {}
  const seen = new Map<string, number>()
  for (const n of piece.nodes) {
    const g = generators.find((x) => x.kind === n.kind)
    if (!g) continue
    const i = seen.get(n.kind) ?? 0
    seen.set(n.kind, i + 1)
    walk(g.handles, n.values, `${n.kind}${i}`, out)
  }
  return out
}

/** How different two fingerprints are: 0 (the same) to about 0.4 (as different as random pieces get). Root mean square over shared paths. */
export function distance(a: Fingerprint, b: Fingerprint): number {
  let sum = 0, n = 0
  for (const k of Object.keys(a)) {
    if (!(k in b)) continue
    // Hue wraps around.
    let d = Math.abs(a[k]! - b[k]!)
    if (k.endsWith('.h')) d = Math.min(d, 1 - d)
    sum += d * d
    n++
  }
  return n ? Math.sqrt(sum / n) : 1
}

export interface Distinct {
  piece: ResolvedPiece
  fingerprint: Fingerprint
  /** How far it is from the nearest earlier piece (1 when there were none). */
  nearest: number
  /** How many seeds were tried. */
  tries: number
}

/**
 * Resolve a piece whose fingerprint is at least `min` from every earlier one.
 * A pinned seed is honoured as it is: someone asked for that exact piece.
 */
export function resolveDistinct(spec: PieceSpec, generators: Generator[], earlier: Fingerprint[] = [], { min = 0.12, tries = 12 } = {}): Distinct {
  const base = spec.seed ?? newSeed()
  let best: Distinct | null = null
  for (let i = 0; i < (spec.seed ? 1 : tries); i++) {
    const seed = i === 0 ? base : childSeed(base, `again-${i}`)
    const piece = resolvePiece(spec, generators, seed)
    if (spec.seed) piece.pinned = true
    const fp = fingerprint(piece, generators)
    const nearest = earlier.length ? Math.min(...earlier.map((e) => distance(fp, e))) : 1
    const d: Distinct = { piece, fingerprint: fp, nearest, tries: i + 1 }
    if (!best || nearest > best.nearest) best = d
    if (nearest >= min) return d
  }
  return best!
}
