// `morgana demo`: scenes from the storyboard, how long scenes run, and the formats.
import { describe, expect, it } from 'vitest'
import { FORMATS, resolveScene, sceneSeconds } from '../demo.mjs'

const storyboard = [
  { title: 'Pick', address: '/', state: { view: 'pick' } },
  { title: 'Fix my CV: working', address: '/', state: { view: 'work', build: 'running' } },
]

describe('morgana demo', () => {
  it('takes a storyboard screen’s address and state, and keeps the scene’s own words', () => {
    expect(resolveScene({ storyboard: 'fix my cv: working', seconds: 3, caption: 'It rewrites', state: { build: 'done' } }, storyboard)).toEqual({
      title: 'Fix my CV: working', storyboard: 'fix my cv: working', seconds: 3, caption: 'It rewrites', path: '/', state: { view: 'work', build: 'done' },
    })
    expect(resolveScene({ path: '/x' }, storyboard)).toEqual({ path: '/x' })
    expect(() => resolveScene({ storyboard: 'Nope' }, storyboard)).toThrow(/No storyboard screen called "Nope"/)
  })

  it('runs a scene its seconds, or long enough for its steps and a beat after', () => {
    expect(sceneSeconds({})).toBe(3)
    expect(sceneSeconds({ seconds: 2 })).toBe(2)
    expect(sceneSeconds({ seconds: 1, do: [{ wait: 2 }] })).toBe(3)
    // Typing takes its time: 40 characters ≈ 0.4 s + 1.8 s, then a beat.
    expect(sceneSeconds({ seconds: 1, do: [{ type: ['box', 'x'.repeat(40)] }] })).toBeCloseTo(3.2, 1)
  })

  it('offers the sizes social video wants, in full pixels', () => {
    for (const f of Object.values(FORMATS)) expect([f.css[0] * f.scale, f.css[1] * f.scale]).toEqual([f.width, f.height])
    expect(FORMATS['9:16']).toMatchObject({ width: 1080, height: 1920 })
  })
})
