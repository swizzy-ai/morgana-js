/**
 * Named gradients — store once, apply anywhere a background works.
 *
 * A gradient resolves to a plain CSS background string, which is why it
 * flows down the exact same pipes as a color: `make('gradient:sunset')`,
 * `make('sunset')` once registered, and `bg: 'gradient:sunset'`. What it
 * does NOT do: `color` (CSS has no gradient text color — that needs
 * background-clip, a separate feature) or `borderColor` (needs border-image).
 *
 * Registration rides the transformers channel (`ctx.ui.transformers`,
 * domain `gradients`): define/add during the shape phase populates this
 * module registry live, and the mutations replay into the manifest style
 * JSON so the browser hydrates the same registry at boot.
 */
import type { GradientSpec } from '@studiomorgana/sdk'

const registry = new Map<string, string>()

const HEX = /^#([0-9a-f]{3,8})$/i
const FN_COLOR = /^(rgb|hsl)a?\(.+\)$/i
const WORD_COLOR = /^[a-z][a-z0-9-]*$/i

function isColorLike(color: unknown): boolean {
  if (typeof color !== 'string') return false
  const v = color.trim()
  return v !== '' && (HEX.test(v) || FN_COLOR.test(v) || WORD_COLOR.test(v))
}

function stopAt(at: unknown, index: number, total: number): string {
  if (typeof at === 'number' && Number.isFinite(at)) return `${Math.max(0, Math.min(100, at))}%`
  if (typeof at === 'string' && at.trim() !== '') {
    const v = at.trim()
    if (/^\d+(\.\d+)?$/.test(v)) return `${Math.max(0, Math.min(100, Number(v)))}%`
    if (/^\d+(\.\d+)?%$/.test(v)) return v
    return v
  }
  // Omitted stops spread evenly across the run.
  return total <= 1 ? '0%' : `${Math.round((index / (total - 1)) * 100)}%`
}

/** Validate a spec — returns the failure reason, or null when it resolves. */
export function validateGradientSpec(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return 'gradient spec must be an object'
  const s = spec as Record<string, unknown>
  if (s['type'] !== 'linear' && s['type'] !== 'radial' && s['type'] !== 'conic') {
    return `gradient type must be linear, radial or conic (got ${JSON.stringify(s['type'])})`
  }
  if (!Array.isArray(s['stops']) || s['stops'].length < 2) return 'gradient needs at least 2 stops'
  for (let i = 0; i < s['stops'].length; i += 1) {
    const stop = s['stops'][i] as Record<string, unknown> | null
    if (!stop || typeof stop !== 'object') return `gradient stop ${i} must be an object`
    if (!isColorLike(stop['color'])) return `gradient stop ${i} has no usable color`
  }
  return null
}

/** Resolve a validated spec (or a raw CSS string) to a background value. */
export function gradientToCss(spec: GradientSpec | string): string {
  if (typeof spec === 'string') return spec
  const type = spec.type
  const stops = spec.stops
    .map((s, i) => `${String(s.color).trim()} ${stopAt(s.at, i, spec.stops.length)}`)
    .join(', ')
  if (type === 'linear') {
    const angle = spec.angle === undefined ? '135deg' : typeof spec.angle === 'number' ? `${spec.angle}deg` : String(spec.angle)
    return `linear-gradient(${angle}, ${stops})`
  }
  if (type === 'radial') {
    const pos = spec.angle === undefined ? '' : ` ${String(spec.angle)}`
    return `radial-gradient(circle${pos}, ${stops})`
  }
  const from = spec.angle === undefined ? '' : `from ${typeof spec.angle === 'number' ? `${spec.angle}deg` : String(spec.angle)}, `
  return `conic-gradient(${from}${stops})`
}

/** Register a gradient — throws naming the failure, never stores garbage. */
export function defineGradient(name: string, spec: GradientSpec | string): string {
  const key = String(name).trim().toLowerCase()
  if (!key) throw new Error('[Morgana] gradient name must not be empty')
  if (typeof spec === 'string') {
    if (spec.trim() === '') throw new Error(`[Morgana] gradient "${name}" has an empty value`)
    registry.set(key, spec.trim())
    return spec.trim()
  }
  const bad = validateGradientSpec(spec)
  if (bad) throw new Error(`[Morgana] gradient "${name}" is invalid: ${bad}`)
  const css = gradientToCss(spec)
  registry.set(key, css)
  return css
}

/** Resolved background CSS for a name, or null when unknown. */
export function resolveGradient(name: string): string | null {
  return registry.get(String(name).trim().toLowerCase()) ?? null
}

export function hasGradient(name: string): boolean {
  return registry.has(String(name).trim().toLowerCase())
}

/** Test/backfill hook — the compile lane owns population. */
export function clearGradients(): void {
  registry.clear()
}
