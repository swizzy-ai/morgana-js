/**
 * Themes — named sets of design tokens, applied like any other make() word.
 *
 *   ctx.ui.themes.define('brand', { primary: '#4F46E5', primaryForeground: '#fff', dark: { background: '#0B0B12' } })
 *   page.make('theme:brand')        // or make('brand') once defined, or setProps({ theme: 'brand' })
 *   card.make('theme:dark')         // a dark island inside a light page
 *
 * A theme is CSS custom properties scoped to the element that carries it
 * (`data-theme`), so it applies to that object and everything inside it, and
 * nested themes compose. Every built-in component paints from these variables,
 * which is what makes one `make()` restyle a whole subtree.
 *
 * Mode: a page's `mode` (`light` | `dark` | `system`) picks each theme's light
 * or dark tokens; `system` follows the visitor's OS setting.
 */

export interface ThemeTokens {
  background?: string
  foreground?: string
  card?: string
  cardForeground?: string
  muted?: string
  mutedForeground?: string
  border?: string
  primary?: string
  primaryForeground?: string
  accent?: string
  accentForeground?: string
  danger?: string
  success?: string
  warning?: string
  shadow?: string
  fontFamily?: string
}

export interface ThemeSpec extends ThemeTokens {
  /** Overrides used in dark mode. Brand colours carry over unless overridden here. */
  dark?: ThemeTokens
}

const TOKEN_KEYS: Array<keyof ThemeTokens> = [
  'background', 'foreground', 'card', 'cardForeground', 'muted', 'mutedForeground', 'border',
  'primary', 'primaryForeground', 'accent', 'accentForeground', 'danger', 'success', 'warning',
  'shadow', 'fontFamily',
]
/** Kept from the light tokens in dark mode unless the theme's `dark` overrides them. */
const BRAND_KEYS = new Set<keyof ThemeTokens>([
  'primary', 'primaryForeground', 'accent', 'accentForeground', 'danger', 'success', 'warning', 'fontFamily',
])

export const LIGHT_TOKENS: Required<Omit<ThemeTokens, 'fontFamily'>> = {
  background: '#ffffff',
  foreground: '#18181B',
  card: '#ffffff',
  cardForeground: '#18181B',
  muted: '#F4F4F5',
  mutedForeground: '#71717A',
  border: '#E4E4E7',
  primary: '#18181B',
  primaryForeground: '#FAFAFA',
  accent: '#F4F4F5',
  accentForeground: '#18181B',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
  shadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
}

export const DARK_TOKENS: Required<Omit<ThemeTokens, 'fontFamily'>> = {
  background: '#09090B',
  foreground: '#FAFAFA',
  card: '#18181B',
  cardForeground: '#FAFAFA',
  muted: '#27272A',
  mutedForeground: '#A1A1AA',
  border: '#27272A',
  primary: '#FAFAFA',
  primaryForeground: '#18181B',
  accent: '#27272A',
  accentForeground: '#FAFAFA',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  shadow: '0 1px 3px 0 rgba(0, 0, 0, 0.6), 0 1px 2px -1px rgba(0, 0, 0, 0.6)',
}

const BUILTIN: Record<string, ThemeSpec> = {
  light: { ...LIGHT_TOKENS, dark: { ...DARK_TOKENS } },
  dark: { ...DARK_TOKENS, dark: { ...DARK_TOKENS } },
}

const registry = new Map<string, ThemeSpec>()

const NAME_RE = /^[a-z][a-z0-9-]{0,39}$/i
// A token value lands inside a CSS declaration: no braces, semicolons or
// comment markers that could close the rule and start another.
const VALUE_RE = /^[^{};<>]*$/

function cssVar(key: keyof ThemeTokens): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** Why a theme spec is unusable, or null. */
export function validateTheme(name: string, spec: unknown): string | null {
  if (!NAME_RE.test(name)) return `theme name "${name}" must start with a letter and use letters, digits and -`
  if (!spec || typeof spec !== 'object') return `theme "${name}" needs a token object`
  const check = (tokens: Record<string, unknown>, where: string): string | null => {
    for (const [k, v] of Object.entries(tokens)) {
      if (k === 'dark' && where === '') continue
      if (!(TOKEN_KEYS as string[]).includes(k)) {
        return `theme "${name}"${where} has unknown token "${k}" — known: ${TOKEN_KEYS.join(', ')}`
      }
      if (typeof v !== 'string' || !v.trim() || !VALUE_RE.test(v) || v.includes('/*')) {
        return `theme "${name}"${where} token "${k}" must be a CSS value string`
      }
    }
    return null
  }
  const top = check(spec as Record<string, unknown>, '')
  if (top) return top
  const dark = (spec as ThemeSpec).dark
  if (dark !== undefined) {
    if (!dark || typeof dark !== 'object') return `theme "${name}" dark must be a token object`
    return check(dark as Record<string, unknown>, ' (dark)')
  }
  return null
}

export function defineTheme(name: string, spec: ThemeSpec): void {
  const why = validateTheme(name, spec)
  if (why) throw new Error(why)
  if (BUILTIN[name.toLowerCase()]) throw new Error(`theme "${name}" is built in — pick another name`)
  registry.set(name.toLowerCase(), spec)
}

export function hasTheme(name: string): boolean {
  const n = name.toLowerCase()
  return Boolean(BUILTIN[n] || registry.has(n))
}

/** A theme the project defined (not a built-in). */
export function isDefinedTheme(name: string): boolean {
  return registry.has(name.toLowerCase())
}

export function getTheme(name: string): ThemeSpec | undefined {
  const n = name.toLowerCase()
  return BUILTIN[n] ?? registry.get(n)
}

export function clearThemes(): void {
  registry.clear()
}

/** The tokens a theme resolves to in each mode. */
export function themeTokens(spec: ThemeSpec): { light: ThemeTokens; dark: ThemeTokens } {
  const light: ThemeTokens = { ...LIGHT_TOKENS }
  for (const k of TOKEN_KEYS) if (spec[k] !== undefined) (light as Record<string, string>)[k] = spec[k]!
  const dark: ThemeTokens = { ...DARK_TOKENS }
  for (const k of TOKEN_KEYS) {
    if (BRAND_KEYS.has(k) && spec[k] !== undefined) (dark as Record<string, string>)[k] = spec[k]!
  }
  for (const k of TOKEN_KEYS) if (spec.dark?.[k] !== undefined) (dark as Record<string, string>)[k] = spec.dark[k]!
  return { light, dark }
}

function decls(tokens: ThemeTokens): string {
  const out: string[] = []
  for (const k of TOKEN_KEYS) {
    const v = tokens[k]
    if (v === undefined) continue
    if (k === 'fontFamily') continue
    out.push(`${cssVar(k)}:${v}`)
  }
  // The element itself takes the theme's text colour and font, so a themed
  // subtree reads correctly without each child restating it.
  out.push('color:var(--foreground)')
  if (tokens.fontFamily) out.push(`font-family:${tokens.fontFamily}`)
  return out.join(';')
}

/**
 * CSS for one theme name. `[data-theme]` scopes it; the page's `data-mode`
 * (on <body>) picks light or dark; `system` defers to the OS.
 */
export function themeCss(name: string, spec: ThemeSpec): string[] {
  const n = name.toLowerCase()
  const { light, dark } = themeTokens(spec)
  const sel = `[data-theme="${n}"]`
  return [
    `${sel}{${decls(light)}}`,
    `[data-mode="dark"] ${sel},[data-mode="dark"]${sel},${sel}[data-mode="dark"]{${decls(dark)}}`,
    `@media (prefers-color-scheme:dark){[data-mode="system"] ${sel},[data-mode="system"]${sel}{${decls(dark)}}}`,
    // An element's own mode beats its page's: a light island in a dark page.
    `${sel}[data-mode="light"],[data-mode="light"] ${sel}{${decls(light)}}`,
    `${sel}[data-mode="dark"]{${decls(dark)}}`,
  ]
}

/** Root tokens plus page-mode rules for pages that set no theme. */
export function rootThemeCss(): string[] {
  const { light, dark } = themeTokens(BUILTIN['light']!)
  const strip = (s: string) => s.replace(/;color:var\(--foreground\)$/, '')
  return [
    `:root{${strip(decls(light))}}`,
    `[data-mode="dark"]{${decls(dark)}}`,
    `@media (prefers-color-scheme:dark){[data-mode="system"]{${decls(dark)}}}`,
    `[data-mode="light"]{${decls(light)}}`,
    `[data-mode="dark"]{${decls(dark)}}`,
  ]
}

/** Every theme the sheet needs: built-ins plus whatever the project defined. */
export function allThemeCss(defined: Map<string, ThemeSpec>): string[] {
  const out: string[] = []
  for (const [n, spec] of Object.entries(BUILTIN)) out.push(...themeCss(n, spec))
  for (const [n, spec] of defined) out.push(...themeCss(n, spec))
  return out
}
