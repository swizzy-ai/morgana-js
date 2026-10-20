/** Colours as hex strings, and the few operations generators and styles need. */

export type Rgb = [number, number, number]
export type Hsl = [number, number, number]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** '#1a6' or '#11aa66' → [r, g, b] in 0–1. */
export function rgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) throw new Error(`"${hex}" isn't a colour (use #rgb or #rrggbb)`)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function hex([r, g, b]: Rgb): string {
  const to = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function toHsl([r, g, b]: Rgb): Hsl {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export function fromHsl([h, s, l]: Hsl): Rgb {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

/** Between two colours: 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b)
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** Turn the hue by degrees, and move saturation and lightness by amounts. */
export function shift(colour: string, hue = 0, saturation = 0, lightness = 0): string {
  const [h, s, l] = toHsl(rgb(colour))
  return hex(fromHsl([(h + hue + 360) % 360, clamp01(s + saturation), clamp01(l + lightness)]))
}
