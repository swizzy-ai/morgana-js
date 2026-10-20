import { describe, expect, it } from 'vitest'
import { compileWorld, makeWorld, readWorld, vocabulary } from '../index'

const words = 'a choppy ocean at golden hour, with two rocky islands to the north. low mist.'

describe('world from words', () => {
  it('reads the sentence into an ocean, a sky, two islands, mist and a camera', () => {
    const r = readWorld(words)
    expect(r.spec.nodes.map((n) => n.id)).toEqual(['ocean', 'sky', 'island-1', 'island-2', 'mist', 'camera'])
    expect(r.spec.nodes.find((n) => n.id === 'sky')!.words).toEqual(['golden hour'])
    expect(r.unknown).toEqual([])
  })

  it('sets handles exactly from `node.path = value` lines, and names the ones that don’t exist', () => {
    const r = readWorld(`${words}\nisland-2.cliffs.height = 0.9\nsky.sun.elevation = 4..9\nstyle.warmth = 0.6\nwhale.size = 3`)
    expect(r.spec.nodes.find((n) => n.id === 'island-2')!.ask).toEqual({ cliffs: { height: 0.9 } })
    expect(r.spec.nodes.find((n) => n.id === 'sky')!.ask).toEqual({ sun: { elevation: [4, 9] } })
    expect(r.spec.style?.ask).toEqual({ warmth: 0.6 })
    expect(r.unknown[0]).toMatch(/^whale/)
    const w = makeWorld(`${words}\nisland-2.cliffs.height = 0.9`, { seed: 's' })
    expect((w.piece.nodes.find((n) => n.id === 'island-2')!.values.cliffs as { height: number }).height).toBe(0.9)
  })

  it('makes the same world from the same seed, and different ones without', () => {
    expect(makeWorld(words, { seed: 'kept' }).scene).toEqual(makeWorld(words, { seed: 'kept' }).scene)
    const a = makeWorld(words)
    const b = makeWorld(words, { earlier: [a.fingerprint] })
    expect(b.nearest).toBeGreaterThanOrEqual(0.12)
  })

  it('keeps every island inside the frame: tall ones are pushed back for the lens', () => {
    const w = makeWorld(`${words}\nisland-1.height.peak = 800\nisland-1.place.distance = 300\ncamera.lens = 40`, { seed: 'tall' })
    const [x, z] = w.scene.uniforms.find(([n]) => n === 'uIA')![2] as number[]
    const d = Math.hypot(x!, z!)
    expect(800 / (d - 0)).toBeLessThan(Math.tan((40 * 0.5 * 0.8 * Math.PI) / 180) + 0.01)
  })

  it('fits in one HTML file well under 64 KB', () => {
    expect(makeWorld(words, { seed: 'x' }).html().length).toBeLessThan(40 * 1024)
  })

  it('compiles every island to the shader, up to four', () => {
    const w = makeWorld('an ocean with four islands', { seed: 'four' })
    expect(w.scene.uniforms.find(([n]) => n === 'uIslands')![2]).toBe(4)
    expect(compileWorld(w.piece).uniforms.length).toBe(w.scene.uniforms.length)
  })

  it('publishes its words and handles as data', () => {
    const v = vocabulary()
    expect(v.generators.map((g) => g.kind)).toEqual(['ocean', 'sky', 'island', 'mist', 'camera'])
    expect(v.generators.find((g) => g.kind === 'island')!.words).toContain('volcanic')
  })
})
