// A theme names your colours, fonts and appearances once.
//
//   theme('station')
//     .background({ light: '#f4efe6', dark: '#100f0d' })   // a role: switches with light/dark
//     .card({ light: '#fbf8f2', dark: '#0b0a08' })
//     .text({ light: '#1b1814', dark: '#f4ecdd' })
//     .primary('#fe9920')                                  // same in both modes
//     .color('adblue', '#4aa8ff')                          // a fixed named colour
//     .font('mono', 'JetBrains Mono')
//     .appearance('card', make => make.background('card').bordered().rounded())
//
// Roles compile to a Morgana theme (CSS variables), so the whole page —
// <body> included — follows light and dark. Named colours stay fixed.
import { points, type PointBasis, type Points } from '@studiomorgana/points'
import { STANDARD_POINTS } from './words'
import type { Make } from './make'

export type Appearance = (make: Make) => unknown
export type ModeValue = string | { light: string; dark: string }

/** The roles every Morgana component paints from, and their token names. */
const ROLES = {
  background: 'background',
  text: 'foreground',
  card: 'card',
  cardText: 'card-foreground',
  muted: 'muted',
  mutedText: 'muted-foreground',
  border: 'border',
  primary: 'primary',
  primaryText: 'primary-foreground',
  accent: 'accent',
  accentText: 'accent-foreground',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
} as const
export type Role = keyof typeof ROLES

/** Morgana's theme spec key for a role (camelCase of the token). */
const SPEC_KEY: Record<Role, string> = {
  background: 'background', text: 'foreground', card: 'card', cardText: 'cardForeground',
  muted: 'muted', mutedText: 'mutedForeground', border: 'border', primary: 'primary',
  primaryText: 'primaryForeground', accent: 'accent', accentText: 'accentForeground',
  danger: 'danger', success: 'success', warning: 'warning',
}

export class Theme {
  readonly colors: Record<string, string> = {}
  readonly fonts: Record<string, string> = {}
  readonly appearances: Record<string, Appearance> = {}
  private readonly roles: Partial<Record<Role, ModeValue>> = {}
  private bodyFont: string | undefined
  private readonly webFonts: string[] = []
  private bars: { width: number; thumb: string; hover: string } | undefined
  private readonly tokens: Record<string, ModeValue> = {}

  private pointReader: Points = STANDARD_POINTS
  /** SVG icons by name, registered for every page this theme paints. */
  readonly iconSet: Record<string, string> = {}

  constructor(readonly name: string) {}

  /**
   * What a point is for pages using this theme, and what the amount words
   * mean: `.points({ distance: '4px', words: { 'a little': 3 } })`. Unset
   * kinds keep the standard basis (1 point = 8px, 1 degree, 0.1 second).
   */
  points(settings: PointBasis & { words?: Record<string, number | string> }): this {
    const { words, ...basis } = settings
    const reader = points({ basis, words })
    for (const kind of Object.keys(basis)) reader.basis(kind as keyof PointBasis)   // a wrong unit says so here
    this.pointReader = reader
    return this
  }

  /** Icons the pages can use by name: `.icons({ arrow: '<svg…>' })`. Registered once per build. */
  icons(set: Record<string, string>): this {
    Object.assign(this.iconSet, set)
    return this
  }

  /** The point reader for this theme's amounts. */
  get pointsReader(): Points {
    return this.pointReader
  }

  private role(role: Role, value: ModeValue): this {
    this.roles[role] = value
    return this
  }

  // ---- roles: each follows light and dark ----

  /** The page itself. */
  background(value: ModeValue): this { return this.role('background', value) }
  /** Ordinary text. */
  text(value: ModeValue): this { return this.role('text', value) }
  /** Raised surfaces: cards, panels, the console screen. */
  card(value: ModeValue): this { return this.role('card', value) }
  cardText(value: ModeValue): this { return this.role('cardText', value) }
  /** Quiet surfaces: fields, wells, hover rows. */
  muted(value: ModeValue): this { return this.role('muted', value) }
  /** Quiet text: captions, labels, hints. */
  mutedText(value: ModeValue): this { return this.role('mutedText', value) }
  /** Lines and outlines. */
  border(value: ModeValue): this { return this.role('border', value) }
  /** The main action colour. */
  primary(value: ModeValue): this { return this.role('primary', value) }
  /** Text on the main action colour. */
  primaryText(value: ModeValue): this { return this.role('primaryText', value) }
  accent(value: ModeValue): this { return this.role('accent', value) }
  accentText(value: ModeValue): this { return this.role('accentText', value) }
  danger(value: ModeValue): this { return this.role('danger', value) }
  success(value: ModeValue): this { return this.role('success', value) }
  warning(value: ModeValue): this { return this.role('warning', value) }

  // ---- fixed names ----

  /**
   * A colour of your own that follows light and dark, beyond the standard roles:
   * `.token('glow', { light: 'rgba(0,0,0,.28)', dark: 'rgba(255,255,255,.38)' })`.
   * Use it by name anywhere a colour goes: `make(x).background('glow')`.
   */
  token(name: string, value: ModeValue): this {
    this.tokens[name] = value
    return this
  }

  /** A named colour that stays the same in light and dark: `.color('adblue', '#4aa8ff')`. */
  color(name: string, value: string): this {
    this.colors[name] = value
    return this
  }

  /** Name a font: `.font('mono', 'JetBrains Mono')`. Generic fallbacks are added. */
  font(name: string, family: string): this {
    this.fonts[name] = withFallback(name, family)
    return this
  }

  /**
   * A Google font, loaded on every page that uses this theme:
   * `.googleFont('sans', 'Geist', [400, 500, 600])`. Then `make(x).font('sans')`.
   */
  googleFont(name: string, family: string, weights: number[] = [400, 500, 600], opts: { italic?: boolean } = {}): this {
    const w = [...weights].sort((a, b) => a - b)
    // `{ italic: true }` loads only the italic cuts: `.googleFont('display', 'Libre Caslon Condensed', [600], { italic: true })`.
    const axes = opts.italic ? `ital,wght@${w.map((x) => `1,${x}`).join(';')}` : `wght@${w.join(';')}`
    this.webFonts.push(`family=${family.replace(/ /g, '+')}:${axes}`)
    return this.font(name, family)
  }

  /**
   * How scroll areas look on every page using this theme: a slim thumb on a
   * clear track. Colours are roles ('mutedText') or any CSS colour.
   *   .scrollbars({ width: 8, thumb: 'border', hover: 'mutedText' })
   */
  scrollbars(style: { width?: number; thumb?: string; hover?: string } = {}): this {
    this.bars = { width: style.width ?? 8, thumb: style.thumb ?? 'mutedText', hover: style.hover ?? style.thumb ?? 'text' }
    return this
  }

  /** A colour for page CSS: a role becomes its variable, anything else passes through. */
  private cssColor(value: string): string {
    return value in ROLES ? `var(--${ROLES[value as Role]})` : this.colorOf(value)
  }

  /** This theme's own tokens as page variables, light and dark, scoped like Morgana's themes. */
  private tokenCss(): string {
    const names = Object.keys(this.tokens)
    if (names.length === 0) return ''
    const pick = (mode: 'light' | 'dark') =>
      names.map((n) => {
        const v = this.tokens[n]
        return `--${n}:${typeof v === 'string' ? v : v[mode]}`
      }).join(';')
    const t = `[data-theme="${this.name}"]`
    const dark = pick('dark')
    return `${t}{${pick('light')}}` +
      `${t}[data-mode="dark"],[data-mode="dark"] ${t}{${dark}}` +
      `@media (prefers-color-scheme:dark){${t}[data-mode="system"],[data-mode="system"] ${t}{${dark}}}`
  }

  /** Everything this theme adds to a page's inline head CSS: tokens, then scrollbars. */
  pageCss(): string {
    let css = this.tokenCss()
    if (this.bars) {
      const { width, thumb, hover } = this.bars
      const t = this.cssColor(thumb)
      const h = this.cssColor(hover)
      css +=
        `*{scrollbar-width:thin;scrollbar-color:${t} transparent}` +
        `*::-webkit-scrollbar{width:${width}px;height:${width}px}` +
        `*::-webkit-scrollbar-track{background:transparent}` +
        `*::-webkit-scrollbar-thumb{background:${t};border-radius:999px;border:2px solid transparent;background-clip:content-box}` +
        `*::-webkit-scrollbar-thumb:hover{background:${h};background-clip:content-box}` +
        `*:hover{scrollbar-color:${h} transparent}`
    }
    return css
  }

  /**
   * The `<link>` tags a page needs for this theme's Google fonts ('' when there
   * are none). Preconnect opens the connection early; the stylesheet loads
   * non-blocking (`media=print` flips to `all` on load) with a `<noscript>`
   * fallback — a render-blocking `@import` costs first paint a full round trip.
   */
  headLinks(): string {
    if (this.webFonts.length === 0) return ''
    const href = `https://fonts.googleapis.com/css2?${this.webFonts.join('&')}&display=swap`
    return (
      '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
      `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'" />` +
      `<noscript><link rel="stylesheet" href="${href}" /></noscript>`
    )
  }

  /** The font for the whole page: `.pageFont('read')` (a named font) or a family. */
  pageFont(nameOrFamily: string): this {
    this.bodyFont = this.fonts[nameOrFamily] ?? withFallback(nameOrFamily, nameOrFamily)
    return this
  }

  /** Name an appearance: `.appearance('card', make => make.bordered().rounded())`. */
  appearance(name: string, describe: Appearance): this {
    this.appearances[name] = describe
    return this
  }

  // ---- used by helpers ----

  /** A colour word → what Morgana takes: a role token, a named colour, or the raw value. */
  colorOf(value: string): string {
    if (value in ROLES) return ROLES[value as Role]
    if (value in this.tokens) return `var(--${value})`
    return this.colors[value] ?? value
  }

  fontOf(value: string): string {
    return this.fonts[value] ?? value
  }

  /** Whether this theme declares roles (and so compiles to a Morgana theme). */
  get hasRoles(): boolean {
    return Object.keys(this.roles).length > 0 || this.bodyFont !== undefined || Object.keys(this.tokens).length > 0
  }

  /** The Morgana theme spec: light tokens, plus `dark` overrides. */
  spec(): Record<string, unknown> {
    const light: Record<string, string> = {}
    const dark: Record<string, string> = {}
    for (const [role, value] of Object.entries(this.roles) as [Role, ModeValue][]) {
      const key = SPEC_KEY[role]
      if (typeof value === 'string') {
        light[key] = value
        dark[key] = value
      } else {
        light[key] = value.light
        dark[key] = value.dark
      }
    }
    if (this.bodyFont) light.fontFamily = this.bodyFont
    return { ...light, dark }
  }
}

function withFallback(name: string, family: string): string {
  if (family.includes(',')) return family
  const quoted = /\s/.test(family) ? `'${family}'` : family
  const fallback = /mono|code/i.test(name + family)
    ? 'ui-monospace, Menlo, Consolas, monospace'
    : /serif|display|caslon|garamond|baskerville|bodoni|didot|georgia|times|playfair|fraunces|newsreader/i.test(name + family) && !/sans/i.test(family)
      ? 'Georgia, serif'
      : 'system-ui, -apple-system, sans-serif'
  return `${quoted}, ${fallback}`
}

/** Start a theme: `theme('station').background({ light, dark }).font(...).appearance(...)`. */
export function theme(name: string): Theme {
  return new Theme(name)
}
