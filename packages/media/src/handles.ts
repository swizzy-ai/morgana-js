/**
 * Handles: the full, named controls of a generator, as a tree.
 *
 * Every leaf has a type, a range and a default. What someone asks for (a
 * value, a range, a word) narrows it; everything they didn't ask for is drawn
 * from its own range by the seed. So a few words leave dozens of handles free,
 * and two people asking the same thing get two different things.
 */
import { random, childSeed } from './random'
import { shift } from './colour'

export interface NumberHandle {
  kind: 'number'
  min: number
  max: number
  default: number
  /** How far an unasked value strays from the default, 0 (never) to 1 (the whole range). Default 0.7. */
  vary?: number
  unit?: string
  /** Whole numbers only. */
  int?: boolean
  /**
   * Drawn on a logarithmic scale: for amounts felt as ratios (heights, sizes,
   * distances, lengths), where 3→30 is as big a step as 30→300. Needs min > 0.
   */
  log?: boolean
  doc?: string
}

export interface ChoiceHandle {
  kind: 'choice'
  options: readonly string[]
  default: string
  /** How often an unasked choice leaves its default, 0 to 1. Default 0.5. */
  vary?: number
  doc?: string
}

export interface ColourHandle {
  kind: 'colour'
  default: string
  /** How far an unasked colour strays: 0 to 1 (about ±40° of hue and ±0.12 lightness at 1). Default 0.35. */
  vary?: number
  doc?: string
}

export interface FlagHandle {
  kind: 'flag'
  default: boolean
  /** How often an unasked flag is on. Default: the default. */
  chance?: number
  doc?: string
}

export interface GroupHandle {
  kind: 'group'
  doc?: string
  handles: Handles
}

export type Handle = NumberHandle | ChoiceHandle | ColourHandle | FlagHandle | GroupHandle
export type Handles = Record<string, Handle>

/** What someone asks of a handle: an exact value, a range `[min, max]`, a list to choose from, or nothing. */
export type AskLeaf = number | [number, number] | string | string[] | boolean
export interface Ask { [name: string]: AskLeaf | Ask | undefined }

/** Resolved values: the same tree, every leaf a value. */
export interface Values { [name: string]: number | string | boolean | Values }

// ── building handles ────────────────────────────────────────────────────────

export const num = (min: number, max: number, def: number, o: Partial<Omit<NumberHandle, 'kind' | 'min' | 'max' | 'default'>> = {}): NumberHandle =>
  ({ kind: 'number', min, max, default: def, ...o })
export const int = (min: number, max: number, def: number, o: Partial<Omit<NumberHandle, 'kind' | 'min' | 'max' | 'default'>> = {}): NumberHandle =>
  ({ kind: 'number', min, max, default: def, int: true, ...o })
export const choice = <O extends readonly string[]>(options: O, def: O[number], o: Partial<Omit<ChoiceHandle, 'kind' | 'options' | 'default'>> = {}): ChoiceHandle =>
  ({ kind: 'choice', options, default: def, ...o })
export const colour = (def: string, o: Partial<Omit<ColourHandle, 'kind' | 'default'>> = {}): ColourHandle =>
  ({ kind: 'colour', default: def, ...o })
export const flag = (def: boolean, o: Partial<Omit<FlagHandle, 'kind' | 'default'>> = {}): FlagHandle =>
  ({ kind: 'flag', default: def, ...o })
export const group = (doc: string, handles: Handles): GroupHandle => ({ kind: 'group', doc, handles })

// ── asking ──────────────────────────────────────────────────────────────────

const isAsk = (v: unknown): v is Ask => !!v && typeof v === 'object' && !Array.isArray(v)

/** Later asks win, leaf by leaf; groups merge. */
export function merge(...asks: (Ask | undefined)[]): Ask {
  const out: Ask = {}
  for (const a of asks) {
    if (!a) continue
    for (const [k, v] of Object.entries(a)) {
      if (v === undefined) continue
      out[k] = isAsk(v) && isAsk(out[k]) ? merge(out[k] as Ask, v) : v
    }
  }
  return out
}

// ── resolving ───────────────────────────────────────────────────────────────

export interface Resolved {
  values: Values
  /** Paths someone asked for (`waves.height`). The rest were drawn by the seed. */
  asked: string[]
}

/**
 * Every leaf a value. Each leaf draws from its own seed (`seed/path`), so adding
 * a handle later doesn't change the values of the others.
 */
export function resolve(handles: Handles, ask: Ask, seed: string, path = ''): Resolved {
  const values: Values = {}
  const asked: string[] = []
  for (const [name, h] of Object.entries(handles)) {
    const at = path ? `${path}.${name}` : name
    const a = ask[name]
    if (h.kind === 'group') {
      const r = resolve(h.handles, isAsk(a) ? a : {}, seed, at)
      values[name] = r.values
      asked.push(...r.asked)
      continue
    }
    const rnd = random(childSeed(seed, at))
    if (a !== undefined && !isAsk(a)) asked.push(at)
    values[name] = leaf(h, a as AskLeaf | undefined, rnd)
  }
  return { values, asked }
}

function leaf(h: Exclude<Handle, GroupHandle>, a: AskLeaf | undefined, rnd: ReturnType<typeof random>): number | string | boolean {
  switch (h.kind) {
    case 'number': {
      let v: number
      const log = h.log && h.min > 0
      const to = (x: number) => (log ? Math.log(x) : x)
      const from = (x: number) => (log ? Math.exp(x) : x)
      if (typeof a === 'number') v = a
      else if (Array.isArray(a) && typeof a[0] === 'number') v = from(rnd.between(to(Math.max(a[0], log ? 1e-9 : -Infinity)), to(a[1] as number)))
      else {
        const vary = h.vary ?? 0.7
        const [mn, mx, d] = [to(h.min), to(h.max), to(h.default)]
        const lo = d - (d - mn) * vary
        const hi = d + (mx - d) * vary
        v = from(rnd.near(d, lo, hi))
      }
      return h.int ? Math.round(v) : v
    }
    case 'choice': {
      if (typeof a === 'string' && h.options.includes(a)) return a
      if (Array.isArray(a) && a.length) return rnd.pick(a as string[])
      return rnd() < (h.vary ?? 0.5) ? rnd.pick(h.options) : h.default
    }
    case 'colour': {
      if (typeof a === 'string') return a
      if (Array.isArray(a) && a.length) return rnd.pick(a as string[])
      const vary = h.vary ?? 0.35
      return shift(h.default, (rnd() * 2 - 1) * 40 * vary, (rnd() * 2 - 1) * 0.1 * vary, (rnd() * 2 - 1) * 0.12 * vary)
    }
    case 'flag': {
      if (typeof a === 'boolean') return a
      return rnd() < (h.chance ?? (h.default ? 1 : 0))
    }
  }
}

/** A handle by path: `find(handles, 'waves.height')`. */
export function find(handles: Handles, path: string): Handle | undefined {
  let at: Handle | undefined = { kind: 'group', handles }
  for (const part of path.split('.')) {
    if (at?.kind !== 'group') return undefined
    at = at.handles[part]
  }
  return at
}

/** A value by path. */
export function get(values: Values, path: string): number | string | boolean | Values | undefined {
  let at: unknown = values
  for (const part of path.split('.')) at = (at as Values | undefined)?.[part]
  return at as never
}
