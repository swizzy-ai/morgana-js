// make(x) — how a thing looks. Every word is one visual property, so typing
// `make(x).` lists everything you can change. Each word returns the same
// sentence, so they chain: make(card).appearance('card').padding('large').
import type { ObjectHandle } from '@studiomorgana/sdk'
import { Theme } from './theme'
import { length, radius, space, textSize, WEIGHT, type Size, type TextSize, type Weight } from './words'

type Handle = ObjectHandle<any>
type Length = Exclude<Size, 'none'> | 'full' | 'fit' | number | (string & {})

/**
 * Where words land: the normal look, a state (hover…), a screen size, or a
 * condition (`view=work`, `#composer:dragover`, `:last`, joined with `&`).
 */
type Scope = { state?: 'hover' | 'focus' | 'active' | 'disabled'; screen?: string; cond?: string }

/** Where an object comes from as it appears. */
const APPEARS = {
  fade: { opacity: 0 },
  rise: { opacity: 0, transform: 'translateY(8px)' },
  riseFar: { opacity: 0, transform: 'translateY(16px)' },
  fromRight: { transform: 'translateX(104%)' },
  fromBelow: { transform: 'translateY(104%)' },
  grow: { opacity: 0, transform: 'scale(.97)' },
} as const
/** Where an object goes as it leaves. */
const LEAVES = {
  fade: { opacity: 0 },
  sink: { opacity: 0, transform: 'translateY(8px)' },
  toRight: { transform: 'translateX(104%)' },
  toBottom: { transform: 'translateY(104%)' },
} as const
export type Appearance = keyof typeof APPEARS
export type Leaving = keyof typeof LEAVES
const EASE = 'cubic-bezier(.2,.8,.2,1)'

export class Make {
  constructor(
    private readonly h: Handle,
    private readonly t: Theme,
    private readonly scope: Scope = {},
  ) {}

  private put(props: Record<string, unknown>): this {
    const { state, screen, cond } = this.scope
    if (cond) {
      const key = screen ? `${cond} & @${screen}` : cond
      const prev = (this.h.get('conditions') ?? {}) as Record<string, Record<string, unknown>>
      this.h.setProps({ conditions: { ...prev, [key]: { ...(prev[key] ?? {}), ...props } } } as never)
    } else if (screen) {
      this.h.setWithBreakpoint(screen, props as never)
    } else if (state) {
      const prev = this.h.get(state)
      const base = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {}
      this.h.setProps({ [state]: { ...base, ...props } } as never)
    } else {
      this.h.setProps(props as never)
    }
    return this
  }

  private color(v: string) {
    return this.t.colorOf(v)
  }

  // ---- appearance ----

  /** Apply named appearances from the theme, in order: `.appearance('card')`, `.appearance('btn', 'btnPrimary')`. */
  appearance(...names: string[]): this {
    for (const name of names) {
      const describe = this.t.appearances[name]
      if (!describe) throw new Error(`[helpers] No appearance "${name}" in theme "${this.t.name}". Add it with theme(...).appearance('${name}', make => …).`)
      describe(this)
    }
    return this
  }

  // ---- layout ----

  /** Children side by side. */
  row(): this { return this.put({ layout: 'row' }) }
  /** Children stacked top to bottom. */
  column(): this { return this.put({ layout: 'column' }) }
  /** Children in a grid of `columns`. */
  grid(columns: number): this { return this.put({ layout: 'grid', grid: { cols: columns } }) }
  /** Children may flow onto a new line. */
  wrap(): this { return this.put({ wrap: true }) }
  /** Children centred both ways. */
  centered(): this { return this.put({ align: 'center', justify: 'center' }) }
  /** Children lined up at the start. */
  alignedStart(): this { return this.put({ align: 'start' }) }
  /** Children lined up down the middle (cross-axis only). */
  alignedCenter(): this { return this.put({ align: 'center' }) }
  /** Children lined up at the end. */
  alignedEnd(): this { return this.put({ align: 'end' }) }
  /** Children pushed apart, first to one edge, last to the other. */
  spread(): this { return this.put({ justify: 'between' }) }
  /** Children pinned with `place(x).at(…)` are positioned against this object. */
  anchors(): this { return this.put({ layer: 0 }) }
  /** Stacks above its siblings (higher number, nearer the front). */
  layer(n: number): this { return this.put({ layer: n }) }
  /** A fixed shape, width to height: `.ratio(1)`, `.ratio('16/10')`. */
  ratio(r: number | string): this { return this.put({ aspectRatio: r }) }
  /** Takes the spare room in its row or column. */
  grow(): this { return this.put({ grow: 1 }) }
  /** Space between children. */
  spaced(size: Size | number | (string & {})): this { return this.put({ gap: space(size, this.t.pointsReader) }) }

  // ---- size ----

  width(size: Length): this { return this.put({ width: length(size, this.t.pointsReader) }) }
  height(size: Length): this { return this.put({ height: length(size, this.t.pointsReader) }) }
  minWidth(size: Length): this { return this.put({ minW: length(size, this.t.pointsReader) }) }
  maxWidth(size: Length): this { return this.put({ maxW: length(size, this.t.pointsReader) }) }
  minHeight(size: Length): this { return this.put({ minH: length(size, this.t.pointsReader) }) }
  maxHeight(size: Length): this { return this.put({ maxH: length(size, this.t.pointsReader) }) }
  /** As wide as its parent. */
  full(): this { return this.put({ width: 'stretch' }) }
  /** As wide as its content. */
  fit(): this { return this.put({ width: 'hug' }) }

  // ---- spacing ----

  /** Space inside, on every side. */
  padding(size: Size | number | (string & {})): this { return this.put({ pad: space(size, this.t.pointsReader) }) }

  // ---- colour ----

  background(color: string): this { return this.put({ bg: this.color(color) }) }
  textColor(color: string): this { return this.put({ color: this.color(color) }) }
  gradient(name: string): this { return this.put({ bg: `gradient:${name}` }) }

  // ---- edges ----

  bordered(): this { return this.put({ border: true }) }
  borderless(): this { return this.put({ border: 'none' }) }
  /** A border in a named colour. */
  border(color: string): this { return this.put({ border: true, borderColor: this.color(color) }) }
  borderTop(color?: string): this { return this.put(color ? { borderTop: true, borderColor: this.color(color) } : { borderTop: true }) }
  borderBottom(color?: string): this { return this.put(color ? { borderBottom: true, borderColor: this.color(color) } : { borderBottom: true }) }
  borderLeft(color?: string): this { return this.put(color ? { borderLeft: true, borderColor: this.color(color) } : { borderLeft: true }) }
  borderRight(color?: string): this { return this.put(color ? { borderRight: true, borderColor: this.color(color) } : { borderRight: true }) }
  borderWidth(size: Size | number | (string & {})): this { return this.put({ borderWidth: typeof size === 'number' ? size : space(size, this.t.pointsReader) }) }

  // ---- shape ----

  rounded(size: Size | number | (string & {}) = 'medium'): this { return this.put({ radius: radius(size, this.t.pointsReader) }) }
  square(): this { return this.put({ radius: 'none' }) }
  pill(): this { return this.put({ radius: 'full' }) }
  circle(): this { return this.put({ radius: 'full' }) }

  // ---- text ----

  /** A step of the type scale: heading, title, body, small, caption… */
  size(size: TextSize | number | (string & {})): this {
    // A number is an exact size in pixels: `.size(44)`.
    if (typeof size === 'number') return this.put({ fontSize: `${size}px` })
    // Points are text points: `.size('3 points')` with the theme's basis.
    if (this.t.pointsReader.isPoints(size)) return this.put({ fontSize: this.t.pointsReader.css(size, 'text') })
    return this.put({ font: textSize(size) })
  }
  bold(): this { return this.put({ fontWeight: WEIGHT.bold }) }
  semibold(): this { return this.put({ fontWeight: WEIGHT.semibold }) }
  light(): this { return this.put({ fontWeight: WEIGHT.light }) }
  fontWeight(weight: Weight | number): this { return this.put({ fontWeight: typeof weight === 'number' ? weight : WEIGHT[weight] }) }
  italic(): this { return this.put({ fontStyle: 'italic' }) }
  underline(): this { return this.put({ textDecoration: 'underline' }) }
  plain(): this { return this.put({ textDecoration: 'none' }) }
  uppercase(): this { return this.put({ textTransform: 'uppercase' }) }
  lowercase(): this { return this.put({ textTransform: 'lowercase' }) }
  capitalize(): this { return this.put({ textTransform: 'capitalize' }) }
  /** A font named in the theme ('mono'), or a family. */
  font(name: string): this { return this.put({ fontFamily: this.t.fontOf(name) }) }
  letterSpacing(spacing: 'tight' | 'normal' | 'wide' | number): this { return this.put({ tracking: spacing }) }
  lineHeight(height: 'tight' | 'normal' | 'relaxed' | number): this {
    const v = typeof height === 'number' ? height : { tight: 1.2, normal: 1.5, relaxed: 1.75 }[height]
    return this.put({ lineHeight: v })
  }
  textAlign(side: 'start' | 'center' | 'end'): this { return this.put({ align: side }) }

  // ---- effects ----

  shadow(kind: 'raised' | 'floating' | (string & {}) = 'raised'): this { return this.put({ effect: kind }) }
  /**
   * A soft halo that also lifts the object off the page — a colour from the
   * theme or any colour: `.glow('primary')`, `.glow('#F26B2A')`.
   */
  glow(color?: string, size: 'small' | 'medium' | 'large' = 'large'): this {
    if (!color) return this.put({ effect: 'glow' })
    const c = this.t.colorOf(color)
    const halo = /^#[0-9a-f]{6}$/i.test(c) ? `${c}40` : /^[a-z-]+$/.test(c) ? `var(--${c})` : c
    const spread = { small: '0 0 24px 0', medium: '0 0 48px 2px', large: '0 0 90px 6px' }[size]
    const lift = { small: '0 8px 20px -10px', medium: '0 16px 40px -14px', large: '0 28px 70px -20px' }[size]
    return this.put({ boxShadow: `${lift} rgba(0, 0, 0, 0.45), ${spread} ${halo}` })
  }
  faded(amount = 0.6): this { return this.put({ opacity: amount }) }
  /** A shadow written out in full, for layered halos: `.castShadow('0 0 44px -6px var(--halo)')`. */
  castShadow(shadow: string): this { return this.put({ boxShadow: shadow }) }
  /** A motion word: pulse, bounce, fade-in… */
  animated(motion: string): this { this.h.make(motion); return this }
  /** Changes ease in instead of jumping. */
  smooth(speed: 'fast' | 'normal' | 'slow' = 'normal'): this { return this.put({ transition: speed }) }

  // ---- behaviour ----

  pointer(): this { return this.put({ cursor: 'pointer' }) }
  scrolls(): this { return this.put({ overflow: 'scroll' }) }
  /** Scrolls left and right only — a carousel. */
  scrollsSideways(): this { return this.put({ overflow: 'auto hidden' }) }
  /** Scrolls up and down only — content taller than its box stays inside it. */
  scrollsDown(): this { return this.put({ overflow: 'hidden auto' }) }
  clipped(): this { return this.put({ overflow: 'hidden' }) }

  // ---- showing, motion ----

  /** Shown (in a condition: shown while it holds). */
  shown(): this { return this.put({ hidden: false }) }
  /** Hidden (in a condition: hidden while it holds). */
  hidden(): this { return this.put({ hidden: true }) }
  /** Each time it appears (shown, or stamped into a list) it comes in like this. */
  appears(how: Appearance = 'rise', ms = 450): this {
    this.h.setProps({ appear: { ...APPEARS[how], ms, easing: EASE } } as never)
    return this
  }
  /** As it hides it goes out like this, staying on screen until it has. */
  leaves(how: Leaving = 'fade', ms = 450): this {
    this.h.setProps({ leave: { ...LEAVES[how], ms, easing: EASE } } as never)
    return this
  }
  /** Its height eases when what is inside it changes screen. */
  easesHeight(): this { this.h.setProps({ easesHeight: true } as never); return this }
  /** Follows a hand drag sideways (see `dragsAside`). */
  followsDrag(): this { return this.put({ transform: 'translateX(var(--drag-x, 0px))' }) }
  /** No focus ring. */
  noOutline(): this { return this.put({ outline: 'none' }) }
  /** A text area that cannot be resized by hand. */
  fixedSize(): this { return this.put({ resize: 'none' }) }
  /** Clicks pass through it. */
  clickThrough(): this { return this.put({ pointerEvents: 'none' }) }

  // ---- behaviour that arrives as events ----

  /** Files dragged onto it light it up (`whileFilesOver`) and arrive as `filesAdded`. */
  acceptsFiles(): this { this.h.setProps({ acceptsFiles: true } as never); return this }
  /** Clicking it opens the file picker; the files arrive as `filesAdded` on `target`. */
  opensFilePickerFor(target: string): this { this.h.setProps({ browsesFilesFor: target } as never); return this }
  /** Dragging it by hand moves `target` sideways; `released` fires with `{ dx, width }`. */
  dragsAside(target: string): this { this.h.setProps({ drags: target } as never); return this }

  // ---- looks that follow state ----

  /** Its background follows a state path. */
  backgroundFrom(path: string): this { this.h.bind(path, { prop: 'bg' } as never); return this }
  /** Its text colour follows a state path. */
  textColorFrom(path: string): this { this.h.bind(path, { prop: 'color' } as never); return this }
  /** Its width follows a state path (`'42%'`). */
  widthFrom(path: string): this { this.h.bind(path, { prop: 'width' } as never); return this }

  // ---- mode ----

  darkMode(): this { return this.put({ mode: 'dark' }) }
  lightMode(): this { return this.put({ mode: 'light' }) }

  // ---- states and screen sizes: everything after them in the sentence applies there ----

  onHover(): Make { return new Make(this.h, this.t, { ...this.scope, state: 'hover' }) }
  onFocus(): Make { return new Make(this.h, this.t, { ...this.scope, state: 'focus' }) }
  onPress(): Make { return new Make(this.h, this.t, { ...this.scope, state: 'active' }) }
  whenDisabled(): Make { return new Make(this.h, this.t, { ...this.scope, state: 'disabled' }) }
  onPhone(): Make { return new Make(this.h, this.t, { screen: 'phone' }) }
  onTablet(): Make { return new Make(this.h, this.t, { screen: 'tablet' }) }
  onDesktop(): Make { return new Make(this.h, this.t, { screen: 'desktop' }) }
  /** Any breakpoint you declared: `.onScreen('split')`. */
  onScreen(name: string): Make { return new Make(this.h, this.t, { ...(this.scope.cond ? { cond: this.scope.cond } : {}), screen: name }) }

  // ---- conditions: everything after them applies while they hold ----

  private and(part: string): Make {
    const cond = this.scope.cond ? `${this.scope.cond} & ${part}` : part
    return new Make(this.h, this.t, { ...(this.scope.screen ? { screen: this.scope.screen } : {}), cond })
  }
  /** While a state value is one of these: `.while('view', 'work')`, `.while('view', ['brief', 'work'])`. */
  while(key: string, value: string | number | boolean | Array<string | number | boolean>): Make {
    return this.and(`${key}=${(Array.isArray(value) ? value : [value]).map(String).join('|')}`)
  }
  /** While files are dragged over another object (which `acceptsFiles`). */
  whileFilesOver(id: string): Make { return this.and(`#${id}:dragover`) }
  /** While another object is hovered. */
  whileHovering(id: string): Make { return this.and(`#${id}:hover`) }
  /** In a list: when its row is the first. */
  ifFirst(): Make { return this.and(':first') }
  /** In a list: when its row is the last. */
  ifLast(): Make { return this.and(':last') }
  /** In a list: when its row is `n` from the end (1 is the last). */
  ifFromEnd(n: number): Make { return this.and(`:fromEnd(${n})`) }
}
