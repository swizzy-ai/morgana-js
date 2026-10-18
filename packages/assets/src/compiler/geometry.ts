// Shapes → flat-shaded triangles. Every generator returns triangles around
// its own centre; `toMesh` shifts them so the part turns around its pivot.
import { fbm, seeded } from './util'
import type { V3 } from './motion'

export interface Tri { a: V3; b: V3; c: V3; color?: V3 }
export interface MeshData { positions: Float32Array; normals: Float32Array; colors?: Float32Array; min: V3; max: V3 }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const normalOf = (t: Tri) => unit(cross(sub(t.b, t.a), sub(t.c, t.a)))

/** Wind every face to point away from the centre. Exact for convex shapes. */
function outward(tris: Tri[], center: V3 = [0, 0, 0]): Tri[] {
  return tris.map((t) => {
    const mid: V3 = [(t.a[0] + t.b[0] + t.c[0]) / 3, (t.a[1] + t.b[1] + t.c[1]) / 3, (t.a[2] + t.b[2] + t.c[2]) / 3]
    return dot(normalOf(t), sub(mid, center)) < 0 ? { ...t, b: t.c, c: t.b } : t
  })
}

const quad = (a: V3, b: V3, c: V3, d: V3): Tri[] => [{ a, b, c }, { a, b: c, c: d }]

export function box(w: number, h: number, d: number): Tri[] {
  const x = w / 2, y = h / 2, z = d / 2
  const p = (sx: number, sy: number, sz: number): V3 => [sx * x, sy * y, sz * z]
  return outward([
    ...quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)),
    ...quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)),
    ...quad(p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)),
    ...quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)),
    ...quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)),
    ...quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)),
  ])
}

/** A cylinder, or a cone when the top radius is 0. */
export function cylinder(rTop: number, rBottom: number, h: number, sides: number): Tri[] {
  const tris: Tri[] = []
  const y0 = -h / 2, y1 = h / 2
  const ring = (r: number, y: number, i: number): V3 => {
    const a = (i / sides) * Math.PI * 2
    return [Math.cos(a) * r, y, Math.sin(a) * r]
  }
  for (let i = 0; i < sides; i++) {
    const b0 = ring(rBottom, y0, i), b1 = ring(rBottom, y0, i + 1)
    const t0 = ring(rTop, y1, i), t1 = ring(rTop, y1, i + 1)
    if (rTop > 0) tris.push(...quad(b0, b1, t1, t0), { a: [0, y1, 0], b: t0, c: t1 })
    else tris.push({ a: b0, b: b1, c: [0, y1, 0] })
    tris.push({ a: [0, y0, 0], b: b1, c: b0 })
  }
  return outward(tris)
}

function icosphere(subdiv: number): { verts: V3[]; faces: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2
  const verts: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => unit(v as V3))
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map<string, number>()
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      let i = cache.get(key)
      if (i === undefined) {
        const va = verts[a], vb = verts[b]
        i = verts.push(unit([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2])) - 1
        cache.set(key, i)
      }
      return i
    }
    faces = faces.flatMap(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as [number, number, number][]
    })
  }
  return { verts, faces }
}

/** A sphere (or egg) squeezed to `w × h × d`; `lump` pushes the surface in and out with noise. */
export function sphere(w: number, h: number, d: number, subdiv: number, lump = 0, seed = 0): Tri[] {
  const { verts, faces } = icosphere(subdiv)
  // Wind on the perfect sphere, then deform: dents can't flip a face that way.
  const wound = outward(faces.map(([a, b, c]) => ({ a: verts[a], b: verts[b], c: verts[c] })))
  const shaped = (v: V3): V3 => {
    const k = 1 + lump * (fbm(v[0] * 1.6 + seed, v[1] * 1.6, v[2] * 1.6, seed, 3) - 0.5) * 1.6
    return [v[0] * k * w / 2, v[1] * k * h / 2, v[2] * k * d / 2]
  }
  return wound.map((t) => ({ a: shaped(t.a), b: shaped(t.b), c: shaped(t.c) }))
}

/** A height-field island: noise, falling off towards the edges, coloured by height bands. */
export function terrain(w: number, d: number, peaks: number, detail: number, seed: number, bands: V3[]): Tri[] {
  const n = Math.max(4, Math.round(detail))
  const rand = seeded(seed)
  const ox = rand() * 100, oz = rand() * 100
  const height = (x: number, z: number) => {
    const nx = x / (w / 2), nz = z / (d / 2)
    const fall = nx * nx + nz * nz
    const f = fbm(nx * 1.8 + ox, 0, nz * 1.8 + oz, seed, 5)
    return (f * 2.4 - 0.7 - fall * 1.1) * peaks
  }
  const grid: V3[][] = []
  for (let i = 0; i <= n; i++) {
    grid.push([])
    for (let j = 0; j <= n; j++) {
      const x = -w / 2 + (w * i) / n, z = -d / 2 + (d * j) / n
      grid[i].push([x, height(x, z), z])
    }
  }
  const band = (y: number) => {
    const t = y / peaks
    if (t < 0.04) return bands[0]
    return bands[Math.min(bands.length - 1, 1 + Math.floor(((t - 0.04) / 0.6) * (bands.length - 1)))]
  }
  const tris: Tri[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], e = grid[i][j + 1]
      for (const t of [{ a, b, c }, { a, b: c, c: e }] as Tri[]) {
        const up = normalOf(t)[1] >= 0 ? t : { ...t, b: t.c, c: t.b }
        tris.push({ ...up, color: band((t.a[1] + t.b[1] + t.c[1]) / 3) })
      }
    }
  }
  return tris
}

/** Triangles → buffers, shifted by `offset` (so the part's pivot sits at its node's origin). */
export function toMesh(tris: Tri[], offset: V3): MeshData {
  const positions = new Float32Array(tris.length * 9)
  const normals = new Float32Array(tris.length * 9)
  const hasColor = tris.some((t) => t.color)
  const colors = hasColor ? new Float32Array(tris.length * 9) : undefined
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]
  tris.forEach((t, i) => {
    const n = normalOf(t)
    ;[t.a, t.b, t.c].forEach((v, k) => {
      const o = i * 9 + k * 3
      for (let c = 0; c < 3; c++) {
        const p = v[c] + offset[c]
        positions[o + c] = p
        normals[o + c] = n[c]
        if (colors) colors[o + c] = (t.color ?? [1, 1, 1])[c]
        if (p < min[c]) min[c] = p
        if (p > max[c]) max[c] = p
      }
    })
  })
  return { positions, normals, colors, min, max }
}
