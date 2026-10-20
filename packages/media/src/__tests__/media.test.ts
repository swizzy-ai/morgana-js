import { describe, expect, it } from 'vitest'
import { choice, colour, distance, fingerprint, group, num, resolve, resolveDistinct } from '../index'

const sea = {
  waves: group('waves', { height: num(0, 4, 1, { unit: 'm' }), length: num(5, 80, 25) }),
  tint: colour('#1d5c6e'),
  mood: choice(['calm', 'wild'] as const, 'calm'),
}

describe('handles', () => {
  it('draws the same values from the same seed, and keeps asks', () => {
    const a = resolve(sea, { waves: { height: 2 } }, 'seed-1')
    expect(resolve(sea, { waves: { height: 2 } }, 'seed-1')).toEqual(a)
    expect((a.values.waves as { height: number }).height).toBe(2)
    expect(a.asked).toEqual(['waves.height'])
  })

  it('draws unasked values inside their range, and differently per seed', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 40; i++) {
      const v = (resolve(sea, {}, `s${i}`).values.waves as { length: number }).length
      expect(v).toBeGreaterThanOrEqual(5)
      expect(v).toBeLessThanOrEqual(80)
      seen.add(Math.round(v))
    }
    expect(seen.size).toBeGreaterThan(15)
  })

  it('a range asks for somewhere inside it', () => {
    for (let i = 0; i < 20; i++) {
      const h = (resolve(sea, { waves: { height: [1.2, 2.5] } }, `r${i}`).values.waves as { height: number }).height
      expect(h).toBeGreaterThanOrEqual(1.2)
      expect(h).toBeLessThanOrEqual(2.5)
    }
  })

  it('adding a handle doesn’t change the others', () => {
    const before = resolve(sea, {}, 'stable').values
    const after = resolve({ ...sea, foam: num(0, 1, 0.3) }, {}, 'stable').values
    expect(after.waves).toEqual(before.waves)
    expect(after.tint).toEqual(before.tint)
  })
})

describe('no two alike', () => {
  it('a pinned seed makes the same props; a new seed different ones', () => {
    const a = resolve(sea, {}, 'pinned').values
    expect(resolve(sea, {}, 'pinned').values).toEqual(a)
    const b = resolve(sea, {}, 'other').values
    expect(distance(fingerprint(sea, a), fingerprint(sea, b))).toBeGreaterThan(0.03)
  })

  it('draws again until the props are far enough from earlier ones', () => {
    const earlier = [fingerprint(sea, resolve(sea, {}, 'x').values)]
    const d = resolveDistinct(sea, {}, earlier, { min: 0.1 })
    expect(d.nearest).toBeGreaterThanOrEqual(0.1)
  })

  it('a pinned seed is kept even if it is close to an earlier draw', () => {
    const d = resolveDistinct(sea, {}, [fingerprint(sea, resolve(sea, {}, 'x').values)], { seed: 'x' })
    expect(d.seed).toBe('x')
    expect(d.nearest).toBe(0)
  })
})
