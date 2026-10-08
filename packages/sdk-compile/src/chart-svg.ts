/**
 * Chart SVG builder — the one renderer both lanes read.
 *
 * `render/templates/data.ts` (compile lane) calls this to stamp the initial
 * SVG; `client/handles/data.ts` calls it to repaint after setKind/setSeries/
 * setLabels. One function, no drift: a kind that draws here draws everywhere.
 * Pure string math — no DOM, no Node APIs — so the browser bundle inlines it.
 */

export const CHART_PALETTE = ['#6366F1', '#A855F7', '#EC4899', '#10B981', '#F59E0B', '#0284C7']

export interface ChartSpec {
  kind?: string
  series?: unknown
  labels?: unknown
  palette?: unknown
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const num = (n: number): string => String(Math.round(n * 10) / 10)

/** Render the chart SVG, or '' when there is nothing to draw. */
export function chartSvg(spec: ChartSpec): string {
  const kind = typeof spec.kind === 'string' ? spec.kind : 'bar'
  const series: number[][] = Array.isArray(spec.series)
    ? (spec.series as unknown[]).map((s) => (Array.isArray(s) ? s.map((v) => Number(v) || 0) : [Number(s) || 0]))
    : []
  const labels: string[] = Array.isArray(spec.labels) ? (spec.labels as unknown[]).map((l) => String(l)) : []
  const palette: string[] =
    Array.isArray(spec.palette) && (spec.palette as unknown[]).length > 0
      ? (spec.palette as unknown[]).map((c) => String(c))
      : CHART_PALETTE
  const W = 400
  const H = 220
  const P = 28

  let svg = ''
  if (kind === 'pie' || kind === 'donut') {
    const values = series[0] ?? []
    const total = values.reduce((a, b) => a + (Number(b) || 0), 0)
    if (total <= 0 || values.length === 0) {
      svg = ''
    } else if (kind === 'donut') {
      const R = 70
      const C = 2 * Math.PI * R
      let offset = 25
      const circles = values.map((v, i) => {
        const frac = Number(v) / total
        const s = `<circle cx="200" cy="110" r="${R}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="30" stroke-dasharray="${num(frac * C)} ${num(C)}" stroke-dashoffset="${num((-offset * C) / 100)}" transform="rotate(-90 200 110)" />`
        offset += frac * 100
        return s
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${circles.join('')}</svg>`
    } else {
      const cx = 200
      const cy = 110
      const R = 80
      let angle = -Math.PI / 2
      const paths = values.map((v, i) => {
        const frac = Number(v) / total
        const a0 = angle
        angle += frac * Math.PI * 2
        const a1 = angle
        const large = frac > 0.5 ? 1 : 0
        const x0 = cx + R * Math.cos(a0)
        const y0 = cy + R * Math.sin(a0)
        const x1 = cx + R * Math.cos(a1)
        const y1 = cy + R * Math.sin(a1)
        return `<path d="M ${num(cx)} ${num(cy)} L ${num(x0)} ${num(y0)} A ${R} ${R} 0 ${large} 1 ${num(x1)} ${num(y1)} Z" fill="${palette[i % palette.length]}" />`
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${paths.join('')}</svg>`
    }
  } else if (kind === 'line' || kind === 'area' || kind === 'scatter') {
    const all = series.length > 0 ? series : []
    const flat = all.flat().map(Number).filter(Number.isFinite)
    const max = Math.max(1, ...flat)
    const n = Math.max(...all.map((s) => s.length), 0)
    const px = (i: number): number => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1))
    const py = (v: number): number => H - P - (v / max) * (H - 2 * P)
    if (kind === 'scatter') {
      const pts: string[] = []
      all.forEach((s, si) => {
        s.forEach((v, i) => {
          pts.push(`<circle cx="${num(px(i))}" cy="${num(py(Number(v) || 0))}" r="4" fill="${palette[si % palette.length]}" />`)
        })
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${pts.join('')}</svg>`
    } else {
      const layers = all.map((s, si) => {
        const line = s.map((v, i) => `${num(px(i))},${num(py(Number(v) || 0))}`).join(' ')
        const color = palette[si % palette.length]
        if (kind === 'area' && si === 0) {
          return `<polygon points="${P},${H - P} ${line} ${W - P},${H - P}" fill="${color}" fill-opacity="0.25" /><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" />`
        }
        return `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" />`
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${layers.join('')}</svg>`
    }
  } else {
    // bar (default)
    const values = series[0] ?? []
    const max = Math.max(1, ...values.map((v) => Number(v) || 0))
    const n = values.length
    const slot = n > 0 ? (W - 2 * P) / n : 0
    const bars = values.map((v, i) => {
      const v2 = Number(v) || 0
      const h = (v2 / max) * (H - 2 * P)
      const x = P + i * slot + slot * 0.2
      const y = H - P - h
      const label =
        labels[i] !== undefined
          ? `<text x="${num(x + slot * 0.3)}" y="${H - 8}" font-size="10" text-anchor="middle">${esc(labels[i])}</text>`
          : ''
      return `<rect x="${num(x)}" y="${num(y)}" width="${num(slot * 0.6)}" height="${num(h)}" rx="3" fill="${palette[i % palette.length]}" />${label}`
    })
    svg = n > 0 ? `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${bars.join('')}</svg>` : ''
  }
  return svg
}
