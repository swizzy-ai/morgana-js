/**
 * Points — one fixed, standard way to say an amount, everywhere in Morgana.
 *
 * A point is a counting unit with a fixed size per kind of amount:
 *
 *   distance  1 point = 8px          turns    1 point = 1 degree
 *   text      1 point = 8px          size     1 point = 5% of its own size
 *   time      1 point = 0.1 second   opacity  1 point = 5%
 *             (⅛ beat with a tempo)  blur     1 point = 1px
 *   volume    1 point = 1 dB         pitch    1 point = 1 semitone
 *   pan       1 point = 5%           world    1 point = 10cm
 *
 * Amounts read as English and take decimals: `'2 points'`, `'1.5 points'`,
 * `'half a point'`, `'one and a half points'`. The amount words are named
 * point values — `a hair` 1, `a little` 2, `a bit` / `some` 4, `a lot` 8,
 * `far` 16 — and `'3 hairs'` counts in hairs. Exact units work too: `'14px'`,
 * `'5 degrees'`, `'0.4s'`, `'2 beats'`, `'30%'`, `'3 dB'`, `'50cm'`.
 *
 * A project or file may change the basis (`{ distance: '4px' }`) and what the
 * words mean (`{ 'a little': 3 }` or `{ 'a little': '16px' }`); a point always
 * means its basis, so `'2 points'` reads the same everywhere the basis is.
 *
 * Pixels are pixels on a 1080 frame when a `frame` is given (video, motion,
 * art): a 4K export scales every px amount by 2, so a piece looks the same
 * in every format. Pages pass no frame — a px is a CSS px. `exact: true`
 * keeps literal output pixels (pixel art).
 */

export type PointKind =
  | 'distance' | 'text' | 'turns' | 'size' | 'time' | 'opacity' | 'blur'
  | 'volume' | 'pitch' | 'pan' | 'world'

export const POINT_KINDS: readonly PointKind[] = [
  'distance', 'text', 'turns', 'size', 'time', 'opacity', 'blur', 'volume', 'pitch', 'pan', 'world',
]

/** What one point is, per kind. `text` follows `distance` unless set. */
export type PointBasis = Partial<Record<PointKind, string | number>>

/** The standard basis. */
export const POINT_BASIS: Readonly<Record<Exclude<PointKind, 'text'>, string>> = {
  distance: '8px', turns: '1 degree', size: '5%', time: '0.1 second', opacity: '5%', blur: '1px',
  volume: '1 dB', pitch: '1 semitone', pan: '5%', world: '10cm',
}

/** The amount words and how many points each one is. */
export const POINT_WORDS: Readonly<Record<string, number>> = {
  'a hair': 1, slightly: 1, 'a little': 2, 'a bit': 4, some: 4, 'a lot': 8, far: 16,
}

/** The unit an amount of each kind comes out in. */
export const POINT_UNITS: Readonly<Record<PointKind, string>> = {
  distance: 'px', text: 'px', turns: 'deg', size: '%', time: 'ms', opacity: '%', blur: 'px',
  volume: 'dB', pitch: 'semitones', pan: '%', world: 'm',
}

export interface PointsOptions {
  /** What a point is, per kind. Unset kinds keep the standard basis. */
  basis?: PointBasis
  /** What the amount words mean: a number of points, or an exact amount (`'16px'`). */
  words?: Record<string, number | string>
  /** The output frame (video, motion, art). px amounts scale by its shorter side ÷ 1080. */
  frame?: { width: number; height: number }
  /** Literal output pixels: no frame scaling. */
  exact?: boolean
  /** Beats per minute. Makes `'2 beats'` readable and, unless time's basis is set, a point ⅛ beat. */
  tempo?: number
}

export interface PointReading {
  /** The amount in the kind's unit (`POINT_UNITS`). */
  value: number
  unit: string
  /** How many points it was, when it was said in points, hairs or words. */
  points?: number
  /** What was said. */
  said: string
  /** In plain English: `"a little" = 2 points = 16px`. */
  how: string
}

/** How a comparative changes the last amount: "a bit more", "much less", "twice as far". */
export type Comparative = string

export interface Points {
  /** The amount in the kind's unit. A number is a number of points. */
  read(amount: string | number, kind: PointKind): number
  /** The amount, with how it was worked out. */
  explain(amount: string | number, kind: PointKind): PointReading
  /** CSS for the amount: `'16px'`, `'2deg'`, `'400ms'`, `'30%'`. */
  css(amount: string | number, kind: 'distance' | 'text' | 'turns' | 'time' | 'opacity' | 'blur'): string
  /** One point of this kind, in the kind's unit, and whether the basis was set. */
  basis(kind: PointKind): { value: number; unit: string; set: boolean }
  /** True when the text is an amount in points, hairs or an amount word (not a raw unit like `'14px'`). */
  isPoints(amount: unknown): boolean
  /** Whether text is an amount: in points (points, hairs, words), in a unit (`'14px'`), or a comparative (`'a bit more'`). */
  classify(amount: unknown): 'points' | 'unit' | 'comparative' | undefined
  /** A new number of points after a comparative: `step(2, 'a bit more')` → 4. */
  step(points: number, comparative: Comparative): number
  /** This reader with more settings on top (a file's basis over the project's). */
  with(options: PointsOptions): Points
  /** The settings this reader was made with. */
  readonly options: Readonly<PointsOptions>
}

// ── reading numbers and units ──────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

/** `'2'`, `'1.5'`, `'two'`, `'a'`, `'half a'`, `'a quarter'`, `'one and a half'`, `'three quarters of a'`. */
function quantity(text: string): number | undefined {
  const t = text.trim().replace(/\s+of\s+(a|an)$/, ' $1').replace(/\s+/g, ' ')
  if (t === '') return undefined
  if (/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return Number(t)
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : undefined }
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t]
  if (/^(half (a|an)|a half)$/.test(t)) return 0.5
  if (/^(a quarter|quarter (a|an)|a quarter (a|an))$/.test(t)) return 0.25
  if (/^(three quarters (a|an)|three quarters)$/.test(t)) return 0.75
  const half = /^(.+) and a half$/.exec(t)
  if (half) { const n = quantity(half[1]); return n === undefined ? undefined : n + 0.5 }
  return undefined
}

type Family = 'px' | 'deg' | 'percent' | 'time' | 'db' | 'pitch' | 'metres'

/** Unit words, longest first, with the family and the factor to the family's base unit. */
const UNITS: [RegExp, Family, number | 'beat'][] = [
  [/(milliseconds?|ms)$/, 'time', 1],
  [/(seconds?|secs?|s)$/, 'time', 1000],
  [/(minutes?|mins?)$/, 'time', 60_000],
  [/beats?$/, 'time', 'beat'],
  [/(pixels?|px)$/, 'px', 1],
  [/(degrees?|deg|°)$/, 'deg', 1],
  [/turns?$/, 'deg', 360],
  [/(percent|%)$/, 'percent', 1],
  [/(decibels?|db)$/, 'db', 1],
  [/semitones?$/, 'pitch', 1],
  [/octaves?$/, 'pitch', 12],
  [/(centimet(re|er)s?|cm)$/, 'metres', 0.01],
  [/(millimet(re|er)s?|mm)$/, 'metres', 0.001],
  [/(met(re|er)s?|m)$/, 'metres', 1],
]

const FAMILY: Record<PointKind, Family> = {
  distance: 'px', text: 'px', blur: 'px', turns: 'deg', size: 'percent', opacity: 'percent', pan: 'percent',
  time: 'time', volume: 'db', pitch: 'pitch', world: 'metres',
}

const FAMILY_SAYS: Record<Family, string> = {
  px: 'px ("14px")', deg: 'degrees or turns ("5 degrees", "a quarter turn")', percent: 'percent ("30%")',
  time: 'seconds, milliseconds or beats ("0.4s", "300ms", "2 beats")', db: 'dB ("3 dB")',
  pitch: 'semitones or octaves ("2 semitones")', metres: 'metres or centimetres ("1.5m", "50cm")',
}

const KIND_SAYS: Record<PointKind, string> = {
  distance: 'a distance', text: 'a text size', turns: 'a turn', size: 'a change of size', time: 'a time',
  opacity: 'an opacity', blur: 'a blur', volume: 'a volume', pitch: 'a pitch', pan: 'a pan', world: 'a world distance',
}

const round = (n: number): number => Math.round(n * 10_000) / 10_000

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** A raw unit amount: `{ family, value in the family's base unit }`. */
function unitAmount(text: string, tempo: number | undefined): { family: Family; value: number } | undefined {
  for (const [pattern, family, factor] of UNITS) {
    const m = pattern.exec(text)
    if (!m) continue
    const before = text.slice(0, m.index)
    // A unit must follow a number: "50cm" yes, "seconds" alone no, "atom" (…m) no.
    const n = quantity(before)
    if (n === undefined) continue
    if (factor === 'beat') {
      if (!tempo) throw new Error(`"${text}" is in beats, but there is no tempo. Set one, or say it in seconds.`)
      return { family, value: n * (60_000 / tempo) }
    }
    return { family, value: n * factor }
  }
  return undefined
}

// ── the reader ─────────────────────────────────────────────────────────────

/** A point reader. `points()` is the standard one; pass a basis, words, a frame or a tempo to change it. */
export function points(options: PointsOptions = {}): Points {
  const words: Record<string, number | string> = { ...POINT_WORDS, ...lowerKeys(options.words ?? {}) }
  const scale = options.frame && !options.exact
    ? Math.min(options.frame.width, options.frame.height) / 1080
    : 1

  for (const kind of Object.keys(options.basis ?? {})) {
    if (!(POINT_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`There is no point basis for "${kind}". Kinds: ${POINT_KINDS.join(', ')}.`)
    }
  }

  /** A raw amount in a kind's unit, frame-scaled for pixels. */
  const raw = (text: string, kind: PointKind): number | undefined => {
    const u = unitAmount(text, options.tempo)
    if (!u) return undefined
    if (u.family !== FAMILY[kind]) {
      throw new Error(`"${text}" can't be ${KIND_SAYS[kind]}: ${KIND_SAYS[kind].replace(/^an? /, '')} is measured in ${FAMILY_SAYS[FAMILY[kind]]}.`)
    }
    return u.family === 'px' ? u.value * scale : u.value
  }

  const basisOf = (kind: PointKind): { value: number; unit: string; set: boolean } => {
    const set = options.basis?.[kind]
    if (set === undefined && kind === 'text') return basisOf('distance')
    if (set === undefined && kind === 'time' && options.tempo) {
      return { value: round(60_000 / options.tempo / 8), unit: 'ms', set: false }
    }
    const said = set ?? POINT_BASIS[kind as Exclude<PointKind, 'text'>]
    if (typeof said === 'number') {
      return { value: FAMILY[kind] === 'px' ? said * scale : said, unit: POINT_UNITS[kind], set: set !== undefined }
    }
    const value = raw(normalise(said), kind)
    if (value === undefined) {
      throw new Error(`The point basis for ${kind} "${said}" needs a number and a unit: ${FAMILY_SAYS[FAMILY[kind]]}.`)
    }
    if (value <= 0) throw new Error(`The point basis for ${kind} must be more than zero, not "${said}".`)
    return { value, unit: POINT_UNITS[kind], set: set !== undefined }
  }

  /** Points said as points, hairs or a word; undefined if the text is none of those. */
  const pointCount = (text: string, kind: PointKind): { points?: number; exact?: number } | undefined => {
    if (text in words) {
      const w = words[text]
      if (typeof w === 'number') return { points: w }
      const exact = raw(normalise(w), kind)
      if (exact === undefined) throw new Error(`"${text}" is set to "${w}", which isn't an amount.`)
      return { exact }
    }
    const pts = /^(.*?)\s*(points?|pts?)$/.exec(text)
    if (pts) {
      const n = quantity(pts[1] || '')
      if (n !== undefined) return { points: n }
    }
    const hairs = /^(.*?)\s*hairs?$/.exec(text)
    if (hairs) {
      const n = quantity(hairs[1] || '')
      const hair = words['a hair']
      if (n !== undefined && typeof hair === 'number') return { points: n * hair }
    }
    return undefined
  }

  const accepts = (kind: PointKind): string =>
    `Say points ("2 points", "1.5 points"), hairs ("a hair", "3 hairs"), a word (${Object.keys(words).join(', ')}) or ${FAMILY_SAYS[FAMILY[kind]]}.`

  const explain = (amount: string | number, kind: PointKind): PointReading => {
    if (!(POINT_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`There is no amount kind "${kind}". Kinds: ${POINT_KINDS.join(', ')}.`)
    }
    const unit = POINT_UNITS[kind]
    const show = (v: number) => `${round(v)}${unit === 'semitones' ? ' semitones' : unit === 'dB' ? ' dB' : unit}`
    if (typeof amount === 'number') {
      const value = round(amount * basisOf(kind).value)
      return { value, unit, points: amount, said: String(amount), how: `${amount} points = ${show(value)}` }
    }
    const text = normalise(amount)
    const counted = pointCount(text, kind)
    if (counted?.points !== undefined) {
      const value = round(counted.points * basisOf(kind).value)
      const pts = `${round(counted.points)} ${counted.points === 1 ? 'point' : 'points'}`
      const how = /(points?|pts?)$/.test(text) ? `${pts} = ${show(value)}` : `"${amount.trim()}" = ${pts} = ${show(value)}`
      return { value, unit, points: counted.points, said: amount, how }
    }
    if (counted?.exact !== undefined) {
      const value = round(counted.exact)
      return { value, unit, said: amount, how: `"${amount.trim()}" = ${show(value)}` }
    }
    const value = raw(text, kind)
    if (value !== undefined) {
      const v = round(value)
      return { value: v, unit, said: amount, how: scale !== 1 && unit === 'px' ? `${amount.trim()} = ${show(v)} at this frame` : `${amount.trim()}` }
    }
    throw new Error(`I can't read "${amount}" as ${KIND_SAYS[kind]}. ${accepts(kind)}`)
  }

  const reader: Points = {
    options,
    read: (amount, kind) => explain(amount, kind).value,
    explain,
    css(amount, kind) {
      const v = explain(amount, kind).value
      if (kind === 'turns') return `${v}deg`
      if (kind === 'time') return `${v}ms`
      if (kind === 'opacity') return `${v}%`
      return `${v}px`
    },
    basis: basisOf,
    isPoints(amount) {
      if (typeof amount !== 'string') return false
      const text = normalise(amount)
      if (text in words) return true
      const pts = /^(.*?)\s*(points?|pts?)$/.exec(text)
      if (pts && quantity(pts[1] || '') !== undefined) return true
      const hairs = /^(.*?)\s*hairs?$/.exec(text)
      return !!hairs && quantity(hairs[1] || '') !== undefined
    },
    step(count, comparative) {
      const factor = comparativeFactor(normalise(comparative))
      if (factor === undefined) {
        throw new Error(`I can't read "${comparative}" as a change. Say more, a bit more, much more, less, much less, twice as much, half as much or "3 times as much".`)
      }
      return round(count * factor)
    },
    classify(amount) {
      if (typeof amount !== 'string') return undefined
      const text = normalise(amount)
      if (reader.isPoints(text)) return 'points'
      if (comparativeFactor(text) !== undefined) return 'comparative'
      try {
        return unitAmount(text, options.tempo ?? 60) ? 'unit' : undefined
      } catch {
        return undefined
      }
    },
    with(more) {
      return points({
        ...options,
        ...more,
        basis: { ...options.basis, ...more.basis },
        words: { ...options.words, ...more.words },
      })
    },
  }
  return reader
}

const AS = '(much|far|long|big|loud|high|wide|tall)'

/** How a comparative scales the last amount, or undefined if it isn't one. */
function comparativeFactor(c: string): number | undefined {
  const times = new RegExp('^(\\S+(?: and a half)?) times as ' + AS + '$').exec(c)
  if (times) return quantity(times[1])
  if (/^(a (little|bit|touch) )?more$|^further$|^a (little|bit) further$/.test(c)) return 2
  if (/^(much|a lot|far) (more|further)$/.test(c)) return 4
  if (/^(a (little|bit|touch) )?less$/.test(c)) return 0.5
  if (/^(much|a lot|far) less$/.test(c)) return 0.25
  if (new RegExp(`^(twice|double)( as ${AS})?$`).test(c)) return 2
  if (new RegExp(`^half( as ${AS})?$`).test(c)) return 0.5
  return undefined
}

function lowerKeys<T>(o: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(o)) out[normalise(k)] = v
  return out
}
