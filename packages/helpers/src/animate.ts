// animate — motion as sentences.
//
//   animate.fadeIn(card).whenItAppears()
//   animate.bounce(icon).when(button).clicked()
//   animate.move(box).right('large').slowly().when(button).clicked()
//   animate.pulse(dot).forever().now()
//
// An animation is: what moves, how (the preset), adjustments (slowly,
// forever, after…), then when it happens — now, when something is clicked,
// or as the page appears. Runs on Morgana's `handle.animate`.
import type { ObjectHandle, Points } from '@studiomorgana/sdk'
import type { Size } from './words'
import { duration, type Duration } from './time'
import { STANDARD_POINTS } from './words'

type Handle = ObjectHandle<any>
type Target = Handle | string

/** Morgana's preset names, and the `make()` word each one has (for page-load motion). */
const PRESETS = {
  fadeIn: 'fade-in', fadeOut: 'fade-out',
  slideUp: 'slide-up', slideDown: 'slide-down', slideLeft: undefined, slideRight: undefined,
  slideIn: undefined, slideOut: undefined,
  scaleIn: 'scale-in', scaleOut: 'scale-out',
  pulse: 'pulse', bounce: 'bounce', spin: 'spin', sway: undefined, smooth: 'smooth', bouncy: 'bouncy',
} as const
type Preset = keyof typeof PRESETS

type Direction = 'left' | 'right' | 'up' | 'down'
/** How far: a size word, pixels, points ('2 points', 'a little', '3 hairs') or '14px'. */
type Distance = Exclude<Size, 'none'> | number | (string & {})

/** How far `move` travels, in pixels. */
const TRAVEL: Record<Exclude<Size, 'none'>, number> = { tiny: 4, small: 8, medium: 16, large: 32, huge: 64 }

/** Events an animation can wait for, and the page event each one is. */
const TRIGGERS = {
  clicked: 'clicked', changed: 'changed', submitted: 'submitted', selected: 'selected',
  opened: 'opened', closed: 'closed', hovered: 'hover', focused: 'focus',
} as const
export type Trigger = keyof typeof TRIGGERS
export type WhenTriggers = { [T in Trigger]: () => void }

interface Options {
  duration?: number
  delay?: number
  loop?: boolean | number
  alternate?: boolean
  easing?: string
  from?: Direction
  to?: Direction
  turns?: number
  axis?: 'x' | 'y'
}

interface Env {
  find(thing: Target): Handle
  inBrowser(): boolean
  /** The theme's point reader: '2 points', 'a little', '4 points' of time. */
  points?: Points
}

export class Animation {
  protected opts: Options = {}

  constructor(
    protected readonly env: Env,
    protected readonly thing: Target,
    protected readonly preset: Preset | null,
    protected keyframes: Keyframe[] | null = null,
  ) {}

  private gap: number | null = null

  // ---- timing: every duration reads as English — 'quick', 'slow', '2s', '300ms', 'half a second' ----

  /** How long one run lasts: `.for('2s')`, `.for('slow')`, `.for(400)`. */
  for(length: Duration): this { this.opts.duration = duration(length, this.env.points); return this }
  /** Shorthand for `.for('slow')`. */
  slowly(): this { return this.for('slow') }
  /** Shorthand for `.for('quick')`. */
  quickly(): this { return this.for('quick') }
  /** Waits before starting: `.after('1s')`. */
  after(wait: Duration): this { this.opts.delay = duration(wait, this.env.points); return this }
  /** Plays again on a rhythm, with a rest between: `.every('5s')`. Browser only. */
  every(interval: Duration): this { this.gap = duration(interval, this.env.points); return this }
  /** Repeats back to back until the page changes. */
  forever(): this { this.opts.loop = true; return this }
  /** Repeats this many times. */
  times(count: number): this { this.opts.loop = count; return this }
  /** Plays out and back each time instead of restarting. */
  backAndForth(): this { this.opts.alternate = true; return this }
  /** Slides come in from this side. */
  from(side: Direction): this { this.opts.from = side; return this }
  /** Slides leave toward this side. */
  toward(side: Direction): this { this.opts.to = side; return this }
  /** Spins: how many full turns. */
  turns(count: number): this { this.opts.turns = count; return this }
  /** Sway: side to side ('x') or up and down ('y'). */
  along(axis: 'x' | 'y'): this { this.opts.axis = axis; return this }
  /** Any CSS easing: 'ease-in-out', 'linear', a cubic-bezier. */
  easing(curve: string): this { this.opts.easing = curve; return this }

  // ---- when it happens ----

  /** Play it now (browser actions). With `.every(…)`, keeps playing on that rhythm. */
  now(): Promise<void> {
    if (!this.env.inBrowser()) {
      throw new Error('[helpers] animate…now() plays in browser actions. In a compile action use .whenItAppears().')
    }
    if (this.gap !== null) {
      const gap = this.gap
      this.gap = null
      const run = () => this.play().then(() => { setTimeout(run, gap) })
      return run()
    }
    return this.play()
  }

  private play(): Promise<void> {
    const a = (this.env.find(this.thing) as unknown as { animate: Record<string, (o?: Options) => Promise<void>> & { to(k: Keyframe[], o?: Options): Promise<void> } }).animate
    if (this.keyframes) return a.to(this.keyframes, { fill: 'forwards', ...this.opts } as Options)
    return a[this.preset as string](this.opts)
  }

  /** Play it when something happens: `.when(button).clicked()`. */
  when(trigger: Target): WhenTriggers {
    const out = {} as WhenTriggers
    for (const [name, event] of Object.entries(TRIGGERS) as [Trigger, string][]) {
      out[name] = () => {
        if (!this.env.inBrowser()) {
          throw new Error('[helpers] animate…when() wires events in browser actions — put it in a `loaded` action.')
        }
        this.env.find(trigger).when(event as never, () => { void this.now() })
      }
    }
    return out
  }

  /**
   * Play it as the page appears. In a compile action this is pure CSS — the
   * object ships with the motion word and no script. In the browser, it plays now.
   */
  whenItAppears(): void {
    if (this.env.inBrowser()) { void this.now(); return }
    // Page-load motion is a make() word with its own fixed timing (GAPS.md #14).
    if (Object.keys(this.opts).length > 0 || this.gap !== null) {
      throw new Error('[helpers] Page-load motion cannot take timing yet (for/after/every/times). Play it with .now() in a `loaded` browser action instead.')
    }
    const word = this.preset ? PRESETS[this.preset] : undefined
    if (!word) {
      throw new Error(`[helpers] ${this.preset ?? 'move'} has no page-load form. Use .now() in a \`loaded\` browser action.`)
    }
    this.env.find(this.thing).make(word)
  }
}

/** `animate.move(box).right('large')` — travel and stay there. */
export class Move extends Animation {
  private dx = 0
  private dy = 0

  private go(dir: Direction, distance: Distance): this {
    // A size word keeps its travel; points and px read with the theme's basis.
    const px = typeof distance === 'number' ? distance
      : Object.hasOwn(TRAVEL, distance) ? TRAVEL[distance as Exclude<Size, 'none'>]
        : (this.env.points ?? STANDARD_POINTS).read(distance, 'distance')
    if (dir === 'left') this.dx -= px
    if (dir === 'right') this.dx += px
    if (dir === 'up') this.dy -= px
    if (dir === 'down') this.dy += px
    this.keyframes = [{ transform: 'translate(0, 0)' }, { transform: `translate(${this.dx}px, ${this.dy}px)` }]
    return this
  }

  left(distance: Distance = 'medium'): this { return this.go('left', distance) }
  right(distance: Distance = 'medium'): this { return this.go('right', distance) }
  up(distance: Distance = 'medium'): this { return this.go('up', distance) }
  down(distance: Distance = 'medium'): this { return this.go('down', distance) }
  /** Back where it started. */
  home(): this {
    this.keyframes = [{ transform: `translate(${this.dx}px, ${this.dy}px)` }, { transform: 'translate(0, 0)' }]
    this.dx = 0
    this.dy = 0
    return this
  }
}

export type Animate = { [P in Preset]: (thing: Target) => Animation } & {
  /** Travel: `animate.move(box).right('large')`. */
  move(thing: Target): Move
  /** A quick side-to-side shake — "no", "wrong", "look here". */
  shake(thing: Target): Animation
  /** Grow a touch and settle — "done", "new". */
  pop(thing: Target): Animation
  /** Your own keyframes. */
  custom(thing: Target, keyframes: Keyframe[]): Animation
}

export function makeAnimate(env: Env): Animate {
  const out: Record<string, unknown> = {}
  for (const preset of Object.keys(PRESETS) as Preset[]) {
    out[preset] = (thing: Target) => new Animation(env, thing, preset)
  }
  out.move = (thing: Target) => new Move(env, thing, null, [])
  out.shake = (thing: Target) =>
    new Animation(env, thing, null, [
      { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' },
    ]).for(400)
  out.pop = (thing: Target) =>
    new Animation(env, thing, null, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }]).for(300)
  out.custom = (thing: Target, keyframes: Keyframe[]) => new Animation(env, thing, null, keyframes)
  return out as Animate
}
