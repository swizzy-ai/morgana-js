/**
 * No two alike: a fingerprint of an object's props, how far two are from each
 * other, and drawing again until new props are far enough from earlier ones.
 */
import { rgb, toHsl } from './colour'
import { resolve, type Ask, type Handles, type Values } from './handles'
import { childSeed, newSeed } from './random'

/** Every value as a number in 0–1, by prop path. */
export type Fingerprint = Record<string, number>

function walk(handles: Handles, values: Values, prefix: string, out: Fingerprint) {
  for (const [name, h] of Object.entries(handles)) {
    const at = prefix ? `${prefix}.${name}` : name
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

/** An object's fingerprint: its props, each placed in 0–1 within its range. */
export function fingerprint(handles: Handles, values: Values): Fingerprint {
  const out: Fingerprint = {}
  walk(handles, values, '', out)
  return out
}

/** How different two fingerprints are: 0 (the same) to about 0.4 (as different as random draws get). Root mean square over shared props. */
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
  values: Values
  seed: string
  fingerprint: Fingerprint
  /** How far it is from the nearest earlier draw (1 when there were none). */
  nearest: number
  /** How many seeds were tried. */
  tries: number
}

/**
 * Props whose fingerprint is at least `min` from every earlier one. A pinned
 * seed is honoured as it is: someone asked for that exact object.
 */
export function resolveDistinct(handles: Handles, ask: Ask = {}, earlier: Fingerprint[] = [], { seed, min = 0.12, tries = 12 }: { seed?: string; min?: number; tries?: number } = {}): Distinct {
  const base = seed ?? newSeed()
  let best: Distinct | null = null
  for (let i = 0; i < (seed ? 1 : tries); i++) {
    const s = i === 0 ? base : childSeed(base, `again-${i}`)
    const { values } = resolve(handles, ask, s)
    const fp = fingerprint(handles, values)
    const nearest = earlier.length ? Math.min(...earlier.map((e) => distance(fp, e))) : 1
    const d: Distinct = { values, seed: s, fingerprint: fp, nearest, tries: i + 1 }
    if (!best || nearest > best.nearest) best = d
    if (nearest >= min) return d
  }
  return best!
}
