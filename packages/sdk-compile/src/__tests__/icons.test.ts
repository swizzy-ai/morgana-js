/**
 * Icons — registry recording, resolution to HTML, and head emission.
 */
import { describe, expect, it } from 'vitest'
import { buildBrowserCompileCtx, createCompileState } from '../compile-ctx'
import { createEmptyIR } from '../ir'
import { renderPageHtml } from '../render/page'
import { resolveIconToHtml } from '../render/icons'

function makeState() {
  return createCompileState({}, 'test')
}

describe('ctx.ui.icons registry', () => {
  it('defines, reads, lists and removes icons', () => {
    const state = makeState()
    const ctx = buildBrowserCompileCtx(state) as Record<string, unknown>
    const icons = ctx['ui'] as Record<string, unknown> as Record<string, Record<string, (...a: never[]) => unknown>>
    const api = icons['icons'] as {
      define(n: string, d: unknown): void
      shape(n: string, d: unknown): void
      get(n: string): unknown
      has(n: string): boolean
      entries(): [string, unknown][]
      remove(n: string): void
    }
    expect(api.has('cart')).toBe(false)
    api.define('cart', { kind: 'glyph', glyph: '🛒' })
    expect(api.has('cart')).toBe(true)
    expect(api.get('cart')).toEqual({ kind: 'glyph', glyph: '🛒' })
    api.shape('cart', { kind: 'svg', svg: '<svg/>' })
    expect(api.get('cart')).toEqual({ kind: 'svg', svg: '<svg/>' })
    expect(api.entries()).toEqual([['cart', { kind: 'svg', svg: '<svg/>' }]])
    api.remove('cart')
    expect(api.has('cart')).toBe(false)
  })

  it('rejects definitions without a kind', () => {
    const state = makeState()
    const ctx = buildBrowserCompileCtx(state) as Record<string, unknown>
    const ui = ctx['ui'] as Record<string, { define(n: string, d: unknown): void }>
    expect(() => ui['icons']!.define('x', {} as never)).toThrow(/def\.kind/)
  })

  it('declares libraries with cdnUrl + globalVar', () => {
    const state = makeState()
    const ctx = buildBrowserCompileCtx(state) as Record<string, unknown>
    const libs = ctx['libraries'] as {
      define(n: string, r: unknown): unknown
      get(n: string): unknown
      has(n: string): boolean
    }
    expect(libs.has('lucide')).toBe(false)
    libs.define('lucide', { cdnUrl: 'https://unpkg.com/lucide@latest', globalVar: 'lucide' })
    expect(state.ir.libraries.get('lucide')).toEqual({
      name: 'lucide',
      cdnUrl: 'https://unpkg.com/lucide@latest',
      globalVar: 'lucide',
      version: undefined,
    })
    expect(() => libs.define('bad', { cdnUrl: 'x' } as never)).toThrow(/cdnUrl and globalVar/)
  })
})

describe('resolveIconToHtml', () => {
  it('renders every kind and falls back to raw glyphs', () => {
    const ir = createEmptyIR()
    ir.icons.set('g', { kind: 'glyph', glyph: '★' })
    ir.icons.set('s', { kind: 'svg', svg: '<svg><path/></svg>' })
    ir.icons.set('a', { kind: 'asset', asset: 'logo.png' })
    ir.icons.set('u', { kind: 'url', url: 'https://x/y.png' })
    ir.icons.set('f', { kind: 'file', path: '/files/i.png' })
    ir.icons.set('l', { kind: 'library', library: 'lucide', name: 'shopping-cart' })

    expect(resolveIconToHtml('g', ir)).toContain('>★</span>')
    expect(resolveIconToHtml('s', ir)).toContain('<svg><path/></svg>')
    expect(resolveIconToHtml('a', ir)).toContain('src="/assets/logo.png"')
    expect(resolveIconToHtml('u', ir)).toContain('src="https://x/y.png"')
    expect(resolveIconToHtml('f', ir)).toContain('src="/files/i.png"')
    expect(resolveIconToHtml('l', ir)).toContain('data-lucide="shopping-cart"')
    expect(resolveIconToHtml('nope', ir)).toContain('>nope</span>')
    for (const key of ['g', 's', 'a', 'u', 'f', 'l']) {
      expect(resolveIconToHtml(key, ir)).toContain('data-part="icon"')
    }
  })
})

describe('page head emission', () => {
  function pageWithButton(iconProps: Record<string, unknown>) {
    const ir = createEmptyIR()
    ir.objects.set('cta', {
      id: 'cta',
      kind: 'button',
      props: { id: 'cta', label: 'Buy', ...iconProps },
      children: [],
      parentId: null,
      contentTemplateId: null,
      bindings: [],
      breakpointProps: {},
      tracked: [],
      inlineWhens: [],
    })
    ir.pages.set('home', { name: 'home', address: '/', rootIds: ['cta'], app: null })
    return ir
  }

  it('renders icon slots left/right on buttons', () => {
    const ir = pageWithButton({ icon: 'cart', iconPosition: 'right' })
    ir.icons.set('cart', { kind: 'glyph', glyph: '🛒' })
    const html = renderPageHtml(ir, 'home')
    expect(html).toContain('Buy<span data-part="icon"')
    expect(html).not.toContain('data-prop-icon')

    const left = renderPageHtml(pageWithButton({ icon: 'cart' }), 'home')
    expect(left.indexOf('data-part="icon"')).toBeLessThan(left.indexOf('Buy'))
  })

  it('emits library scripts deferred, plus createIcons init, omitted when unused', () => {
    const ir = pageWithButton({})
    ir.libraries.set('lucide', { name: 'lucide', cdnUrl: 'https://unpkg.com/lucide@latest', globalVar: 'lucide' })
    const html = renderPageHtml(ir, 'home')
    // `defer` keeps a third-party icon CDN off the critical path: a blocking
    // script in <head> holds up first paint for the whole download. Measured
    // at ~1.2s → ~0.25s FCP on the demo's bench page.
    expect(html).toContain(
      '<script defer src="https://unpkg.com/lucide@latest" data-morgana-lib="lucide" data-morgana-global="lucide"></script>',
    )
    // The init waits for DOMContentLoaded, which defer still precedes.
    expect(html).toContain("document.addEventListener('DOMContentLoaded'")
    expect(html).toContain('createIcons')

    const bare = renderPageHtml(pageWithButton({}), 'home')
    expect(bare).not.toContain('data-morgana-lib')
    expect(bare).not.toContain('createIcons')
  })
})
