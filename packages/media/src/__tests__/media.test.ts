import { describe, expect, it } from 'vitest'
import { choice, colour, defineGenerator, distance, fingerprint, group, num, readWords, resolve, resolveDistinct, resolvePiece } from '../index'

const sea = defineGenerator({
  kind: 'sea',
  nouns: ['sea', 'ocean'],
  doc: 'test sea',
  handles: {
    waves: group('waves', { height: num(0, 4, 1, { unit: 'm' }), length: num(5, 80, 25) }),
    tint: colour('#1d5c6e'),
    mood: choice(['calm', 'wild'] as const, 'calm'),
  },
  words: { choppy: { waves: { height: [1.2, 2.5] } }, glassy: { waves: { height: [0, 0.2] } } },
})
const isle = defineGenerator({
  kind: 'isle', nouns: ['isle', 'island', 'islands'], doc: 'test island', max: 4,
  handles: { size: num(50, 900, 300), bearing: num(0, 360, 0) },
  words: { rocky: { size: [100, 300] }, 'to the north': { bearing: [-25, 25] } },
})

describe('handles', () => {
  it('draws the same values from the same seed, and keeps asks', () => {
    const a = resolve(sea.handles, { waves: { height: 2 } }, 'seed-1')
    expect(resolve(sea.handles, { waves: { height: 2 } }, 'seed-1')).toEqual(a)
    expect((a.values.waves as { height: number }).height).toBe(2)
    expect(a.asked).toEqual(['waves.height'])
  })

  it('draws unasked values inside their range, and differently per seed', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 40; i++) {
      const v = (resolve(sea.handles, {}, `s${i}`).values.waves as { length: number }).length
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThanOrEqual(80)
      seen.add(Math.round(v))
    }
    expect(seen.size).toBeGreaterThan(15)
  })

  it('a range asks for somewhere inside it', () => {
    for (let i = 0; i < 20; i++) {
      const h = (resolve(sea.handles, { waves: { height: [1.2, 2.5] } }, `r${i}`).values.waves as { height: number }).height
      expect(h).toBeGreaterThanOrEqual(1.2)
      expect(h).toBeLessThanOrEqual(2.5)
    }
  })

  it('adding a handle doesn’t change the others', () => {
    const before = resolve(sea.handles, {}, 'stable').values
    const after = resolve({ ...sea.handles, foam: num(0, 1, 0.3) }, {}, 'stable').values
    expect(after.waves).toEqual(before.waves)
    expect(after.tint).toEqual(before.tint)
  })
})

describe('words', () => {
  it('reads a sentence into nodes with their words, and counts', () => {
    const r = readWords('a choppy ocean, with two rocky islands to the north. moody', [sea, isle])
    expect(r.nodes.map((n) => [n.id, n.words])).toEqual([
      ['sea', ['choppy']],
      ['isle-1', ['to the north', 'rocky']],
      ['isle-2', ['to the north', 'rocky']],
    ])
    expect(r.style).toEqual(['moody'])
    expect(r.unknown).toEqual([])
  })

  it('names the words it doesn’t know', () => {
    expect(readWords('a glassy sea with sparkly dolphins', [sea, isle]).unknown).toEqual(['sparkly', 'dolphins'])
  })
})

describe('no two alike', () => {
  const spec = { name: 't', medium: 'world' as const, nodes: [{ id: 'sea', kind: 'sea', words: ['choppy'] }, { id: 'i1', kind: 'isle', words: ['rocky'] }] }

  it('a pinned seed makes the same piece; a new seed a different one', () => {
    const a = resolvePiece({ ...spec, seed: 'pinned' }, [sea, isle])
    expect(resolvePiece({ ...spec, seed: 'pinned' }, [sea, isle]).nodes).toEqual(a.nodes)
    const b = resolvePiece({ ...spec, seed: 'other' }, [sea, isle])
    expect(distance(fingerprint(a, [sea, isle]), fingerprint(b, [sea, isle]))).toBeGreaterThan(0.03)
  })

  it('draws again until the piece is far enough from earlier ones', () => {
    const earlier = [fingerprint(resolvePiece({ ...spec, seed: 'x' }, [sea, isle]), [sea, isle])]
    const d = resolveDistinct({ ...spec }, [sea, isle], earlier, { min: 0.1 })
    expect(d.nearest).toBeGreaterThanOrEqual(0.1)
  })
})
