import { describe, expect, it } from 'vitest'
import { Theme } from '../theme'

describe('Theme Google fonts', () => {
  it('loads via preconnect + a non-blocking stylesheet link', () => {
    const links = new Theme('station').googleFont('sans', 'Geist', [400, 500]).headLinks()
    expect(links).toContain('<link rel="preconnect" href="https://fonts.googleapis.com" />')
    expect(links).toContain('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />')
    expect(links).toContain('family=Geist:wght@400;500')
    expect(links).toContain('&display=swap')
    // Non-blocking: media=print flips to all on load, with a <noscript> fallback.
    expect(links).toContain('media="print"')
    expect(links).toContain("onload=\"this.media='all'\"")
    expect(links).toContain('<noscript>')
  })

  it('never emits a render-blocking @import', () => {
    const theme = new Theme('station').googleFont('sans', 'Geist')
    expect(theme.pageCss()).not.toContain('@import')
    expect(theme.pageCss()).not.toContain('fonts.googleapis.com')
    expect(theme.headLinks()).not.toContain('@import')
  })

  it('adds no links when the theme uses no Google fonts', () => {
    expect(new Theme('station').font('mono', 'Menlo').headLinks()).toBe('')
  })
})
