// Words → numbers, colours, seeded randomness, noise and easing.
import { COLORS, SURFACES, type Ease, type Surface } from '../words'

// ── colour ──────────────────────────────────────────────────────────────────

const MODIFIERS = ['light', 'dark', 'pale', 'deep'] as const

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
}

function toHsl([r, g, b]: number[]): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function fromHsl([h, s, l]: number[]): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}

function modify(hex: string, mods: string[]): string {
  let [h, s, l] = toHsl(hexToRgb(hex))
  for (const m of mods) {
    if (m === 'light') l = Math.min(0.95, l + 0.15)
    if (m === 'dark') l = Math.max(0.05, l - 0.15)
    if (m === 'pale') { l = Math.min(0.95, l + 0.22); s *= 0.6 }
    if (m === 'deep') { l = Math.max(0.05, l - 0.08); s = Math.min(1, s * 1.2) }
  }
  return rgbToHex(fromHsl([h, s, l]))
}

/** `'gold'`, `'dark gold'`, `'#e9b23c'` → hex. */
export function color(phrase: string): string {
  if (phrase.startsWith('#')) return phrase
  const words = phrase.trim().split(/\s+/)
  const mods = words.filter((w) => (MODIFIERS as readonly string[]).includes(w))
  const name = words.filter((w) => !(MODIFIERS as readonly string[]).includes(w)).join(' ')
  const base = COLORS[name]
  if (!base) throw new Error(`Unknown colour "${phrase}". Known: ${Object.keys(COLORS).join(', ')}`)
  return modify(base, mods)
}

/** sRGB hex → linear RGB, which is what glTF stores. */
export function linear(hex: string): [number, number, number] {
  return hexToRgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number]
}

export interface ResolvedSurface { name: string; color: string; metal: number; rough: number; glow?: string; see?: number }

/** `'dark wood'`, `'glow orange'`, `'plastic red'`, `'gold'`, `'sky'` → a surface. */
export function surface(looks = 'plastic'): ResolvedSurface {
  const words = looks.trim().split(/\s+/)
  const key = words.find((w) => SURFACES[w])
  const preset: Surface = key ? SURFACES[key] : { color: 'white', metal: 0, rough: 0.7 }
  const rest = words.filter((w) => w !== key)
  const mods = rest.filter((w) => (MODIFIERS as readonly string[]).includes(w))
  const named = rest.filter((w) => !(MODIFIERS as readonly string[]).includes(w))
  const hex = named.length ? color([...mods, ...named].join(' ')) : modify(color(preset.color), mods)
  return { name: looks, color: hex, metal: preset.metal, rough: preset.rough, glow: preset.glow ? hex : undefined, see: preset.see }
}

// ── words → numbers ─────────────────────────────────────────────────────────

export function word<T extends string>(table: Record<T, number>, v: T | number | string, what: string): number {
  if (typeof v === 'number') return v
  const n = (table as Record<string, number>)[v]
  if (n === undefined) throw new Error(`Unknown ${what} "${v}". Known: ${Object.keys(table).join(', ')}`)
  return n
}

// ── randomness and noise ────────────────────────────────────────────────────

export function seeded(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Smooth value noise in 0–1. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi)
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed)
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), xf), mix(c(0, 1, 0), c(1, 1, 0), xf), yf),
    mix(mix(c(0, 0, 1), c(1, 0, 1), xf), mix(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  )
}

/** Layered noise: big shapes plus finer detail. */
export function fbm(x: number, y: number, z: number, seed = 0, octaves = 4): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 17)
    norm += amp; amp *= 0.5; freq *= 2
  }
  return sum / norm
}

// ── easing ──────────────────────────────────────────────────────────────────

export function ease(kind: Ease, u: number): number {
  switch (kind) {
    case 'linear': return u
    case 'in': return u * u * u
    case 'out': return 1 - Math.pow(1 - u, 3)
    case 'gently':
    case 'in-out': return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
    case 'spring': return u >= 1 ? 1 : 1 - Math.cos(u * Math.PI * 4.5) * Math.exp(-u * 6)
    case 'bounce': {
      const n = 7.5625, d = 2.75
      if (u < 1 / d) return n * u * u
      if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75
      if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375
      return n * (u -= 2.625 / d) * u + 0.984375
    }
  }
}
