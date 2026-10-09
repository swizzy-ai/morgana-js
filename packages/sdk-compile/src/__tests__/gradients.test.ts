/**
 * Gradient registry guard — store once, apply like a color.
 *
 * The gap this locks in: gradients only worked as raw CSS strings pasted
 * into `bg`, with no storage, no names, and no stock library. Named
 * gradients now resolve through make() and bg on both lanes, validated at
 * define time.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearGradients,
  defineGradient,
  gradientToCss,
  hasGradient,
  resolveGradient,
  validateGradientSpec,
} from '../compile-ctx/tokens/gradients'
import { resolveMakeToken } from '../compile-ctx/tokens/index'

beforeEach(() => clearGradients())

describe('validateGradientSpec', () => {
  it('accepts a well-formed spec', () => {
    expect(
      validateGradientSpec({ type: 'linear', angle: 90, stops: [{ color: '#fff' }, { color: 'red', at: 100 }] }),
    ).toBeNull()
  })

  it('rejects garbage with reasons', () => {
    expect(validateGradientSpec(null)).toContain('object')
    expect(validateGradientSpec({ type: 'swirl', stops: [{ color: 'red' }, { color: 'blue' }] })).toContain('linear, radial or conic')
    expect(validateGradientSpec({ type: 'linear', stops: [{ color: 'red' }] })).toContain('at least 2')
    expect(validateGradientSpec({ type: 'linear', stops: [{ color: '' }, { color: 'blue' }] })).toContain('no usable color')
  })
})

describe('gradientToCss', () => {
  it('builds all three types', () => {
    expect(gradientToCss({ type: 'linear', stops: [{ color: 'red' }, { color: 'blue' }] })).toBe(
      'linear-gradient(135deg, red 0%, blue 100%)',
    )
    expect(gradientToCss({ type: 'linear', angle: 90, stops: [{ color: 'red', at: 10 }, { color: 'blue', at: 90 }] })).toBe(
      'linear-gradient(90deg, red 10%, blue 90%)',
    )
    expect(gradientToCss({ type: 'radial', stops: [{ color: 'red' }, { color: 'blue' }] })).toContain('radial-gradient(circle,')
    expect(gradientToCss({ type: 'conic', stops: [{ color: 'red' }, { color: 'blue' }] })).toContain('conic-gradient(')
  })

  it('passes raw strings through', () => {
    expect(gradientToCss('linear-gradient(red, blue)')).toBe('linear-gradient(red, blue)')
  })
})

describe('registry + make()', () => {
  it('defines, resolves, and rejects unknown names', () => {
    defineGradient('sunset', { type: 'linear', stops: [{ color: '#F59E0B' }, { color: '#EC4899' }] })
    expect(hasGradient('sunset')).toBe(true)
    expect(hasGradient('SUNSET')).toBe(true)
    expect(resolveGradient('sunset')).toContain('linear-gradient')
    expect(resolveGradient('nope')).toBeNull()
  })

  it('throws on invalid specs, never stores garbage', () => {
    expect(() => defineGradient('bad', { type: 'linear', stops: [{ color: 'red' }] } as never)).toThrow(/at least 2/)
    expect(hasGradient('bad')).toBe(false)
  })

  it('make() resolves gradient: and bare registered names to bg', () => {
    defineGradient('sunset', { type: 'linear', stops: [{ color: 'red' }, { color: 'blue' }] })
    expect(resolveMakeToken('box', 'gradient:sunset')).toEqual({ bg: 'linear-gradient(135deg, red 0%, blue 100%)' })
    expect(resolveMakeToken('box', 'sunset')).toEqual({ bg: 'linear-gradient(135deg, red 0%, blue 100%)' })
    expect(resolveMakeToken('box', 'gradient:missing')).toEqual({})
  })
})
