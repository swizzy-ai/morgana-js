// 2D layers → SVG. Three outputs from one evaluator: a still, a
// self-animating SVG per clip (CSS keyframes, plays anywhere an <img> does),
// and a sprite sheet with a Pixi/Phaser-style atlas.
import type { Clips, Layer } from '../index'
import { LENGTH_2D, OUTLINE, TRAVEL_2D, type Side } from '../words'
import { clipInfo, poseAt, type ClipInfo, type Pose } from './motion'
import { color, word } from './util'

type M = [number, number, number, number, number, number]   // SVG matrix(a b c d e f)
const mul = (x: M, y: M): M => [
  x[0] * y[0] + x[2] * y[1], x[1] * y[0] + x[3] * y[1],
  x[0] * y[2] + x[2] * y[3], x[1] * y[2] + x[3] * y[3],
  x[0] * y[4] + x[2] * y[5] + x[4], x[1] * y[4] + x[3] * y[5] + x[5],
]
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y]
const S = (x: number, y: number): M => [x, 0, 0, y, 0, 0]
const R = (deg: number): M => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0] }
const fmt = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(Math.round(n * 1000) / 1000))
const matrix = (m: M) => `matrix(${m.map(fmt).join(' ')})`
// CSS needs commas; the SVG attribute form doesn't.
const cssMatrix = (m: M) => `matrix(${m.map(fmt).join(',')})`

const HEART = {
  both: 'M0,35 C-40,10 -50,-15 -35,-30 C-22,-42 -5,-38 0,-22 C5,-38 22,-42 35,-30 C50,-15 40,10 0,35 Z',
  left: 'M0,35 C-40,10 -50,-15 -35,-30 C-22,-42 -5,-38 0,-22 Z',
  right: 'M0,-22 C5,-38 22,-42 35,-30 C50,-15 40,10 0,35 Z',
}

interface Resolved { layer: Layer; w: number; h: number; abs: [number, number]; rel: [number, number]; pivot: [number, number]; children: Resolved[] }

const PLACE: Record<string, number> = { top: 0.25, bottom: 0.75, left: 0.25, right: 0.75, center: 0.5 }
const NUDGE: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], forward: [0, 0], back: [0, 0] }

function resolve(name: string, layers: Layer[], C: number): Resolved[] {
  const byId = new Map<string, Resolved>()
  const roots: Resolved[] = []
  const frac = (v: unknown) => word(LENGTH_2D, v as string, 'size')
  for (const layer of layers) {
    const s = layer.opts.size ?? 'medium'
    const [fw, fh] = Array.isArray(s) ? [frac(s[0]), frac(s[1])] : [frac(s), frac(s)]
    const w = fw * C, h = fh * C
    let fx = 0.5, fy = 0.5
    if (Array.isArray(layer.place)) [fx, fy] = layer.place
    else {
      const words = layer.place.split(' ')
      for (const wd of words) {
        if (wd === 'top' || wd === 'bottom') fy = PLACE[wd]
        if (wd === 'left' || wd === 'right') fx = PLACE[wd]
      }
    }
    const abs: [number, number] = [fx * C, fy * C]
    for (const [dir, amount] of layer.nudges) {
      const d = word(TRAVEL_2D, amount, 'amount') * C
      abs[0] += NUDGE[dir][0] * d; abs[1] += NUDGE[dir][1] * d
    }
    const pivots: Record<Side, [number, number]> = {
      center: [0, 0], top: [0, -h / 2], bottom: [0, h / 2], left: [-w / 2, 0], right: [w / 2, 0], front: [0, 0], back: [0, 0],
    }
    const parent = layer.parent ? byId.get(layer.parent) : undefined
    if (layer.parent && !parent) throw new Error(`${name}: "${layer.id}" is on "${layer.parent}", which isn't defined above it`)
    const r: Resolved = {
      layer, w, h, abs,
      rel: parent ? [abs[0] - parent.abs[0], abs[1] - parent.abs[1]] : abs,
      pivot: pivots[layer.pivotSide], children: [],
    }
    if (byId.has(layer.id)) throw new Error(`${name}: two layers are called "${layer.id}"`)
    byId.set(layer.id, r)
    ;(parent ? parent.children : roots).push(r)
  }
  return roots
}

function local(r: Resolved, pose: Pose | null): M {
  const p = pose ?? { t: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], o: 1 }
  const [ox, oy] = r.pivot
  return [
    T(r.rel[0] + p.t[0] + ox, r.rel[1] + p.t[1] + oy),
    R(r.layer.rotation + p.r[2]),
    S(p.s[0], p.s[1]),
    T(-ox, -oy),
  ].reduce(mul)
}

function shape(r: Resolved, C: number): string {
  const o = r.layer.opts
  const fill = `fill="${o.fill ? color(o.fill) : color('white')}"`
  const stroke = o.outline
    ? ` stroke="${color(o.outline)}" stroke-width="${fmt(word(OUTLINE, o.outlineWidth ?? 'medium', 'outline') * (C / 128))}" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
    : ''
  const { w, h } = r
  const radial = (n: number, inner?: number) => {
    const pts: string[] = []
    const count = inner ? n * 2 : n
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i / count) * Math.PI * 2
      const rad = (inner && i % 2 ? inner : 1) * (w / 2)
      pts.push(`${fmt(Math.cos(a) * rad)},${fmt(Math.sin(a) * rad)}`)
    }
    return pts.join(' ')
  }
  switch (r.layer.shape) {
    case 'circle': return `<circle r="${fmt(w / 2)}" ${fill}${stroke}/>`
    case 'ellipse': return `<ellipse rx="${fmt(w / 2)}" ry="${fmt(h / 2)}" ${fill}${stroke}/>`
    case 'rect': return `<rect x="${fmt(-w / 2)}" y="${fmt(-h / 2)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(((o.round ?? 0) * Math.min(w, h)) / 2)}" ${fill}${stroke}/>`
    case 'star': return `<polygon points="${radial(o.points ?? 5, o.inner ?? 0.45)}" ${fill}${stroke}/>`
    case 'polygon': return `<polygon points="${radial(o.points ?? 6)}" ${fill}${stroke}/>`
    case 'heart': return `<path d="${HEART[o.half ?? 'both']}" transform="scale(${fmt(w / 100)})" ${fill}${stroke}/>`
    case 'path': return `<path d="${o.d ?? ''}" transform="scale(${fmt(w / 100)})" ${fill}${stroke}/>`
  }
}

/** Nested groups for every layer, posed by `poseOf`. `ids` names groups so CSS can animate them. */
function draw(roots: Resolved[], C: number, poseOf: (id: string) => Pose | null, ids = false): string {
  const g = (r: Resolved): string => {
    const pose = poseOf(r.layer.id)
    const opacity = (r.layer.opts.opacity ?? 1) * (pose?.o ?? 1)
    const attrs = [
      ids ? `id="l-${r.layer.id}"` : '',
      `transform="${matrix(local(r, pose))}"`,
      opacity < 1 ? `opacity="${fmt(opacity)}"` : '',
      r.layer.opts.hidden ? 'display="none"' : '',
    ].filter(Boolean).join(' ')
    return `<g ${attrs}>${shape(r, C)}${r.children.map(g).join('')}</g>`
  }
  return roots.map(g).join('')
}

const svgDoc = (w: number, h: number, body: string, style = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${style ? `<style>${style}</style>` : ''}${body}</svg>\n`

export interface Compiled2D {
  still: string
  animated: Record<string, string>
  sheet: { svg: string; atlas: Record<string, unknown> } | null
  clips: ClipInfo[]
}

export function compile2d(name: string, layers: Layer[], clips: Clips, C = 128, fps = 12, sheetFile = `${name}.sheet.svg`): Compiled2D {
  const roots = resolve(name, layers, C)
  const all = layers.map((l) => l.id)
  for (const [clip, motions] of Object.entries(clips)) {
    for (const m of motions) if (!all.includes(m.target)) throw new Error(`${name}: clip "${clip}" moves "${m.target}", which isn't a layer`)
  }
  const still = svgDoc(C, C, draw(roots, C, () => null))
  const infos = Object.entries(clips).map(([n, m]) => clipInfo(n, m))

  // Self-animating SVG: sample at 30fps into CSS keyframes, one per moving layer.
  const animated: Record<string, string> = {}
  const flat: Resolved[] = []
  const walk = (r: Resolved) => { flat.push(r); r.children.forEach(walk) }
  roots.forEach(walk)
  for (const info of infos) {
    const motions = clips[info.name]
    const steps = Math.max(2, Math.ceil(info.duration * 30) + 1)
    // A one-shot clip holds its last frame for a moment before it repeats.
    const cycle = info.loop ? info.duration : info.duration + 0.8
    let css = ''
    for (const r of flat) {
      if (!motions.some((m) => m.target === r.layer.id)) continue
      const frames: string[] = []
      for (let i = 0; i < steps; i++) {
        const t = (i / (steps - 1)) * info.duration
        const pose = poseAt(motions, r.layer.id, t, '2d', C)
        const op = (r.layer.opts.opacity ?? 1) * (pose?.o ?? 1)
        frames.push(`${fmt((t / cycle) * 100)}%{transform:${cssMatrix(local(r, pose))};opacity:${fmt(op)}}`)
      }
      if (!info.loop) frames.push(frames[frames.length - 1].replace(/^[\d.]+%/, '100%'))
      css += `@keyframes k-${r.layer.id}{${frames.join('')}}#l-${r.layer.id}{transform-origin:0 0;transform-box:view-box;animation:k-${r.layer.id} ${fmt(cycle)}s linear infinite}`
    }
    animated[info.name] = svgDoc(C, C, draw(roots, C, (id) => poseAt(motions, id, 0, '2d', C), true), css)
  }

  // Sprite sheet: one row per clip, `fps` frames per second.
  let sheet: Compiled2D['sheet'] = null
  if (infos.length) {
    const rows = infos.map((info) => ({ info, count: Math.max(1, Math.round(info.duration * fps)) }))
    const cols = Math.max(...rows.map((r) => r.count))
    const frames: Record<string, unknown> = {}
    const animations: Record<string, string[]> = {}
    let body = ''
    rows.forEach(({ info, count }, row) => {
      animations[info.name] = []
      for (let i = 0; i < count; i++) {
        const t = i / fps
        const x = i * C, y = row * C
        body += `<svg x="${x}" y="${y}" width="${C}" height="${C}" viewBox="0 0 ${C} ${C}">${draw(roots, C, (id) => poseAt(clips[info.name], id, t, '2d', C))}</svg>`
        const key = `${name}/${info.name}/${i}`
        frames[key] = { frame: { x, y, w: C, h: C }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: C, h: C }, sourceSize: { w: C, h: C } }
        animations[info.name].push(key)
      }
    })
    sheet = {
      svg: svgDoc(cols * C, rows.length * C, body),
      atlas: { frames, animations, meta: { app: 'morgana-assets', version: '0.1', image: sheetFile, size: { w: cols * C, h: rows.length * C }, scale: 1, fps } },
    }
  }
  return { still, animated, sheet, clips: infos }
}
