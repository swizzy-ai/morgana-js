/**
 * `@studiomorgana/assets` — 2D and 3D assets, built from words.
 *
 * An asset is a file in `src/assets/` that exports `defineAsset({...})`. It is
 * plain data: shapes and parts placed relative to each other (`on`, `beside`,
 * `against`), surfaces by name (`looks: 'dark wood'`) and motion by verb
 * (`motion(lid).turns('a third', 'backward').over('slow')`). The plugin turns
 * it into standard files at build: glTF for 3D; SVG, animated SVG and sprite
 * sheets for 2D. Pages point at them by name: `src: 'asset:coin'`.
 *
 * Nothing here draws. Every builder records what you said; the compiler
 * resolves words to numbers.
 */
import type { Direction, Ease, FlipWay, Side, Size, SwingWay, Timing, Turn, TurnDirection } from './words'
import { rotationAxis, turnDegrees } from './words'

export type { Direction, Ease, FlipWay, Side, Size, SwingWay, Timing, Turn, TurnDirection }
export { words } from './words'
type Amount = Size | number

// ── motion ──────────────────────────────────────────────────────────────────

export type MotionKind =
  | 'turns' | 'spins' | 'swings' | 'moves' | 'bobs' | 'pulses'
  | 'squashes' | 'fades' | 'blinks' | 'flips' | 'grows'

/** One verb applied to one part or layer. Chain the modifiers. */
export class Motion {
  target: string
  kind: MotionKind = 'turns'
  /** turns/spins: a TurnDirection; swings: a SwingWay; flips: a FlipWay. */
  way: string = 'clockwise'
  amount: Amount | Turn = 'small'
  direction: Direction | number[] = 'up'
  duration: Timing | number = 'normal'
  ease: Ease = 'in-out'
  loop = false
  phase = 0
  delay = 0

  constructor(target: string) { this.target = target }

  private verb(kind: MotionKind, loop: boolean): this { this.kind = kind; this.loop = loop; return this }

  /** Turn once, and stay there: `turns('a third', 'backward')`. */
  turns(amount: Turn | number, direction: TurnDirection): this { this.amount = amount; this.way = direction; return this.verb('turns', false) }
  /** Full turns, forever. */
  spins(direction: TurnDirection = 'clockwise'): this { this.way = direction; this.ease = 'linear'; return this.verb('spins', true) }
  /** Back and forth, forever — legs, pendulums, tails: `swings('a bit', 'forward and back')`. */
  swings(amount: Turn | number, way: SwingWay = 'forward and back'): this { this.amount = amount; this.way = way; return this.verb('swings', true) }
  /** Travel once in a direction. */
  moves(direction: Direction | number[], amount: Amount = 'small'): this { this.direction = direction; this.amount = amount; return this.verb('moves', false) }
  /** Up and back down, forever. */
  bobs(amount: Amount = 'small'): this { this.amount = amount; return this.verb('bobs', true) }
  /** Grow and shrink, forever. */
  pulses(amount: Amount = 'small'): this { this.amount = amount; return this.verb('pulses', true) }
  /** Squash and stretch, keeping its volume, forever. */
  squashes(amount: Amount = 'small'): this { this.amount = amount; return this.verb('squashes', true) }
  /** Fade out once (to `to`, 0 by default). */
  fades(to = 0): this { this.amount = to; return this.verb('fades', false) }
  /** Close briefly, once per cycle — eyes, lights. */
  blinks(): this { return this.verb('blinks', true) }
  /** Flip forever: `'around'` like a spinning coin, `'over'` end over end. */
  flips(way: FlipWay = 'around'): this { this.way = way; this.ease = 'linear'; return this.verb('flips', true) }
  /** Grow from `from` (0 by default) to full size, once. */
  grows(from = 0): this { this.amount = from; return this.verb('grows', false) }

  over(duration: Timing | number): this { this.duration = duration; return this }
  eases(ease: Ease): this { this.ease = ease; return this }
  loops(): this { this.loop = true; return this }
  once(): this { this.loop = false; return this }
  /** Start this far into a cycle (0–1): `offset(0.5)` moves opposite to the rest. */
  offset(phase: number): this { this.phase = phase; return this }
  after(seconds: number): this { this.delay = seconds; return this }
}

export function motion(target: { id: string } | string): Motion {
  return new Motion(typeof target === 'string' ? target : target.id)
}

// ── 2D ──────────────────────────────────────────────────────────────────────

export type Shape2D = 'circle' | 'ellipse' | 'rect' | 'star' | 'polygon' | 'heart' | 'path'
export type Place2D = Side | `${'top' | 'bottom' | 'center'} ${'left' | 'right' | 'center'}` | [number, number]

export interface LayerOptions {
  /** A share of the canvas (0–1) or a word. `[w, h]` for ellipses and rects. */
  size?: Amount | 'full' | [Amount | 'full', Amount | 'full']
  fill?: string
  outline?: string
  outlineWidth?: 'thin' | 'medium' | 'thick' | number
  opacity?: number
  hidden?: boolean
  /** star: points; polygon: sides. */
  points?: number
  /** star: inner radius as a share of the outer. */
  inner?: number
  /** rect: corner roundness, 0–1. */
  round?: number
  /** heart: which half to draw. */
  half?: 'left' | 'right'
  /** path: SVG path data in a 100×100 box centred on 0,0. */
  d?: string
}

export class Layer {
  id: string
  shape: Shape2D
  opts: LayerOptions
  place: Place2D = 'center'
  nudges: Array<[Direction, Amount]> = []
  parent?: string
  pivotSide: Side = 'center'
  rotation = 0

  constructor(id: string, shape: Shape2D, opts: LayerOptions = {}) {
    this.id = id; this.shape = shape; this.opts = opts
  }

  /** Where its centre sits on the canvas: `'center'`, `'top left'`, or `[x, y]` as shares. */
  at(place: Place2D): this { this.place = place; return this }
  nudge(direction: Direction, amount: Amount = 'small'): this { this.nudges.push([direction, amount]); return this }
  /** Moves with another layer (positions stay in canvas terms). */
  on(parent: Layer | string): this { this.parent = typeof parent === 'string' ? parent : parent.id; return this }
  /** The point it turns and squashes around. */
  pivot(side: Side): this { this.pivotSide = side; return this }
  /** Turned at rest: `turned('an eighth')`, `turned(30, 'counterclockwise')`. */
  turned(amount: Turn | number, direction: TurnDirection = 'clockwise'): this {
    this.rotation += rotationAxis(direction, '2d').sign * turnDegrees(amount)
    return this
  }
}

export const circle = (id: string, o?: LayerOptions) => new Layer(id, 'circle', o)
export const ellipse = (id: string, o?: LayerOptions) => new Layer(id, 'ellipse', o)
export const rect = (id: string, o?: LayerOptions) => new Layer(id, 'rect', o)
export const star = (id: string, o?: LayerOptions) => new Layer(id, 'star', o)
export const polygon = (id: string, o?: LayerOptions) => new Layer(id, 'polygon', o)
export const heart = (id: string, o?: LayerOptions) => new Layer(id, 'heart', o)
export const path = (id: string, o?: LayerOptions) => new Layer(id, 'path', o)

// ── 3D ──────────────────────────────────────────────────────────────────────

export type Shape3D = 'box' | 'cylinder' | 'cone' | 'sphere' | 'rock' | 'terrain'
export type Size3D = Amount | [Amount, Amount, Amount]

export interface PartOptions {
  /** Metres or a word; `[width, height, depth]`. Cylinders and cones: `[diameter, height]`. */
  size?: Size3D | [Amount, Amount]
  /** A surface word: `'wood'`, `'dark metal'`, `'glow orange'`, `'plastic red'`. */
  looks?: string
  /** Round shapes: how many sides. Fewer is more low-poly. */
  sides?: number
  /** cone: the top's diameter as a share of the bottom (0 = a point). */
  top?: number
  /** rock, terrain: the random seed. */
  seed?: number
  /** rock: how lumpy, 0–1. */
  lumpy?: number
  /** terrain: grid resolution and the height of its peaks. */
  detail?: number
  peaks?: Amount
  /** terrain: what covers it, lowest to highest. */
  bands?: string[]
}

export class Part {
  id: string
  shape: Shape3D
  opts: PartOptions
  placement: { how: 'at' | 'on' | 'under' | 'beside' | 'in'; ref?: string; side?: Side; gap: number; point?: [number, number, number] } = { how: 'at', gap: 0, point: [0, 0, 0] }
  nudges: Array<[Direction, Amount]> = []
  parent?: string
  pivotSide: Side = 'center'
  rotation: [number, number, number] = [0, 0, 0]

  constructor(id: string, shape: Shape3D, opts: PartOptions = {}) {
    this.id = id; this.shape = shape; this.opts = opts
  }

  private rel(how: 'on' | 'under' | 'beside' | 'in', ref: Part | string, side?: Side, gap = 0): this {
    const id = typeof ref === 'string' ? ref : ref.id
    this.placement = { how, ref: id, side, gap }
    this.parent = id      // placed relative to something = attached to it
    return this
  }

  /** Sits on top of another part, centred, and moves with it. */
  on(ref: Part | string, gap = 0): this { return this.rel('on', ref, 'top', gap) }
  under(ref: Part | string, gap = 0): this { return this.rel('under', ref, 'bottom', gap) }
  /** Against one side of another part. */
  beside(ref: Part | string, side: Side, gap = 0): this { return this.rel('beside', ref, side, gap) }
  /** Flush with one face of another part, half sunk into it (a trim, a door, a label). */
  against(ref: Part | string, side: Side): this { return this.rel('in', ref, side, 0) }
  /** An exact point, in metres — the escape hatch. */
  at(x: number, y: number, z: number): this { this.placement = { how: 'at', gap: 0, point: [x, y, z] }; return this }
  nudge(direction: Direction, amount: Amount = 'small'): this { this.nudges.push([direction, amount]); return this }
  /** Moves with another part without being placed against it. */
  attach(parent: Part | string): this { this.parent = typeof parent === 'string' ? parent : parent.id; return this }
  /** The point it turns around: `pivot('top')` makes a leg swing from the hip. */
  pivot(side: Side): this { this.pivotSide = side; return this }
  /** A hinge along one side, for lids and doors: the same as `pivot(side)`. */
  hinged(side: Side): this { return this.pivot(side) }
  /** Turned at rest. Turns add up: `.turned('a quarter', 'forward').turned(20, 'left')`. */
  turned(amount: Turn | number, direction: TurnDirection): this {
    const { axis, sign } = rotationAxis(direction, '3d')
    this.rotation[axis] += sign * turnDegrees(amount)
    return this
  }
}

export const box = (id: string, o?: PartOptions) => new Part(id, 'box', o)
export const cylinder = (id: string, o?: PartOptions) => new Part(id, 'cylinder', o)
export const cone = (id: string, o?: PartOptions) => new Part(id, 'cone', o)
export const sphere = (id: string, o?: PartOptions) => new Part(id, 'sphere', o)
export const rock = (id: string, o?: PartOptions) => new Part(id, 'rock', o)
export const terrain = (id: string, o?: PartOptions) => new Part(id, 'terrain', o)

// ── the asset ───────────────────────────────────────────────────────────────

/** What a `build` function gets: the variant's seed and seeded randomness. */
export interface Kit {
  variant: string
  seed: number
  /** Seeded: the same variant builds the same asset on every machine. */
  random(): number
  /** A seeded number between `min` and `max`. */
  between(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

export type Clips = Record<string, Motion[]>
type Built<P> = P[] | { parts: P[]; animations?: Clips }

interface Common<P> {
  name: string
  /** Named variations. Each gets its own seed and may override layer/part options by id. */
  variants?: Record<string, { seed?: number; set?: Record<string, Record<string, unknown>> }>
  animations?: Clips
  /** Procedural assets: build the parts from the kit instead of listing them. */
  build?: (kit: Kit) => Built<P>
  parts?: P[]
}

export interface Asset2D extends Common<Layer> {
  kind: '2d'
  /** Canvas size in pixels (square). Default 128. */
  canvas?: number
  /** Sprite-sheet frames per second. Default 12. */
  fps?: number
}

export interface Asset3D extends Common<Part> {
  kind: '3d'
}

export type AssetDefinition = Asset2D | Asset3D

/** Identity helper: the plugin reads the definition. */
export function defineAsset<A extends AssetDefinition>(def: A): A {
  return def
}
