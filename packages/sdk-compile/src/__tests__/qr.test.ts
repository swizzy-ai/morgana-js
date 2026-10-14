import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { encodeQr, qrSvg, type QrEcc } from '../qr'

/** Rasterise a module grid (with quiet zone) and decode it with an independent reader. */
function decode(modules: boolean[][]): string | null {
  const scale = 4
  const margin = 4
  const n = modules.length + margin * 2
  const w = n * scale
  const px = new Uint8ClampedArray(w * w * 4).fill(255)
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + margin) * scale + dy) * w + (x + margin) * scale + dx) * 4
          px[i] = px[i + 1] = px[i + 2] = 0
        }
    }),
  )
  return jsQR(px, w, w)?.data ?? null
}

describe('QR encoder', () => {
  const cases = [
    'https://morgana.app',
    'A',
    'Hello, wörld — ünïcödé ✓',
    'x'.repeat(150),
    'https://example.com/orders/12345?token=' + 'abc123'.repeat(20),
    'y'.repeat(900),
  ]
  for (const text of cases) {
    for (const ecc of ['L', 'M', 'Q', 'H'] as QrEcc[]) {
      it(`round-trips ${text.length} chars at ${ecc}`, () => {
        const grid = encodeQr(text, ecc)
        expect(grid.length).toBeGreaterThanOrEqual(21)
        expect((grid.length - 17) % 4).toBe(0)
        expect(decode(grid)).toBe(text)
      })
    }
  }

  it('picks larger versions for longer text', () => {
    expect(encodeQr('hi').length).toBe(21)
    expect(encodeQr('z'.repeat(300)).length).toBeGreaterThan(41)
  })

  it('renders one path SVG with a quiet zone', () => {
    const svg = qrSvg('hi', { color: '#111' })
    expect(svg).toMatch(/^<svg data-part="code"/)
    expect(svg).toContain('viewBox="0 0 29 29"')
    expect(svg).toContain('fill="#111"')
  })

  it('refuses text beyond version 40', () => {
    expect(() => encodeQr('z'.repeat(4000), 'H')).toThrow(/too long/)
  })
})
