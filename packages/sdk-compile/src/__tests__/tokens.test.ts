/**
 * Token + resolver coverage.
 *
 * Two guarantees, both of which previously failed silently:
 *   1. Every word in the SDK's `MakeToken` union resolves to real props.
 *   2. An unresolved word is an error, not a `{ token: v }` no-op.
 */
import { describe, expect, it } from 'vitest';
import { resolveMakeToken, resolveMakeTokenDetailed, animationKeyframes, animationClasses } from '../compile-ctx/tokens';
import { MakeToken } from '@morgana/sdk';

/** Every bare word in the SDK's MakeToken union (sdk/src/handles.ts:198-216). */
const DECLARED_WORDS = [
  'round', 'rounded', 'circle', 'pill', 'sharp', 'square', 'soft', 'softer', 'softest', 'tiny', 'chunky',
  'fullParentWidth', 'full-width', 'fullwidth', 'fullWidth', 'full', 'half', 'halfWidth', 'auto',
  'hugContent', 'hug-content', 'hugcontent', 'hug', 'fullHeight', 'third', 'threeQuarters',
  'glass', 'glass-card', 'glassCard', 'dark-glass', 'darkGlass', 'dark', 'card', 'panel', 'muted',
  'brand', 'accent', 'neutral', 'primary', 'secondary', 'danger', 'success', 'panel-elevated', 'elevated',
  'glow', 'glow-brand', 'glow-success', 'glow-danger', 'glow-accent', 'raised', 'shadow', 'inner', 'flat',
  'floating', 'bubbly', 'inset',
  'h1', 'h2', 'h3', 'body-lg', 'bodyLarge', 'body-sm', 'bodySmall', 'body-me', 'body', 'mono',
  'display', 'display-lg', 'caption', 'headline', 'title', 'subtitle',
  'row', 'column', 'col', 'horizontal', 'vertical', 'stacked',
  'padded', 'roomy', 'spacious', 'airy', 'compact', 'tight', 'gap',
  'centered', 'centre', 'middle', 'left', 'right', 'center',
  'bold', 'semibold', 'light', 'italic', 'underlined', 'underline', 'hidden', 'invisible', 'visible',
  'uppercased', 'lowercase', 'backgroundless',
  'draggable', 'expandable', 'tappable', 'clickable',
  'fade-in', 'fade-out', 'slide-up', 'slide-down', 'scale-in', 'scale-out', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy',
  'spa',
] as const satisfies readonly MakeToken[]

describe('make() token vocabulary', () => {
  it('every declared bare word resolves to at least one prop', () => {
    const unresolved = DECLARED_WORDS.filter((w) => !resolveMakeTokenDetailed('box', w).resolved)
    expect(unresolved, 'these words are declared in MakeToken but resolve to nothing').toEqual([])
  })

  it('an unresolved word yields no props rather than a junk token prop', () => {
    const r = resolveMakeTokenDetailed('box', 'not-a-real-token')
    expect(r.resolved).toBe(false)
    expect(r.props).toEqual({})
  })

  it('centered sets both axes, as the SDK documents', () => {
    // handles.ts:210 claims make('centered') "sets several props at once".
    expect(resolveMakeToken('box', 'centered')).toEqual({ align: 'center', justify: 'center' })
  })

  it('sizing words set width or height', () => {
    expect(resolveMakeToken('box', 'fullWidth')).toEqual({ width: '100%' })
    expect(resolveMakeToken('box', 'fullHeight')).toEqual({ height: '100%' })
    expect(resolveMakeToken('box', 'hugContent')).toEqual({ width: 'auto' })
  })

  it('alignment words use canonical AlignToken / JustifyToken values', () => {
    // left/right are themselves AlignTokens; middle is not, so it maps to center.
    expect(resolveMakeToken('box', 'left')).toEqual({ align: 'left' })
    expect(resolveMakeToken('box', 'right')).toEqual({ align: 'right' })
    expect(resolveMakeToken('box', 'middle')).toEqual({ align: 'center' })
    for (const w of ['centered', 'centre', 'left', 'right', 'middle']) {
      const props = resolveMakeToken('box', w)
      for (const key of ['align', 'justify']) {
        if (typeof props[key] === 'string') {
          expect(['start', 'center', 'end', 'stretch', 'baseline', 'left', 'right', 'between', 'around', 'evenly'], `${w}.${key}=${props[key]}`).toContain(props[key])
        }
      }
    }
  })

  it('radius words resolve to real radius tokens', () => {
    expect(resolveMakeToken('box', 'round')).toEqual({ radius: 'lg' })
    expect(resolveMakeToken('box', 'circle')).toEqual({ radius: 'full' })
    expect(resolveMakeToken('box', 'sharp')).toEqual({ radius: 'none' })
  })

  it('typography words set props the stylesheet reads', () => {
    expect(resolveMakeToken('text', 'bold')).toEqual({ fontWeight: 700 })
    expect(resolveMakeToken('text', 'italic')).toEqual({ fontStyle: 'italic' })
    expect(resolveMakeToken('text', 'uppercased')).toEqual({ textTransform: 'uppercase' })
  })

  it('visibility words set the visibility prop', () => {
    expect(resolveMakeToken('box', 'hidden')).toEqual({ visibility: 'hidden' })
    expect(resolveMakeToken('box', 'visible')).toEqual({ visibility: 'visible' })
  })

  it('spacing words set pad or gap', () => {
    expect(resolveMakeToken('box', 'padded')).toEqual({ pad: 4 })
    expect(resolveMakeToken('box', 'gap')).toEqual({ gap: 4 })
  })

  it('glass variants resolve to real surface tokens', () => {
    expect(resolveMakeToken('box', 'glassCard')).toEqual({ surface: 'glass-card' })
    expect(resolveMakeToken('box', 'darkGlass')).toEqual({ surface: 'dark-glass' })
  })

  it('backgroundless flattens rather than inventing a surface', () => {
    expect(resolveMakeToken('box', 'backgroundless')).toEqual({ effect: 'flat' })
  })

  it('behavior words set a behavior prop', () => {
    for (const w of ['draggable', 'expandable', 'tappable', 'clickable']) {
      expect(resolveMakeToken('box', w), w).toEqual({ behavior: w })
    }
  })

  it('animation words set an animate prop', () => {
    for (const w of ['fade-in', 'slide-up', 'pulse', 'bounce', 'spin', 'bouncy']) {
      expect(resolveMakeToken('box', w), w).toEqual({ animate: w })
    }
  })

  it('spa is a page-shell marker', () => {
    expect(resolveMakeToken('page', 'spa')).toEqual({ spa: true })
  })

  it('color tokens route to bg, or to color for text-like kinds', () => {
    expect(resolveMakeToken('box', 'red')).toEqual({ bg: 'red' })
    expect(resolveMakeToken('text', 'red')).toEqual({ color: 'red' })
  })
});

describe('animation emission', () => {
  it('every animation word has keyframes', () => {
    const kf = animationKeyframes()
    for (const w of ['fade_in', 'fade_out', 'slide_up', 'slide_down', 'scale_in', 'scale_out', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy']) {
      expect(kf, w).toContain(`@keyframes morgana-${w}`)
    }
  })

  it('every animation word has a class rule', () => {
    const classes = animationClasses()
    for (const w of ['fade-in', 'slide-up', 'pulse', 'bounce', 'spin', 'bouncy']) {
      const key = `morgana-anim-${w.replace(/-/g, '_')}`
      expect(classes[key], w).toBeTruthy()
    }
  })

  it('the skeleton keyframe is emitted', () => {
    expect(animationKeyframes()).toContain('@keyframes morgana-skeleton')
  })
})

describe('make() emits the class rules and keyframes into the stylesheet', () => {
  it('an animated object produces both a class rule and its keyframes', async () => {
    const { renderStyleCss } = await import('../style/sheet')
    const { createEmptyIR } = await import('../ir')
    const ir = createEmptyIR()
    ir.objects.set('o1', {
      id: 'o1', kind: 'box', props: { animate: 'fade-in' }, children: [],
      parentId: null, contentTemplateId: null, bindings: [], breakpointProps: {}, tracked: [], inlineWhens: [],
    })
    const css = renderStyleCss(ir)
    expect(css).toContain('.morgana-anim-fade_in{')
    expect(css).toContain('@keyframes morgana-fade_in')
  })

  it('a behavior word produces its class rule', async () => {
    const { renderStyleCss } = await import('../style/sheet')
    const { createEmptyIR } = await import('../ir')
    const ir = createEmptyIR()
    ir.objects.set('o1', {
      id: 'o1', kind: 'box', props: { behavior: 'clickable' }, children: [],
      parentId: null, contentTemplateId: null, bindings: [], breakpointProps: {}, tracked: [], inlineWhens: [],
    })
    expect(renderStyleCss(ir)).toContain('.morgana-bh-clickable{cursor:pointer}')
  })
})
