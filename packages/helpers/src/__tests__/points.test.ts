import { describe, expect, it } from 'vitest'
import { Make } from '../make'
import { Theme } from '../theme'
import { makeAnimate } from '../animate'
import { duration } from '../time'
import { length, radius, space } from '../words'

/** A handle that remembers the props it was given. */
function handle() {
  const props: Record<string, unknown> = {}
  const played: unknown[] = []
  const h = {
    props,
    played,
    setProps(p: Record<string, unknown>) { Object.assign(props, p) },
    get(k: string) { return props[k] },
    animate: { to: (k: unknown, o: unknown) => { played.push({ k, o }); return Promise.resolve() } },
  }
  return h
}

describe('helpers — old words mean what they always meant', () => {
  it('keeps every size word, number and raw CSS value', () => {
    expect(space('medium')).toBe(4)
    expect(space(3)).toBe(3)
    expect(space('12px')).toBe('12px')
    expect(length('large')).toBe(180)
    expect(length('full')).toBe('stretch')
    expect(length('50%')).toBe('50%')
    expect(radius('large')).toBe('lg')
    expect(radius(6)).toBe(6)
    expect(duration('slow')).toBe(700)
    expect(duration('2s')).toBe(2000)
    expect(duration('half a second')).toBe(500)
    expect(duration(400)).toBe(400)
  })
})

describe('helpers — points', () => {
  it('reads points in spacing, sizes and corners with the standard basis', () => {
    expect(space('2 points')).toBe('16px')
    expect(space('a little')).toBe('16px')
    expect(length('10 points')).toBe('80px')
    expect(radius('half a point')).toBe('4px')
  })

  it('reads points of time', () => {
    expect(duration('4 points')).toBe(400)
    expect(duration('a little')).toBe(200)
    expect(() => duration('2 bananas')).toThrow(/points \('4 points'\)/)
  })

  it('make() uses the theme basis', () => {
    const h = handle()
    const look = new Theme('tight').points({ distance: '4px', words: { 'a little': 3 } })
    new Make(h as never, look).padding('2 points').spaced('a little').rounded('1 point').width('20 points').size('4 points')
    expect(h.props).toMatchObject({ pad: '8px', gap: '12px', radius: '4px', width: '80px', fontSize: '16px' })
  })

  it('make() keeps old words under a theme basis', () => {
    const h = handle()
    new Make(h as never, new Theme('tight').points({ distance: '4px' })).padding('large').rounded()
    expect(h.props).toMatchObject({ pad: 6, radius: 'md' })
  })

  it('text points follow their own basis when the theme sets one', () => {
    const h = handle()
    new Make(h as never, new Theme('t').points({ text: '2px' })).size('8 points')
    expect(h.props.fontSize).toBe('16px')
  })

  it('a theme refuses a basis in the wrong unit, saying why', () => {
    expect(() => new Theme('t').points({ turns: '4px' })).toThrow(/measured in degrees/)
  })

  it('animate.move travels by points, px and size words, timed in points', async () => {
    const h = handle()
    const look = new Theme('t').points({ distance: '4px' })
    const animate = makeAnimate({ find: () => h as never, inBrowser: () => true, points: look.pointsReader })
    await animate.move('box').left('2 points').up('14px').right('small').for('3 points').now()
    const last = h.played.at(-1) as { k: Keyframe[]; o: { duration: number } }
    expect(last.k[1]).toEqual({ transform: 'translate(0px, -14px)' })   // -8 + 8 across, 14 up
    expect(last.o.duration).toBe(300)
  })
})
