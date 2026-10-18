import { describe, expect, it } from 'vitest'
import { points } from '../points'

const p = points()

describe('points — the standard basis', () => {
  it('counts points in every kind', () => {
    expect(p.read('2 points', 'distance')).toBe(16)
    expect(p.read('2 points', 'turns')).toBe(2)
    expect(p.read('3 points', 'size')).toBe(15)
    expect(p.read('4 points', 'time')).toBe(400)
    expect(p.read('6 points', 'opacity')).toBe(30)
    expect(p.read('3 points', 'volume')).toBe(3)
    expect(p.read('2 points', 'pitch')).toBe(2)
    expect(p.read('5 points', 'world')).toBe(0.5)
  })

  it('takes decimals, fractions and number words', () => {
    expect(p.read('1.5 points', 'distance')).toBe(12)
    expect(p.read('0.25 points', 'distance')).toBe(2)
    expect(p.read('half a point', 'distance')).toBe(4)
    expect(p.read('a point', 'distance')).toBe(8)
    expect(p.read('two points', 'distance')).toBe(16)
    expect(p.read('one and a half points', 'distance')).toBe(12)
    expect(p.read('2pt', 'distance')).toBe(16)
    expect(p.read(2.5, 'distance')).toBe(20)
  })

  it('reads the amount words as points, and counts hairs', () => {
    expect(p.read('a hair', 'distance')).toBe(8)
    expect(p.read('a little', 'distance')).toBe(16)
    expect(p.read('a bit', 'distance')).toBe(32)
    expect(p.read('a lot', 'distance')).toBe(64)
    expect(p.read('far', 'distance')).toBe(128)
    expect(p.read('2 hairs', 'distance')).toBe(16)
    expect(p.read('ten hairs', 'turns')).toBe(10)
    expect(p.read('a little', 'turns')).toBe(2)
  })

  it('reads exact units for the kind', () => {
    expect(p.read('14px', 'distance')).toBe(14)
    expect(p.read('5 degrees', 'turns')).toBe(5)
    expect(p.read('a quarter turn', 'turns')).toBe(90)
    expect(p.read('0.4s', 'time')).toBe(400)
    expect(p.read('300ms', 'time')).toBe(300)
    expect(p.read('half a second', 'time')).toBe(500)
    expect(p.read('30%', 'opacity')).toBe(30)
    expect(p.read('3 dB', 'volume')).toBe(3)
    expect(p.read('an octave', 'pitch')).toBe(12)
    expect(p.read('50cm', 'world')).toBe(0.5)
  })

  it('refuses a unit that does not fit the kind, saying what does', () => {
    expect(() => p.read('4px', 'turns')).toThrow(/measured in degrees or turns/)
    expect(() => p.read('30%', 'time')).toThrow(/seconds, milliseconds or beats/)
  })

  it('refuses what it cannot read, listing what it accepts', () => {
    expect(() => p.read('2 bananas', 'distance')).toThrow(/I can't read "2 bananas" as a distance\. Say points/)
    expect(() => p.read('seconds', 'time')).toThrow(/can't read/)
  })

  it('explains what an amount became', () => {
    expect(p.explain('a little', 'distance').how).toBe('"a little" = 2 points = 16px')
    expect(p.explain('2 points', 'turns').how).toBe('2 points = 2deg')
    expect(p.explain('2 hairs', 'distance').points).toBe(2)
  })

  it('gives CSS', () => {
    expect(p.css('2 points', 'distance')).toBe('16px')
    expect(p.css('a little', 'turns')).toBe('2deg')
    expect(p.css('4 points', 'time')).toBe('400ms')
  })

  it('tells point amounts from raw units', () => {
    expect(p.isPoints('2 points')).toBe(true)
    expect(p.isPoints('a little')).toBe(true)
    expect(p.isPoints('3 hairs')).toBe(true)
    expect(p.isPoints('14px')).toBe(false)
    expect(p.isPoints('large')).toBe(false)
    expect(p.isPoints(4)).toBe(false)
  })
})

describe('points — changing the basis', () => {
  it('sets one kind and leaves the rest standard', () => {
    const q = points({ basis: { distance: '4px', turns: '5 degrees' } })
    expect(q.read('2 points', 'distance')).toBe(8)
    expect(q.read('a little', 'distance')).toBe(8)
    expect(q.read('2 points', 'turns')).toBe(10)
    expect(q.read('2 points', 'time')).toBe(200)
  })

  it('text follows distance unless it has its own basis', () => {
    expect(points({ basis: { distance: '4px' } }).read('6 points', 'text')).toBe(24)
    expect(points({ basis: { distance: '4px', text: '2px' } }).read('6 points', 'text')).toBe(12)
  })

  it('refuses a basis in the wrong unit or for an unknown kind', () => {
    expect(() => points({ basis: { turns: '4px' } }).read('1 point', 'turns')).toThrow(/measured in degrees/)
    expect(() => points({ basis: { wobble: '1px' } as never })).toThrow(/no point basis for "wobble"/)
    expect(() => points({ basis: { distance: '0px' } }).read('1 point', 'distance')).toThrow(/more than zero/)
  })

  it('layers a file over a project', () => {
    const project = points({ basis: { distance: '4px' } })
    const file = project.with({ basis: { turns: '2 degrees' } })
    expect(file.read('1 point', 'distance')).toBe(4)
    expect(file.read('1 point', 'turns')).toBe(2)
    expect(file.basis('turns')).toEqual({ value: 2, unit: 'deg', set: true })
    expect(file.basis('time')).toEqual({ value: 100, unit: 'ms', set: false })
  })

  it('retunes words as points or as exact amounts', () => {
    const q = points({ words: { 'a little': 3, 'A Lot': '100px' } })
    expect(q.read('a little', 'distance')).toBe(24)
    expect(q.read('a lot', 'distance')).toBe(100)
    expect(points({ words: { 'a hair': 1.5 } }).read('2 hairs', 'distance')).toBe(24)
  })
})

describe('points — frames and tempo', () => {
  it('scales px on a 1080 frame, unless exact', () => {
    const uhd = points({ frame: { width: 3840, height: 2160 } })
    expect(uhd.read('2 points', 'distance')).toBe(32)
    expect(uhd.read('14px', 'distance')).toBe(28)
    expect(points({ frame: { width: 1080, height: 1920 } }).read('2 points', 'distance')).toBe(16)
    expect(points({ frame: { width: 3840, height: 2160 }, exact: true }).read('14px', 'distance')).toBe(14)
  })

  it('reads beats with a tempo, and makes a time point ⅛ beat', () => {
    const song = points({ tempo: 120 })
    expect(song.read('2 beats', 'time')).toBe(1000)
    expect(song.read('4 points', 'time')).toBe(250)
    expect(() => p.read('2 beats', 'time')).toThrow(/no tempo/)
  })
})

describe('points — comparatives', () => {
  it('steps along the doubling ladder', () => {
    expect(p.step(2, 'a bit more')).toBe(4)
    expect(p.step(2, 'more')).toBe(4)
    expect(p.step(2, 'much more')).toBe(8)
    expect(p.step(4, 'a little less')).toBe(2)
    expect(p.step(8, 'much less')).toBe(2)
    expect(p.step(3, 'twice as far')).toBe(6)
    expect(p.step(3, 'half as much')).toBe(1.5)
    expect(p.step(2, '3 times as much')).toBe(6)
    expect(() => p.step(2, 'sideways')).toThrow(/can't read "sideways" as a change/)
  })
})

describe('points — telling amounts apart', () => {
  it('classifies points, units and comparatives', () => {
    expect(p.classify('2 points')).toBe('points')
    expect(p.classify('a little')).toBe('points')
    expect(p.classify('14px')).toBe('unit')
    expect(p.classify('2 beats')).toBe('unit')
    expect(p.classify('a quarter turn')).toBe('unit')
    expect(p.classify('a bit more')).toBe('comparative')
    expect(p.classify('twice as far')).toBe('comparative')
    expect(p.classify('save')).toBeUndefined()
    expect(p.classify('m')).toBeUndefined()
  })
})
