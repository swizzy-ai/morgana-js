// Motions → a pose at any moment. One evaluator serves 2D and 3D: the
// emitters sample it into glTF keyframes, CSS keyframes or sprite frames.
// This is where the words become maths, and the only place they do.
import type { Motion } from '../index'
import { STRENGTH, TIMING, TRAVEL_2D, TRAVEL_3D, rotationAxis, swingAxis, turnDegrees, type FlipWay, type SwingWay, type Turn, type TurnDirection } from '../words'
import { ease, word } from './util'

export type Dim = '2d' | '3d'
export type V3 = [number, number, number]

/** A change from the rest pose: added translation and rotation (degrees), multiplied scale and opacity. */
export interface Pose { t: V3; r: V3; s: V3; o: number }

export interface ClipInfo { name: string; duration: number; loop: boolean }

const DIRECTIONS: Record<Dim, Record<string, V3>> = {
  '3d': { up: [0, 1, 0], down: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], forward: [0, 0, 1], back: [0, 0, -1] },
  // 2D is screen space: y grows downwards.
  '2d': { up: [0, -1, 0], down: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], forward: [0, 0, 0], back: [0, 0, 0] },
}

export const seconds = (m: Motion) => word(TIMING, m.duration, 'timing')

export function clipInfo(name: string, motions: Motion[]): ClipInfo {
  const duration = Math.max(0.1, ...motions.map((m) => m.delay + seconds(m)))
  return { name, duration, loop: motions.some((m) => m.loop) }
}

export function rest(): Pose { return { t: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], o: 1 } }

/** The pose of one target at `time` seconds into a clip. `travel` scales 2D distances to pixels. */
export function poseAt(motions: Motion[], target: string, time: number, dim: Dim, travel = 1): Pose | null {
  const mine = motions.filter((m) => m.target === target)
  if (!mine.length) return null
  const p = rest()
  for (const m of mine) {
    const dur = seconds(m)
    const local = time - m.delay
    const u = local < 0 ? 0 : m.loop ? (local % dur) / dur : Math.min(1, local / dur)
    const e = ease(m.ease, u)
    const a = 2 * Math.PI * (u + m.phase)
    const dist = () => word(dim === '3d' ? TRAVEL_3D : TRAVEL_2D, m.amount as string, 'amount') * travel
    const strength = () => word(STRENGTH, m.amount as string, 'amount')
    switch (m.kind) {
      case 'turns': {
        const { axis, sign } = rotationAxis(m.way as TurnDirection, dim)
        p.r[axis] += sign * turnDegrees(m.amount as Turn) * e
        break
      }
      case 'spins': {
        const { axis, sign } = rotationAxis(m.way as TurnDirection, dim)
        p.r[axis] += sign * 360 * u
        break
      }
      case 'swings': p.r[swingAxis(m.way as SwingWay, dim)] += turnDegrees(m.amount as Turn) * Math.sin(a); break
      case 'moves': {
        const v = Array.isArray(m.direction) ? (m.direction as number[]) : DIRECTIONS[dim][m.direction]
        const d = dist() * e
        for (let i = 0; i < 3; i++) p.t[i] += (v[i] ?? 0) * d
        break
      }
      case 'bobs': p.t[1] += DIRECTIONS[dim].up[1] * dist() * (0.5 - 0.5 * Math.cos(a)); break
      case 'pulses': { const k = 1 + strength() * (0.5 - 0.5 * Math.cos(a)); p.s = p.s.map((v) => v * k) as V3; break }
      case 'squashes': {
        const k = strength() * Math.sin(a)
        p.s[1] *= 1 + k; p.s[0] *= 1 - 0.5 * k; p.s[2] *= 1 - 0.5 * k
        break
      }
      case 'fades': p.o *= 1 + ((m.amount as number) - 1) * e; break
      case 'blinks': p.s[1] *= Math.max(0.08, Math.min(1, Math.abs(u - 0.92) / 0.04)); break
      case 'flips': {
        const around = (m.way as FlipWay) !== 'over'
        if (dim === '2d') p.s[around ? 0 : 1] *= Math.cos(2 * Math.PI * u)
        else p.r[around ? 1 : 0] += 360 * u
        break
      }
      case 'grows': { const k = (m.amount as number) + (1 - (m.amount as number)) * e; p.s = p.s.map((v) => v * k) as V3; break }
    }
  }
  return p
}
