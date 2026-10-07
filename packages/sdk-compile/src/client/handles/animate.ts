/**
 * Imperative animation — the runtime behind `handle.animate`.
 *
 * Presets mirror the `make()` animation vocabulary (`fade-in`, `slide-up`, …)
 * plus the horizontals CSS has no words for, driven through the Web Animations
 * API so every run has real timing, a promise, and a completion event. The
 * compile lane keeps a no-op of the same shape (declaration-time animation is
 * `make()` words); this module is browser-only.
 *
 * Distances are `Dim` — numbers are base-grid units, strings are named
 * measures — resolved to px here. A `'12px'` string is still accepted as an
 * escape hatch for values the system cannot express.
 */
import { extend, type HandleCtx } from './shared'

export interface AnimateRunOptions {
  duration?: number
  easing?: string
  delay?: number
  loop?: boolean | number
  /** Ping-pong each iteration out-and-back instead of restarting. */
  alternate?: boolean
  /** Sway axis. Horizontal by default. */
  axis?: string
  fill?: 'none' | 'forwards' | 'backwards' | 'both'
  distance?: unknown
  turns?: number
  from?: string
  to?: string
}

type KeyframeMap = Record<string, string | number>

/** Grid units (numbers) and named measures become px. Raw `'12px'` passes through. */
export function resolveDistanceToPx(
  distance: unknown,
  unit: number,
  measures: Record<string, number>,
): number {
  const u = typeof unit === 'number' && Number.isFinite(unit) && unit > 0 ? unit : 4
  if (typeof distance === 'number' && Number.isFinite(distance)) return distance * u
  if (typeof distance === 'string') {
    const s = distance.trim()
    const named = measures[s]
    if (typeof named === 'number' && Number.isFinite(named)) return named * u
    const px = /^([+-]?[\d.]+)px$/.exec(s)
    if (px) return parseFloat(px[1] as string)
    const n = Number(s)
    if (s !== '' && Number.isFinite(n)) return n * u
  }
  return 2 * u
}

/** `true` loops forever; anything else is a finite count (default 1). */
export function normalizeIterations(loop: unknown): number {
  if (loop === true) return Number.POSITIVE_INFINITY
  if (typeof loop === 'number' && Number.isFinite(loop) && loop > 0) return Math.floor(loop)
  return 1
}

const DIRS: Record<string, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

function slide(fromX: number, fromY: number, fade: boolean): KeyframeMap[] {
  const t = (x: number, y: number): string => `translate(${x}px, ${y}px)`
  return fade
    ? [
        { opacity: '0', transform: t(fromX, fromY) },
        { opacity: '1', transform: 'none' },
      ]
    : [{ transform: t(fromX, fromY) }, { transform: 'none' }]
}

/**
 * Keyframes for one preset at a resolved distance. Mirrors the compiled CSS
 * words (`fade-in` et al. in compile-ctx/tokens) so the runtime call and the
 * `make()` word read as the same motion. Returns null for unknown presets.
 */
export function presetKeyframes(
  preset: string,
  px: number,
  opts: AnimateRunOptions = {},
): KeyframeMap[] | null {
  const d = px
  switch (preset) {
    case 'fadeIn':
      return [{ opacity: '0' }, { opacity: '1' }]
    case 'fadeOut':
      return [{ opacity: '1' }, { opacity: '0' }]
    case 'slideUp':
      return slide(0, d, true)
    case 'slideDown':
      return slide(0, -d, true)
    case 'slideRight':
      return slide(-d, 0, true)
    case 'slideLeft':
      return slide(d, 0, true)
    case 'slideIn': {
      // From an edge: start displaced toward that edge, settle at rest.
      const [x, y] = DIRS[String(opts.from ?? 'left')] ?? [-1, 0]
      return slide(x * d, y * d, true)
    }
    case 'slideOut': {
      const [x, y] = DIRS[String(opts.to ?? 'right')] ?? [1, 0]
      const t = (xx: number, yy: number): string => `translate(${xx}px, ${yy}px)`
      return [
        { opacity: '1', transform: 'none' },
        { opacity: '0', transform: t(x * d, y * d) },
      ]
    }
    case 'scaleIn':
      return [
        { opacity: '0', transform: 'scale(0.96)' },
        { opacity: '1', transform: 'none' },
      ]
    case 'scaleOut':
      return [
        { opacity: '1', transform: 'none' },
        { opacity: '0', transform: 'scale(0.96)' },
      ]
    case 'pulse':
      return [{ opacity: '1' }, { opacity: '0.5', offset: 0.5 }, { opacity: '1' }]
    case 'bounce':
      return [
        { transform: 'translateY(0)', offset: 0 },
        { transform: `translateY(${-Math.max(2, Math.round(d * 0.75))}px)`, offset: 0.4 },
        { transform: 'translateY(0)', offset: 1 },
      ]
    case 'spin': {
      const turns = typeof opts.turns === 'number' && Number.isFinite(opts.turns) ? opts.turns : 1
      return [{ transform: 'rotate(0)' }, { transform: `rotate(${turns * 360}deg)` }]
    }
    case 'sway': {
      // A half-cycle drift. With `alternate` + `loop` the browser swings it
      // out and back forever — no JS loop, no timer, no rescheduling. The
      // distance is already resolved to px from base-grid units or a named
      // measure, so author code never carries a raw CSS length.
      const [x, y] = String((opts as { axis?: unknown }).axis ?? 'x') === 'y' ? [0, 1] : [1, 0]
      return [
        { opacity: '1', transform: 'none' },
        { opacity: '0', transform: `translate(${x * d}px, ${y * d}px)` },
      ]
    }
    case 'smooth':
      return slide(0, Math.max(1, Math.round(d * 0.5)), true)
    case 'bouncy':
      return [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.5 }, { transform: 'scale(1)' }]
    default:
      return null
  }
}

/** Per-preset timing — mirrors the compiled `morgana-anim-*` classes. */
export function presetDefaults(preset: string): { duration: number; easing: string; fill: 'none' | 'forwards' | 'backwards' | 'both' } {
  switch (preset) {
    case 'pulse':
    case 'bounce':
    case 'bouncy':
      return { duration: 800, easing: 'cubic-bezier(.28,.84,.42,1)', fill: 'none' }
    case 'spin':
      return { duration: 1000, easing: 'linear', fill: 'none' }
    case 'sway':
      return { duration: 1200, easing: 'ease-in-out', fill: 'none' }
    case 'fadeOut':
    case 'slideOut':
    case 'scaleOut':
      return { duration: 350, easing: 'ease-in', fill: 'forwards' }
    default:
      return { duration: 350, easing: 'ease-out', fill: 'backwards' }
  }
}

const WORD_TO_PRESET: Record<string, string> = {
  'fade-in': 'fadeIn',
  'fade-out': 'fadeOut',
  'slide-up': 'slideUp',
  'slide-down': 'slideDown',
  'slide-left': 'slideLeft',
  'slide-right': 'slideRight',
  'scale-in': 'scaleIn',
  'scale-out': 'scaleOut',
  pulse: 'pulse',
  bounce: 'bounce',
  spin: 'spin',
  smooth: 'smooth',
  bouncy: 'bouncy',
  sway: 'sway',
}

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

type AnimatableElement = Element & { animate?: (...args: unknown[]) => { finished?: Promise<void>; cancel?: () => void } }

/**
 * The run this module started per element. Cancelling the tracked run
 * directly is O(1) — it replaces the old scan of `el.getAnimations()`, which
 * walked every animation on the element on every call just to find the one
 * finished run to clear.
 */
const running = new WeakMap<object, { cancel?: () => void }>()

/** Settle without moving anything, across a macrotask boundary. */
function settleSkipped(settle: (cancelled: boolean) => void): Promise<void> {
  // A skipped run must still yield: an already-resolved promise would let a
  // consumer `await` it in a tight loop that never crosses a task boundary,
  // starving timers, I/O and the page load itself. One macrotask keeps every
  // awaiting loop cooperative.
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      settle(false)
      resolve()
    }, 0)
  })
}

/** Run keyframes on the handle's element; always settles, always emits. */
function run(ctx: HandleCtx, name: string, keyframes: KeyframeMap[], opts: AnimateRunOptions = {}): Promise<void> {
  const settle = (cancelled: boolean): void => {
    try {
      ctx.emit('animated', { animation: name, cancelled })
    } catch {
      // Emitting must never turn a finished animation into a rejection.
    }
  }
  const el = (ctx.el ?? null) as AnimatableElement | null
  if (!el || typeof el.animate !== 'function' || reducedMotion()) {
    return settleSkipped(settle)
  }
  // Clear the previous run this module started. A finished run with
  // `fill: forwards` (every exit preset) keeps applying its end state
  // underneath whatever starts next — without this, slide-out-then-slide-in
  // leaves the element stuck at the exit offset once the entrance finishes.
  // Only our own tracked run is touched; anything else on the element (a
  // running pulse, a spin loop) survives.
  try {
    const prev = running.get(el)
    if (prev) {
      try {
        prev.cancel?.()
      } catch {
        // One stale effect failing to clear must not stop the new run.
      }
      running.delete(el)
    }
  } catch {
    // A hostile element must not stop the new run.
  }
  const def = presetDefaults(name)
  const timing: Record<string, unknown> = {
    duration: typeof opts.duration === 'number' && opts.duration >= 0 ? opts.duration : def.duration,
    easing: typeof opts.easing === 'string' && opts.easing ? opts.easing : def.easing,
    delay: typeof opts.delay === 'number' && opts.delay > 0 ? opts.delay : 0,
    fill: opts.fill ?? def.fill,
    iterations: normalizeIterations(opts.loop),
    direction: opts.alternate === true ? 'alternate' : 'normal',
  }
  let anim: { finished?: Promise<void>; cancel?: () => void }
  try {
    anim = (el.animate as (...args: unknown[]) => { finished?: Promise<void>; cancel?: () => void })(keyframes, timing)
  } catch {
    return settleSkipped(settle)
  }
  running.set(el, anim)
  const done = (cancelled: boolean): void => {
    if (running.get(el) === anim) running.delete(el)
    settle(cancelled)
  }
  return Promise.resolve(anim?.finished).then(
    () => {
      done(false)
    },
    () => {
      // Cancelled (element removed mid-flight): still settle so `await`
      // never hangs, and still emit so `on: '<id>.animated'` chains proceed.
      done(true)
    },
  )
}

function runPreset(ctx: HandleCtx, preset: string, opts: AnimateRunOptions = {}): Promise<void> {
  const unit = typeof (ctx as { unit?: unknown }).unit === 'number' ? ((ctx as { unit?: number }).unit as number) : 4
  const measures = ((ctx as { measures?: unknown }).measures as Record<string, number> | undefined) ?? {}
  const px = resolveDistanceToPx(opts.distance, unit, measures)
  const keyframes = presetKeyframes(preset, px, opts)
  if (!keyframes) {
    return Promise.reject(
      new Error(
        `[Morgana] unknown animation "${preset}" — presets: fadeIn, fadeOut, slideUp, slideDown, slideLeft, slideRight, slideIn, slideOut, scaleIn, scaleOut, pulse, bounce, spin, smooth, bouncy (or the make() words: ${Object.keys(WORD_TO_PRESET).join(', ')})`,
      ),
    )
  }
  return run(ctx, preset, keyframes, opts)
}

/** Layer the `animate` namespace onto a handle. */
export function extendAnimate(ctx: HandleCtx): void {
  const animate = (name: string, opts: AnimateRunOptions = {}): Promise<void> => {
    const preset = WORD_TO_PRESET[String(name)] ?? String(name)
    return runPreset(ctx, preset, opts)
  }
  const api = animate as unknown as Record<string, unknown>
  api.to = (keyframes: KeyframeMap[], opts: AnimateRunOptions = {}): Promise<void> =>
    run(ctx, 'custom', Array.isArray(keyframes) ? keyframes : [], opts)
  for (const preset of [
    'fadeIn', 'fadeOut', 'slideUp', 'slideDown', 'slideLeft', 'slideRight',
    'slideIn', 'slideOut', 'scaleIn', 'scaleOut', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy',
    'sway',
  ]) {
    api[preset] = (opts: AnimateRunOptions = {}): Promise<void> => runPreset(ctx, preset, opts)
  }
  extend(ctx, { animate: api })
}
