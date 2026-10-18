/**
 * The assets compiler. These pin what a creator relies on without reading
 * any maths: words turn the way they say, the same definition always builds
 * the same bytes, outputs are real glTF and SVG, and mistakes come back as
 * sentences.
 */
import { describe, expect, it } from 'vitest'
import { box, circle, defineAsset, heart, motion, type AssetDefinition, type Kit } from '../index'
import { compileAsset } from '../compiler'
import { rotationAxis } from '../words'

function kit(variant = 'default', seed = 1): Kit {
  let a = seed
  const random = () => ((a = (a * 16807) % 2147483647) / 2147483647)
  return { variant, seed, random, between: (lo, hi) => lo + (hi - lo) * random(), pick: (xs) => xs[Math.floor(random() * xs.length)] }
}

/** The JSON chunk of a .glb. */
function gltfJson(bytes: Uint8Array): Record<string, any> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(0, true)).toBe(0x46546c67) // 'glTF'
  expect(view.getUint32(4, true)).toBe(2)
  expect(view.getUint32(8, true)).toBe(bytes.byteLength)
  const length = view.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)))
}

/** The last keyframe value of one animation channel, read from the binary chunk. */
function lastKey(bytes: Uint8Array, json: Record<string, any>, animation: string, node: string, path: string): number[] {
  const anim = json.animations.find((a: any) => a.name === animation)
  const nodeIndex = json.nodes.findIndex((n: any) => n.name === node)
  const channel = anim.channels.find((c: any) => c.target.node === nodeIndex && c.target.path === path)
  const accessor = json.accessors[anim.samplers[channel.sampler].output]
  const view = json.bufferViews[accessor.bufferView]
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)
  const binStart = 20 + jsonLength + 8
  const floats = new Float32Array(bytes.slice(binStart + view.byteOffset, binStart + view.byteOffset + view.byteLength).buffer)
  const width = path === 'rotation' ? 4 : 3
  return Array.from(floats.slice(floats.length - width))
}

const lid = box('lid', { size: [1, 0.2, 1], looks: 'dark wood' }).at(0, 1, 0).hinged('back')
const chest: AssetDefinition = defineAsset({
  name: 'chest',
  kind: '3d',
  parts: [box('base', { size: 1, looks: 'wood' }).at(0, 0.5, 0), lid],
  animations: { open: [motion(lid).turns('a quarter', 'backward').over('fast')] },
})

describe('words → directions', () => {
  it('maps every turn direction to one axis, the way it reads', () => {
    expect(rotationAxis('left', '3d')).toEqual({ axis: 1, sign: 1 })
    expect(rotationAxis('right', '3d')).toEqual({ axis: 1, sign: -1 })
    expect(rotationAxis('forward', '3d')).toEqual({ axis: 0, sign: 1 })
    expect(rotationAxis('backward', '3d')).toEqual({ axis: 0, sign: -1 })
    expect(rotationAxis('clockwise', '3d')).toEqual({ axis: 2, sign: -1 })
    expect(rotationAxis('clockwise', '2d')).toEqual({ axis: 2, sign: 1 }) // on screen, y grows down
  })

  it("turns('a quarter', 'backward') ends a quarter turn tipped back", () => {
    const out = compileAsset(chest, kit())
    const glb = out.files[0].data as Uint8Array
    const q = lastKey(glb, gltfJson(glb), 'open', 'lid', 'rotation')
    // A quarter turn around x, negative: (sin(-45°), 0, 0, cos(45°)).
    expect(q[0]).toBeCloseTo(-Math.SQRT1_2, 3)
    expect(q[1]).toBeCloseTo(0, 5)
    expect(q[2]).toBeCloseTo(0, 5)
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 3)
  })

  it('hinges a lid on its back edge: the node sits on the hinge, the mesh hangs forward of it', () => {
    const glb = compileAsset(chest, kit()).files[0].data as Uint8Array
    const json = gltfJson(glb)
    const node = json.nodes.find((n: any) => n.name === 'lid')
    expect(node.translation[2]).toBeCloseTo(-0.5, 5)
    const position = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION]
    expect(position.min[2]).toBeCloseTo(0, 5)
    expect(position.max[2]).toBeCloseTo(1, 5)
  })
})

describe('outputs', () => {
  it('builds a valid glTF with materials from surface words and one animation per clip', () => {
    const out = compileAsset(chest, kit())
    expect(out.kind).toBe('3d')
    expect(out.files.map((f) => f.role)).toEqual(['model'])
    expect(out.triangles).toBe(24)
    const json = gltfJson(out.files[0].data as Uint8Array)
    expect(json.materials.map((m: any) => m.name)).toEqual(['wood', 'dark wood'])
    expect(json.animations.map((a: any) => a.name)).toEqual(['open'])
  })

  it('is deterministic: the same definition and seed give the same bytes', () => {
    const a = compileAsset(chest, kit()).files[0].data as Uint8Array
    const b = compileAsset(chest, kit()).files[0].data as Uint8Array
    expect(a).toEqual(b)
  })

  it('builds 2D stills, self-animating clips and a sprite sheet with an atlas', () => {
    const rim = circle('rim', { size: 'huge', fill: 'gold' })
    const coin = defineAsset({ name: 'coin', kind: '2d', parts: [rim], animations: { spin: [motion(rim).flips('around')] } })
    const out = compileAsset(coin, kit())
    expect(out.files.map((f) => f.role)).toEqual(['still', 'clip:spin', 'sheet', 'atlas'])
    const clip = out.files[1].data as string
    // CSS matrix() needs commas; the SVG attribute form doesn't. Spaces made
    // every transform keyframe invalid, and only opacity animated.
    expect(clip).toMatch(/transform:matrix\(-?[\d.]+,/)
    const atlas = JSON.parse(out.files[3].data as string)
    expect(atlas.animations.spin).toHaveLength(12)
    expect(atlas.meta.image).toBe('coin.sheet.svg')
  })

  it("applies a variant's overrides without touching the shared definition", () => {
    const left = heart('left', { size: 'huge', fill: 'red', half: 'left' })
    const right = heart('right', { size: 'huge', fill: 'red', half: 'right' }).on(left)
    const hearts = defineAsset({ name: 'heart', kind: '2d', parts: [left, right], variants: { full: {}, half: { set: { right: { fill: 'grey' } } } } })
    const half = compileAsset(hearts, kit('half')).files[0].data as string
    const full = compileAsset(hearts, kit('full')).files[0].data as string
    expect(half).toContain('fill="#8b8d93"')
    expect(full).not.toContain('fill="#8b8d93"')
    expect(right.opts.fill).toBe('red')
  })
})

describe('mistakes, in words', () => {
  it('names an unknown colour and lists the known ones', () => {
    const bad = defineAsset({ name: 'x', kind: '2d', parts: [circle('c', { fill: 'gold-ish' })] })
    expect(() => compileAsset(bad, kit())).toThrow(/Unknown colour "gold-ish"\. Known: white, black/)
  })

  it('says when a part is placed against something defined below it', () => {
    const bad = defineAsset({ name: 'x', kind: '3d', parts: [box('top').on('base'), box('base')] })
    expect(() => compileAsset(bad, kit())).toThrow('"top" is placed against "base", which isn\'t defined above it')
  })

  it('says when a clip moves a part that does not exist', () => {
    const bad = defineAsset({ name: 'x', kind: '3d', parts: [box('a')], animations: { go: [motion('b').bobs()] } })
    expect(() => compileAsset(bad, kit())).toThrow('clip "go" moves "b", which isn\'t a part')
  })
})
