import { afterEach, describe, expect, it } from 'vitest'
import { allThemeCss, clearThemes, defineTheme, hasTheme, themeTokens, validateTheme } from '../style/themes'
import { stateRules } from '../style/states'
import { resolvePropsToCss } from '../style/props'
import { resolveMakeToken } from '../compile-ctx/tokens'

const ctx = {
  measures: new Map(),
  surfaceOverrides: new Map(),
  effectOverrides: new Map(),
  radiusOverrides: new Map(),
  fontOverrides: new Map(),
  gradientOverrides: new Map(),
  themes: new Map(),
}

afterEach(() => clearThemes())

describe('themes', () => {
  it('validates names and token values at define time', () => {
    expect(validateTheme('brand', { primary: '#4F46E5' })).toBeNull()
    expect(validateTheme('1bad', {})).toMatch(/must start with a letter/)
    expect(validateTheme('brand', { primry: '#000' })).toMatch(/unknown token "primry"/)
    // A value must not be able to close the rule and start another.
    expect(validateTheme('brand', { primary: 'red;} body{display:none' })).toMatch(/CSS value/)
    expect(() => defineTheme('dark', {})).toThrow(/built in/)
  })

  it('brand colours carry into dark mode unless overridden', () => {
    const { light, dark } = themeTokens({ primary: '#4F46E5', background: '#FFFBEB', dark: { background: '#0B0B12' } })
    expect(light.primary).toBe('#4F46E5')
    expect(dark.primary).toBe('#4F46E5')
    expect(light.background).toBe('#FFFBEB')
    expect(dark.background).toBe('#0B0B12')
  })

  it('emits a scope per theme, with dark and system variants', () => {
    defineTheme('brand', { primary: '#4F46E5' })
    const css = allThemeCss(new Map([['brand', { primary: '#4F46E5' }]])).join('\n')
    expect(css).toContain('[data-theme="brand"]{')
    expect(css).toMatch(/\[data-mode="dark"\] \[data-theme="brand"\]/)
    expect(css).toMatch(/@media \(prefers-color-scheme:dark\)\{\[data-mode="system"\] \[data-theme="brand"\]/)
  })

  it('make() applies themes and modes like any other word', () => {
    defineTheme('brand', { primary: '#4F46E5' })
    expect(resolveMakeToken('box', 'theme:brand')).toEqual({ theme: 'brand' })
    expect(resolveMakeToken('box', 'brand')).toEqual({ theme: 'brand' })
    expect(resolveMakeToken('box', 'theme:nope')).toEqual({})
    expect(resolveMakeToken('box', 'dark-mode')).toEqual({ mode: 'dark' })
    expect(hasTheme('BRAND')).toBe(true)
  })
})

describe('style props', () => {
  it('theme colour names resolve to variables', () => {
    const css = resolvePropsToCss({ bg: 'primary', color: 'mutedForeground', border: true, borderColor: 'accent' }, 'box', ctx)
    expect(css['background']).toBe('var(--primary)')
    expect(css['color']).toBe('var(--muted-foreground)')
    expect(css['border']).toBe('1px solid var(--accent)')
  })

  it('transition speed words', () => {
    expect(resolvePropsToCss({ transition: 'fast' }, 'box', ctx)['transition']).toMatch(/120ms/)
    expect(resolvePropsToCss({ transition: 'none' }, 'box', ctx)['transition']).toBe('none')
  })
})

describe('state styles', () => {
  it('compile to !important rules on the object, without the kind defaults', () => {
    const rules = stateRules('[data-entity="b"]', 'button', { hover: { bg: '#111' }, focus: { boxShadow: '0 0 0 2px red' } }, ctx)
    expect(rules[0]).toBe('[data-entity="b"]:hover{background:#111 !important}')
    expect(rules[1]).toContain('[data-entity="b"]:focus-visible,[data-entity="b"]:focus-within{')
  })

  it('disabled: true is the component flag, not a state style', () => {
    expect(stateRules('[data-entity="b"]', 'button', { disabled: true }, ctx)).toEqual([])
    expect(stateRules('[data-entity="b"]', 'button', { disabled: { opacity: 0.5 } }, ctx)[0]).toContain(':disabled')
  })
})
