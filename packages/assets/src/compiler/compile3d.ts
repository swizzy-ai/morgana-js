// 3D parts → a glTF scene. Placement words become positions, pivots become
// node origins, motions become sampled keyframes.
import type { Clips, Part } from '../index'
import { LENGTH_3D, TRAVEL_3D, type Side } from '../words'
import * as geo from './geometry'
import type { GAnimation, GChannel, GMaterial, GMesh, GNode, GScene } from './glb'
import { clipInfo, poseAt, type ClipInfo, type V3 } from './motion'
import { linear, surface, word } from './util'

const FPS = 30

const len = (v: unknown) => word(LENGTH_3D, v as string, 'size')

function sizeOf(p: Part): V3 {
  const s = p.opts.size ?? 'medium'
  if (p.shape === 'terrain') {
    const w = Array.isArray(s) ? len(s[0]) : len(s)
    const d = Array.isArray(s) ? len(s[s.length - 1]) : w
    return [w, len(p.opts.peaks ?? 'medium'), d]
  }
  if (!Array.isArray(s)) { const n = len(s); return [n, n, n] }
  if (s.length === 2) return [len(s[0]), len(s[1]), len(s[0])]   // [diameter, height]
  return [len(s[0]), len(s[1]), len(s[2])]
}

function sideOffset(side: Side, [w, h, d]: V3): V3 {
  switch (side) {
    case 'top': return [0, h / 2, 0]
    case 'bottom': return [0, -h / 2, 0]
    case 'left': return [-w / 2, 0, 0]
    case 'right': return [w / 2, 0, 0]
    case 'front': return [0, 0, d / 2]
    case 'back': return [0, 0, -d / 2]
    default: return [0, 0, 0]
  }
}

const DIRS: Record<string, V3> = { up: [0, 1, 0], down: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], forward: [0, 0, 1], back: [0, 0, -1] }
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]

function quat([x, y, z]: V3): [number, number, number, number] {
  const r = Math.PI / 360   // degrees → half-angle radians
  const c1 = Math.cos(x * r), c2 = Math.cos(y * r), c3 = Math.cos(z * r)
  const s1 = Math.sin(x * r), s2 = Math.sin(y * r), s3 = Math.sin(z * r)
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]
}

type Q = [number, number, number, number]
const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const qconj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]]
const qrot = (q: Q, v: V3): V3 => { const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q)); return [r[0], r[1], r[2]] }
const IDENTITY: Q = [0, 0, 0, 1]

function trianglesOf(p: Part, [w, h, d]: V3): geo.Tri[] {
  const o = p.opts
  switch (p.shape) {
    case 'box': return geo.box(w, h, d)
    case 'cylinder': return geo.cylinder(w / 2, w / 2, h, o.sides ?? 12)
    case 'cone': return geo.cylinder((w / 2) * (o.top ?? 0), w / 2, h, o.sides ?? 10)
    case 'sphere': return geo.sphere(w, h, d, (o.sides ?? 12) >= 24 ? 2 : 1)
    case 'rock': return geo.sphere(w, h, d, 1, o.lumpy ?? 0.5, o.seed ?? 1)
    case 'terrain': {
      const bands = (o.bands ?? ['sand', 'grass', 'dark grass', 'stone', 'snow']).map((b) => linear(surface(b).color))
      return geo.terrain(w, d, h, o.detail ?? 40, o.seed ?? 1, bands)
    }
  }
}

export interface Compiled3D { scene: GScene; clips: ClipInfo[]; bounds: { min: V3; max: V3 } }

export function compile3d(name: string, parts: Part[], clips: Clips = {}): Compiled3D {
  const byId = new Map<string, { part: Part; size: V3; center: V3; pivot: V3; node: number; world: Q; toParent: Q }>()
  const nodes: GNode[] = [], meshes: GMesh[] = [], materials: GMaterial[] = [], roots: number[] = []
  const materialIndex = new Map<string, number>()
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]

  const materialFor = (p: Part): number => {
    const key = p.shape === 'terrain' ? '__terrain' : p.opts.looks ?? 'plastic'
    let i = materialIndex.get(key)
    if (i !== undefined) return i
    if (key === '__terrain') {
      materials.push({ name: 'terrain', color: [1, 1, 1, 1], metal: 0, rough: 0.95, blend: false })
    } else {
      const s = surface(key)
      materials.push({
        name: key,
        color: [...linear(s.color), s.see !== undefined ? 1 - s.see : 1] as [number, number, number, number],
        metal: s.metal, rough: s.rough,
        glow: s.glow ? linear(s.glow) : undefined,
        blend: s.see !== undefined,
      })
    }
    i = materials.length - 1
    materialIndex.set(key, i)
    return i
  }

  for (const part of parts) {
    if (byId.has(part.id)) throw new Error(`${name}: two parts are called "${part.id}"`)
    const size = sizeOf(part)
    const pl = part.placement
    let center: V3
    if (pl.how === 'at') center = pl.point ?? [0, 0, 0]
    else {
      const ref = byId.get(pl.ref!)
      if (!ref) throw new Error(`${name}: "${part.id}" is placed against "${pl.ref}", which isn't defined above it`)
      const side = pl.side ?? 'top'
      const half = (s: V3) => sideOffset(side, s)
      if (pl.how === 'in') center = add(ref.center, half(ref.size))
      else {
        const dir = half([1, 1, 1]).map((v) => Math.sign(v)) as V3
        center = add(add(add(ref.center, half(ref.size)), half(size)), dir, pl.gap)
      }
    }
    for (const [dir, amount] of part.nudges) center = add(center, DIRS[dir], word(TRAVEL_3D, amount, 'amount'))

    const pivot = add(center, sideOffset(part.pivotSide, size))
    const parent = part.parent ? byId.get(part.parent) : undefined
    if (part.parent && !parent) throw new Error(`${name}: "${part.id}" is attached to "${part.parent}", which isn't defined above it`)

    const data = geo.toMesh(trianglesOf(part, size), add(center, pivot, -1))
    meshes.push({ name: part.id, data, material: materialFor(part) })
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], data.min[c] + pivot[c]); max[c] = Math.max(max[c], data.max[c] + pivot[c]) }

    // Positions and turns are always in world terms: attaching only decides
    // what moves together. So a child's node undoes its parent's rest turn.
    const world = quat(part.rotation)
    const toParent = parent ? qconj(parent.world) : IDENTITY
    const node = nodes.push({
      name: part.id,
      translation: parent ? qrot(toParent, add(pivot, parent.pivot, -1)) : pivot,
      rotation: qmul(toParent, world),
      scale: [1, 1, 1],
      mesh: meshes.length - 1,
      children: [],
    }) - 1
    if (parent) nodes[parent.node].children.push(node)
    else roots.push(node)
    byId.set(part.id, { part, size, center, pivot, node, world, toParent })
  }

  const infos: ClipInfo[] = []
  const animations: GAnimation[] = []
  for (const [clipName, motions] of Object.entries(clips)) {
    for (const m of motions) if (!byId.has(m.target)) throw new Error(`${name}: clip "${clipName}" moves "${m.target}", which isn't a part`)
    const info = clipInfo(clipName, motions)
    infos.push(info)
    const frames = Math.max(2, Math.ceil(info.duration * FPS) + 1)
    const times = new Float32Array(frames).map((_, i) => (i / (frames - 1)) * info.duration)
    const channels: GChannel[] = []
    for (const target of new Set(motions.map((m) => m.target))) {
      const { node, world, toParent } = byId.get(target)!
      const restT = nodes[node].translation
      const poses = Array.from(times, (t) => poseAt(motions, target, t, '3d')!)
      const moved = (f: (p: (typeof poses)[number]) => boolean) => poses.some(f)
      if (moved((p) => p.t.some((v) => Math.abs(v) > 1e-6))) {
        channels.push({ node, path: 'translation', times, values: Float32Array.from(poses.flatMap((p) => add(restT, qrot(toParent, p.t)))) })
      }
      if (moved((p) => p.r.some((v) => Math.abs(v) > 1e-6))) {
        channels.push({ node, path: 'rotation', times, // Motion axes are world axes too: spins('z') spins around z however the part is turned.
        values: Float32Array.from(poses.flatMap((p) => qmul(qmul(toParent, quat(p.r)), world))) })
      }
      if (moved((p) => p.s.some((v) => Math.abs(v - 1) > 1e-6))) {
        channels.push({ node, path: 'scale', times, values: Float32Array.from(poses.flatMap((p) => p.s)) })
      }
    }
    animations.push({ name: clipName, channels })
  }

  return { scene: { name, nodes, roots, meshes, materials, animations }, clips: infos, bounds: { min, max } }
}
