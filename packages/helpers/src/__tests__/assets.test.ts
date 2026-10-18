import { describe, expect, it } from 'vitest'
import { asset, helpers } from '../index'

/** Enough of a compile ctx for create.*: every creator records its props. */
function fakeCtx() {
  const made: Array<{ kind: string; props: Record<string, unknown> }> = []
  const ui = new Proxy({ pages: { create: () => ({}) } } as Record<string, unknown>, {
    get: (t, kind: string) => kind in t ? t[kind] : (props: Record<string, unknown>) => { made.push({ kind, props }); return { id: props.id, setProps: () => undefined } },
  })
  return { ctx: { ui } as never, made }
}

describe('asset references', () => {
  it('writes the reference string the compiler resolves', () => {
    expect(asset('coin')).toBe('asset:coin')
    expect(asset('coin', { clip: 'spin' })).toBe('asset:coin#clip:spin')
    expect(asset('heart', { variant: 'half' })).toBe('asset:heart@half')
    expect(asset('heart', { variant: 'full', clip: 'beat' })).toBe('asset:heart@full#clip:beat')
    expect(asset('chest', { file: 'model' })).toBe('asset:chest#model')
  })

  it('refuses a name that could not be an asset, and an ambiguous pick', () => {
    expect(() => asset('my coin')).toThrow('an asset name is letters, digits and dashes')
    expect(() => asset('coin', { clip: 'spin', file: 'sheet' })).toThrow('pick a clip or a file, not both')
  })
})

describe('create.sprite', () => {
  it('makes an image of a built asset, sized in pixels by word', () => {
    const { ctx, made } = fakeCtx()
    const { create } = helpers(ctx)
    create.sprite('hud-heart', 'heart', { variant: 'half', size: 'small' })
    expect(made).toEqual([{ kind: 'image', props: { id: 'hud-heart', src: 'asset:heart@half', alt: 'heart', width: '64px', height: '64px' } }])
  })

  it('takes a clip, a pixel number and its own description', () => {
    const { ctx, made } = fakeCtx()
    helpers(ctx).create.sprite('c', 'coin', { clip: 'spin', size: 100, alt: 'A spinning coin' })
    expect(made[0].props).toMatchObject({ src: 'asset:coin#clip:spin', alt: 'A spinning coin', width: '100px' })
  })

  it('names the sizes when given one it does not know', () => {
    const { ctx } = fakeCtx()
    expect(() => helpers(ctx).create.sprite('c', 'coin', { size: 'giant' as never })).toThrow('is not one of tiny, small, medium, large, huge')
  })
})
