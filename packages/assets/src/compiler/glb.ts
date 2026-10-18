// A minimal glTF 2.0 binary (.glb) writer: nodes, flat meshes, PBR materials
// and keyframe animations. What Unity, Godot, Unreal, Blender and three.js
// all import.
import type { MeshData } from './geometry'
import type { V3 } from './motion'

export interface GNode { name: string; translation: V3; rotation: [number, number, number, number]; scale: V3; mesh?: number; children: number[] }
export interface GMesh { name: string; data: MeshData; material: number }
export interface GMaterial { name: string; color: [number, number, number, number]; metal: number; rough: number; glow?: V3; blend: boolean }
export interface GChannel { node: number; path: 'translation' | 'rotation' | 'scale'; times: Float32Array; values: Float32Array }
export interface GAnimation { name: string; channels: GChannel[] }
export interface GScene { name: string; nodes: GNode[]; roots: number[]; meshes: GMesh[]; materials: GMaterial[]; animations: GAnimation[] }

const FLOAT = 5126
const SIZE = { SCALAR: 1, VEC3: 3, VEC4: 4 } as const

export function writeGlb(scene: GScene): Uint8Array {
  const chunks: Uint8Array[] = []
  let byteLength = 0
  const bufferViews: Record<string, unknown>[] = []
  const accessors: Record<string, unknown>[] = []

  const accessor = (data: Float32Array, type: keyof typeof SIZE, minmax = false): number => {
    const pad = (4 - (byteLength % 4)) % 4
    if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad }
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength })
    chunks.push(bytes); byteLength += bytes.byteLength
    const count = data.length / SIZE[type]
    const acc: Record<string, unknown> = { bufferView: bufferViews.length - 1, componentType: FLOAT, count, type }
    if (minmax) {
      const n = SIZE[type], min = new Array(n).fill(Infinity), max = new Array(n).fill(-Infinity)
      for (let i = 0; i < data.length; i++) { const c = i % n; if (data[i] < min[c]) min[c] = data[i]; if (data[i] > max[c]) max[c] = data[i] }
      acc.min = min; acc.max = max
    }
    accessors.push(acc)
    return accessors.length - 1
  }

  const meshes = scene.meshes.map((m) => {
    const attributes: Record<string, number> = {
      POSITION: accessor(m.data.positions, 'VEC3', true),
      NORMAL: accessor(m.data.normals, 'VEC3'),
    }
    if (m.data.colors) attributes.COLOR_0 = accessor(m.data.colors, 'VEC3')
    return { name: m.name, primitives: [{ attributes, material: m.material }] }
  })

  const animations = scene.animations.map((a) => {
    const samplers: Record<string, unknown>[] = []
    const channels = a.channels.map((c) => {
      samplers.push({
        input: accessor(c.times, 'SCALAR', true),
        output: accessor(c.values, c.path === 'rotation' ? 'VEC4' : 'VEC3'),
        interpolation: 'LINEAR',
      })
      return { sampler: samplers.length - 1, target: { node: c.node, path: c.path } }
    })
    return { name: a.name, samplers, channels }
  })

  const json = {
    asset: { version: '2.0', generator: 'morgana-assets 0.1 (preview)' },
    scene: 0,
    scenes: [{ name: scene.name, nodes: scene.roots }],
    nodes: scene.nodes.map((n) => ({
      name: n.name, translation: n.translation, rotation: n.rotation, scale: n.scale,
      ...(n.mesh !== undefined ? { mesh: n.mesh } : {}),
      ...(n.children.length ? { children: n.children } : {}),
    })),
    meshes,
    materials: scene.materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: m.metal, roughnessFactor: m.rough },
      ...(m.glow ? { emissiveFactor: m.glow } : {}),
      ...(m.blend ? { alphaMode: 'BLEND' } : {}),
    })),
    ...(animations.length ? { animations } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  }

  const bin = new Uint8Array(Math.ceil(byteLength / 4) * 4)
  let at = 0
  for (const c of chunks) { bin.set(c, at); at += c.byteLength }

  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const jsonBytes = new TextEncoder().encode(text)

  const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)       // 'glTF'
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)      // 'JSON'
  out.set(jsonBytes, 20)
  const binAt = 20 + jsonBytes.byteLength
  view.setUint32(binAt, bin.byteLength, true)
  view.setUint32(binAt + 4, 0x004e4942, true) // 'BIN'
  out.set(bin, binAt + 8)
  return out
}
