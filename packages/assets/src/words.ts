// The plain words assets accept, and the numbers they mean.
// A raw value (a number, '#fe9920') always passes through.
import { defineWords } from '@studiomorgana/sdk'

export type Size = 'tiny' | 'small' | 'medium' | 'large' | 'huge'
export type Timing = 'instant' | 'fast' | 'normal' | 'slow' | 'lazy'
export type Ease = 'linear' | 'in' | 'out' | 'in-out' | 'gently' | 'bounce' | 'spring'
export type Side = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'
export type Direction = 'up' | 'down' | 'left' | 'right' | 'forward' | 'back'

/** How far something turns. A number is degrees. */
export type Turn = 'a little' | 'a bit' | 'an eighth' | 'a quarter' | 'a third' | 'half' | 'full'
/** Which way it turns: around its upright (left/right), tipping (forward/backward), or as seen from the front. */
export type TurnDirection = 'left' | 'right' | 'forward' | 'backward' | 'clockwise' | 'counterclockwise'
/** Which way a swing goes. */
export type SwingWay = 'forward and back' | 'side to side' | 'left and right'
/** Which way a flip goes: over (end over end) or around (like a spinning coin). */
export type FlipWay = 'over' | 'around'

/** 3D lengths, in metres. */
export const LENGTH_3D: Record<Size, number> = { tiny: 0.2, small: 0.5, medium: 1, large: 2, huge: 5 }

/** 2D lengths, as a share of the canvas. */
export const LENGTH_2D: Record<Size | 'full', number> = { tiny: 0.1, small: 0.2, medium: 0.4, large: 0.6, huge: 0.8, full: 0.9 }

/** How far a motion travels: 3D in metres, 2D as a share of the canvas. */
export const TRAVEL_3D: Record<Size, number> = { tiny: 0.05, small: 0.15, medium: 0.4, large: 1, huge: 2 }
export const TRAVEL_2D: Record<Size, number> = { tiny: 0.02, small: 0.05, medium: 0.12, large: 0.25, huge: 0.45 }

/** How strongly a scale motion (pulse, squash) changes size. */
export const STRENGTH: Record<Size, number> = { tiny: 0.03, small: 0.08, medium: 0.15, large: 0.3, huge: 0.5 }

/** Durations, in seconds. */
export const TIMING: Record<Timing, number> = { instant: 0.1, fast: 0.4, normal: 1, slow: 2, lazy: 4 }

/** Turns, in degrees. */
export const TURN: Record<Turn, number> = { 'a little': 10, 'a bit': 25, 'an eighth': 45, 'a quarter': 90, 'a third': 120, half: 180, full: 360 }

/** Outline widths, in canvas pixels at a 128px canvas. */
export const OUTLINE: Record<'thin' | 'medium' | 'thick', number> = { thin: 1.5, medium: 3, thick: 5 }

/** Named colours. `'light'`, `'dark'`, `'pale'`, `'deep'` modify any of them: `'dark gold'`. */
export const COLORS: Record<string, string> = {
  white: '#f5f3ee', black: '#1b1a1f', grey: '#8b8d93', silver: '#c7cad1',
  red: '#e0453a', orange: '#f08a24', yellow: '#f4cc3a', gold: '#e9b23c',
  green: '#4fb453', lime: '#9bd447', teal: '#2fa59a', blue: '#3c7be0',
  sky: '#8ec9f0', sea: '#2d79a8', navy: '#22355e', purple: '#8a55d4',
  pink: '#ec7fb0', brown: '#8a5a35', wood: '#a8713f', bark: '#5e3d24',
  sand: '#e2c98f', grass: '#5fa245', leaf: '#3f8a3a', pine: '#2f6b3e',
  stone: '#8d8a84', snow: '#f2f5f7', water: '#3d8fc4', slime: '#6fd36a',
}

/** 3D surface presets: `looks: 'wood'`, `'dark metal'`, `'glow orange'`, `'plastic red'`. */
export interface Surface { color: string; metal: number; rough: number; glow?: string; see?: number }
export const SURFACES: Record<string, Surface> = {
  wood: { color: 'wood', metal: 0, rough: 0.8 },
  bark: { color: 'bark', metal: 0, rough: 0.95 },
  metal: { color: 'silver', metal: 1, rough: 0.35 },
  iron: { color: 'grey', metal: 1, rough: 0.6 },
  gold: { color: 'gold', metal: 1, rough: 0.25 },
  stone: { color: 'stone', metal: 0, rough: 0.9 },
  grass: { color: 'grass', metal: 0, rough: 0.9 },
  leaf: { color: 'leaf', metal: 0, rough: 0.85 },
  pine: { color: 'pine', metal: 0, rough: 0.85 },
  sand: { color: 'sand', metal: 0, rough: 1 },
  snow: { color: 'snow', metal: 0, rough: 0.7 },
  rubber: { color: 'black', metal: 0, rough: 1 },
  plastic: { color: 'white', metal: 0, rough: 0.4 },
  glass: { color: 'sky', metal: 0, rough: 0.05, see: 0.35 },
  water: { color: 'water', metal: 0, rough: 0.1, see: 0.7 },
  glow: { color: 'white', metal: 0, rough: 0.5, glow: 'white' },
}

export function turnDegrees(t: Turn | number): number {
  if (typeof t === 'number') return t
  const d = TURN[t]
  if (d === undefined) throw new Error(`Unknown turn "${t}". Known: ${Object.keys(TURN).join(', ')}, or a number of degrees`)
  return d
}

/**
 * Where the maths hides: a turn direction → which axis, and which way round.
 * 3D uses y up and z towards the viewer. 2D has one axis; clockwise is on screen.
 */
export function rotationAxis(direction: TurnDirection, dim: '2d' | '3d'): { axis: 0 | 1 | 2; sign: 1 | -1 } {
  if (dim === '2d') return { axis: 2, sign: direction === 'counterclockwise' || direction === 'left' || direction === 'backward' ? -1 : 1 }
  switch (direction) {
    case 'left': return { axis: 1, sign: 1 }
    case 'right': return { axis: 1, sign: -1 }
    case 'forward': return { axis: 0, sign: 1 }
    case 'backward': return { axis: 0, sign: -1 }
    case 'clockwise': return { axis: 2, sign: -1 }
    case 'counterclockwise': return { axis: 2, sign: 1 }
    default: throw new Error(`Unknown direction "${direction}". Known: left, right, forward, backward, clockwise, counterclockwise`)
  }
}

export function swingAxis(way: SwingWay, dim: '2d' | '3d'): 0 | 1 | 2 {
  if (dim === '2d') return 2
  if (way === 'forward and back') return 0
  if (way === 'left and right') return 1
  if (way === 'side to side') return 2
  throw new Error(`Unknown swing "${way}". Known: forward and back, side to side, left and right`)
}

/** The vocabulary, as data, for `morgana spec`, types and (later) the language layer. */
export const words = defineWords({
  size: { means: 'metres (3D) or a share of the canvas (2D)', ...LENGTH_3D },
  travel: { means: 'how far a motion moves, in metres', ...TRAVEL_3D },
  strength: { means: 'how much a pulse or squash changes size', ...STRENGTH },
  timing: { means: 'seconds', ...TIMING },
  turn: { means: 'degrees', ...TURN },
  turnDirection: { means: 'which way a turn goes', left: 'around the upright', right: 'around the upright', forward: 'tipping', backward: 'tipping', clockwise: 'as seen from the front', counterclockwise: 'as seen from the front' },
  ease: { means: 'how a motion speeds up and slows down', linear: 'steady', in: 'starts slow', out: 'ends slow', 'in-out': 'slow at both ends', gently: 'slow at both ends', bounce: 'bounces at the end', spring: 'overshoots and settles' },
  colour: { means: 'a named colour; light, dark, pale and deep modify it', ...COLORS },
  looks: { means: 'a 3D surface; add a colour to tint it', ...Object.fromEntries(Object.keys(SURFACES).map((k) => [k, SURFACES[k].color])) },
})
