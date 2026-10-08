/**
 * Chart builder guard — one function feeds both lanes.
 *
 * The gap this locks in: `renderChart` (compile) and the client repaint path
 * each hand-rolled SVG, so a kind could draw at build and vanish on
 * setKind, or vice versa. Both now call `chartSvg`; this asserts every kind
 * draws, empties stay empty, and labels escape.
 */
import { describe, expect, it } from 'vitest'
import { chartSvg } from '../chart-svg'

const SERIES = [[12, 19, 8, 15]]
const LABELS = ['Box', 'Text', 'Button', 'Chart']

describe('chartSvg', () => {
  for (const kind of ['bar', 'line', 'area', 'pie', 'donut', 'scatter']) {
    it(`draws ${kind}`, () => {
      const svg = chartSvg({ kind, series: SERIES, labels: LABELS })
      expect(svg).toContain('<svg')
      expect(svg).toContain('viewBox="0 0 400 220"')
    })
  }

  it('labels bars and escapes HTML', () => {
    const svg = chartSvg({ kind: 'bar', series: [[5]], labels: ['<b>hi</b>'] })
    expect(svg).toContain('&lt;b&gt;hi&lt;/b&gt;')
    expect(svg).not.toContain('<b>hi</b>')
  })

  it('returns empty for missing/zero data', () => {
    expect(chartSvg({ kind: 'bar', series: [] })).toBe('')
    expect(chartSvg({ kind: 'pie', series: [[0, 0]] })).toBe('')
    // Line-family with no series keeps its (empty) shell — compile parity.
    const shell = chartSvg({ kind: 'line' })
    expect(shell).toContain('<svg')
    expect(shell).not.toContain('polyline')
  })

  it('honors a custom palette', () => {
    const svg = chartSvg({ kind: 'bar', series: [[3]], labels: ['x'], palette: ['#123456'] })
    expect(svg).toContain('#123456')
  })
})
