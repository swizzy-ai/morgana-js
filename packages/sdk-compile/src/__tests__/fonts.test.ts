/**
 * Project fonts: config.fonts → @font-face + variables, Google fonts
 * self-hosted through a cache, and the props that use them.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FONT_TOKENS, FONT_WEIGHTS, TRACKING } from '@studiomorgana/sdk'

import { googleCssUrl, resolveFonts } from '../style/fonts'
import { familyCss, fontWeightCss } from '../style/props'
import { FONT_WEIGHTS as COMPILER_WEIGHTS, TEXT_SCALE, TRACKING as COMPILER_TRACKING } from '../style/tokens'

let dir = ''
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))
const project = () => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-fonts-')))

const GOOGLE_CSS = `/* latin */
@font-face { font-family: 'Inter'; font-weight: 400; src: url(https://fonts.gstatic.com/s/inter/a.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'Inter'; font-weight: 700; src: url(https://fonts.gstatic.com/s/inter/b.woff2) format('woff2'); }`

function fakeFetch() {
  const calls: string[] = []
  const fn = async (url: string) => {
    calls.push(url)
    return {
      ok: true,
      status: 200,
      text: async () => GOOGLE_CSS,
      arrayBuffer: async () => new TextEncoder().encode(`font:${url}`).buffer as ArrayBuffer,
    }
  }
  return { fn, calls }
}

describe('the type scale', () => {
  it('is the same list in the SDK types and the compiler', () => {
    expect([...FONT_TOKENS].sort()).toEqual(Object.keys(TEXT_SCALE).sort())
    // The compiler keeps its own copies (the page runtime cannot import the SDK).
    expect(COMPILER_WEIGHTS).toEqual(FONT_WEIGHTS)
    expect(COMPILER_TRACKING).toEqual(TRACKING)
  })

  it('has h1 through h6, and headings follow config.text.headings', () => {
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(TEXT_SCALE[h]!['font-family']).toBe('var(--font-headings, inherit)')
    }
    expect(TEXT_SCALE['body']!['font-family']).toBeUndefined()
  })
})

describe('resolveFonts', () => {
  it('turns a CSS stack into a variable, and text roles into references', async () => {
    project()
    const r = await resolveFonts({ dir, config: { fonts: { serif: 'Georgia, serif' }, text: { body: 'serif', mono: 'Menlo, monospace' } }, warnings: [] })
    expect(r.css).toContain('--font-serif:Georgia, serif')
    expect(r.css).toContain('--font-body:var(--font-serif)')
    expect(r.css).toContain('--font-mono:Menlo, monospace')
    expect(r.files).toEqual([])
  })

  it('writes @font-face for files in assets/, with relative urls', async () => {
    project()
    fs.mkdirSync(path.join(dir, 'assets', 'fonts'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'assets', 'fonts', 'Clash.woff2'), 'x')
    const warnings: string[] = []
    const r = await resolveFonts({ dir, config: { fonts: { display: { file: 'fonts/Clash.woff2', weight: '600 700' }, gone: { file: 'fonts/nope.ttf' } } }, warnings })
    expect(r.css).toContain('font-family:"display";src:url(fonts/Clash.woff2) format("woff2");font-weight:600 700')
    expect(r.css).toContain('--font-display:"display", system-ui, sans-serif')
    expect(warnings).toEqual(['font "gone": assets/fonts/nope.ttf not found'])
  })

  it('downloads a Google font once, serves it locally, and builds offline from the cache', async () => {
    project()
    const config = { fonts: { brand: { google: 'Inter', weights: [700, 400] } } }
    const first = fakeFetch()
    const r = await resolveFonts({ dir, config, warnings: [], fetch: first.fn as never })

    expect(first.calls[0]).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap')
    expect(r.css).not.toContain('gstatic.com')
    expect(r.css).toMatch(/url\(_fonts\/[0-9a-f]{16}\.woff2\)/)
    expect(r.css).toContain('--font-brand:"Inter", system-ui, sans-serif')
    expect(r.files).toHaveLength(2)
    for (const f of r.files) expect(fs.existsSync(f.file)).toBe(true)

    const offline = async () => {
      throw new Error('network is off')
    }
    const again = await resolveFonts({ dir, config, warnings: [], fetch: offline as never })
    expect(again.css).toBe(r.css)
  })

  it('warns and keeps the fallback when a Google font cannot be fetched', async () => {
    project()
    const warnings: string[] = []
    const fail = async () => ({ ok: false, status: 400, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) })
    const r = await resolveFonts({ dir, config: { fonts: { brand: { google: 'Not A Font' } } }, warnings, fetch: fail as never })
    expect(warnings[0]).toMatch(/font "brand" not loaded, its fallback will show: Google Fonts answered 400/)
    expect(r.css).toContain('--font-brand:"Not A Font", system-ui, sans-serif')
  })

  it('builds the Google URL for italics', () => {
    expect(googleCssUrl({ google: 'Playfair Display', weights: [400], italic: true })).toBe(
      'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&display=swap',
    )
  })
})

describe('font props', () => {
  it('family resolves a declared font, and passes a CSS stack through', () => {
    expect(familyCss('brand')).toBe('var(--font-brand, brand)')
    expect(familyCss('Georgia, serif')).toBe('Georgia, serif')
  })

  it('weight words map to numbers', () => {
    expect(fontWeightCss('black')).toBe('900')
    expect(fontWeightCss('semibold')).toBe('600')
    expect(fontWeightCss(450)).toBe('450')
  })
})
