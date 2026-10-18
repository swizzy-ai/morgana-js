// Durations, read as English. Every timing word in helpers accepts:
//
//   speeds     'instant' 'quick' 'normal' 'slow' 'very slow'
//   amounts    '300ms'  '2s'  '1.5s'  '2 seconds'  '1 second'  '500 milliseconds'
//   words      'half a second'  'a second'  'a quarter second'
//   numbers    400  (milliseconds)
//   points     '4 points' (0.4s with the standard basis)  'a little'  '3 hairs'
import type { Points } from '@studiomorgana/sdk'
import { STANDARD_POINTS } from './words'

export type Speed = 'instant' | 'quick' | 'normal' | 'slow' | 'very slow'
export type Duration = Speed | number | (string & {})

const SPEEDS: Record<Speed, number> = { instant: 0, quick: 180, normal: 350, slow: 700, 'very slow': 1200 }

const PHRASES: Record<string, number> = {
  'a second': 1000, 'one second': 1000, 'half a second': 500, 'a half second': 500,
  'a quarter second': 250, 'quarter of a second': 250, 'a moment': 300,
}

/** Milliseconds for a duration word. Throws on something it cannot read, naming what it accepts. */
export function duration(value: Duration, pts: Points = STANDARD_POINTS): number {
  if (typeof value === 'number') return Math.max(0, value)
  const v = value.trim().toLowerCase()
  if (v in SPEEDS) return SPEEDS[v as Speed]
  if (v in PHRASES) return PHRASES[v]
  const m = /^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)$/.exec(v)
  if (m) {
    const n = Number(m[1])
    const unit = m[2]
    if (unit.startsWith('ms') || unit.startsWith('milli')) return n
    if (unit === 'm' || unit.startsWith('min')) return n * 60_000
    return n * 1000
  }
  if (pts.isPoints(v)) return pts.read(v, 'time')
  throw new Error(`[helpers] Cannot read the duration "${value}". Use a speed (quick, normal, slow), an amount ('2s', '300ms', '2 seconds'), points ('4 points') or milliseconds.`)
}
