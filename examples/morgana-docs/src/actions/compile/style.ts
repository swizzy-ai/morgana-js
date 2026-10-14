import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell, placeView } from '../../nav'

const FONTS = [
  'display', 'display-lg', 'h1', 'h2', 'h3', 'title', 'subtitle',
  'body-lg', 'body', 'body-me', 'body-sm', 'caption', 'mono', 'headline',
]

const COLORS = [
  'red', 'blue', 'green', 'black', 'white',
  'brand', 'accent', 'neutral', 'primary', 'secondary',
  'danger', 'success', 'muted', 'transparent',
  '#5B21B6', '#B91C1C', '#111827', '#F5F3FF',
]

const EFFECTS = [
  'card', 'glow', 'glow-brand', 'glow-success', 'glow-danger', 'glow-accent',
  'raised', 'shadow', 'inner', 'flat', 'floating', 'bubbly', 'inset',
  'elevated', 'glass-card', 'dark-glass',
]

const ANIMATION_WORDS = [
  'fade-in', 'fade-out', 'slide-up', 'slide-down',
  'scale-in', 'scale-out', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy',
]

/**
 * Style lab — the type scale, the named colors, and every make() word,
 * each rendered live. A swatch that shows nothing is the conformance rig
 * doing its job: the token does not survive to CSS.
 */
export const style = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'style',
      address: 'style',
      title: 'Style lab — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'style', 'Style lab', 'Fonts, colors, and every make() word — each one rendered, not described.')

    // ── Fonts ──
    {
      const section = ctx.ui.box({ id: 'd-fonts' })
      section.setProps({ layout: 'col', gap: 2, pad: 5 })
      section.make('card')
      section.place(ctx.ui.text({ id: 'd-fonts-h', content: 'Type scale', font: 'h2' }))
      for (const font of FONTS) {
        const row = ctx.ui.box({ id: `d-font-${font}` })
        row.setProps({ layout: 'row', gap: 3, align: 'center' })
        row.place(ctx.ui.text({ id: `d-font-${font}-name`, content: font, font: 'mono' }))
        row.place(ctx.ui.text({ id: `d-font-${font}-sample`, content: 'The quick brown fox jumps', font } as any))
        section.place(row)
      }
      content.place(section)
    }

    // ── Colors ──
    {
      const section = ctx.ui.box({ id: 'd-colors' })
      section.setProps({ layout: 'col', gap: 2, pad: 5 })
      section.make('card')
      section.place(ctx.ui.text({ id: 'd-colors-h', content: 'Named colors', font: 'h2' }))
      section.place(ctx.ui.text({ id: 'd-colors-p', content: 'Each swatch sets bg to the named color. A white swatch with a dark label means the token never became CSS.', font: 'body' }))
      const grid = ctx.ui.box({ id: 'd-colors-grid' })
      grid.setProps({ layout: 'row', gap: 2, wrap: true })
      for (const color of COLORS) {
        const swatch = ctx.ui.box({ id: `d-color-${color.replace('#', 'hex')}` })
        swatch.setProps({ layout: 'col', align: 'center', justify: 'center', pad: 3, width: '120px', height: '72px', bg: color })
        swatch.place(ctx.ui.text({ id: `d-color-${color.replace('#', 'hex')}-t`, content: color, font: 'caption' }))
        grid.place(swatch)
      }
      section.place(grid)
      content.place(section)
    }

    // ── Effects & surfaces ──
    {
      const section = ctx.ui.box({ id: 'd-effects' })
      section.setProps({ layout: 'col', gap: 2, pad: 5 })
      section.make('card')
      section.place(ctx.ui.text({ id: 'd-effects-h', content: 'make() words', font: 'h2' }))
      const grid = ctx.ui.box({ id: 'd-effects-grid' })
      grid.setProps({ layout: 'row', gap: 2, wrap: true })
      for (const word of EFFECTS) {
        const tile = ctx.ui.box({ id: `d-effect-${word}` })
        tile.setProps({ layout: 'col', align: 'center', justify: 'center', pad: 3, width: '140px', height: '72px', bg: '#FFFFFF' })
        try {
          tile.make(word)
        } catch {
          // An unknown word throws at compile time — that IS the signal.
        }
        tile.place(ctx.ui.text({ id: `d-effect-${word}-t`, content: word, font: 'caption' }))
        grid.place(tile)
      }
      section.place(grid)
      content.place(section)
    }

    // ── Animation words (declarative) ──
    {
      const section = ctx.ui.box({ id: 'd-awords' })
      section.setProps({ layout: 'col', gap: 2, pad: 5 })
      section.make('card')
      section.place(ctx.ui.text({ id: 'd-awords-h', content: 'Animation words', font: 'h2' }))
      section.place(ctx.ui.text({ id: 'd-awords-p', content: 'Declaration-time motion: make() words that bake keyframes into the sheet. They play on load.', font: 'body' }))
      const grid = ctx.ui.box({ id: 'd-awords-grid' })
      grid.setProps({ layout: 'row', gap: 2, wrap: true })
      for (const word of ANIMATION_WORDS) {
        const tile = ctx.ui.box({ id: `d-aword-${word}` })
        tile.setProps({ layout: 'col', align: 'center', justify: 'center', pad: 3, width: '140px', height: '72px', bg: '#F5F3FF' })
        tile.make(word)
        tile.place(ctx.ui.text({ id: `d-aword-${word}-t`, content: word, font: 'caption' }))
        grid.place(tile)
      }
      section.place(grid)
      content.place(section)
    }

    // ── Gradients ──
    {
      const section = ctx.ui.box({ id: 'd-gradients' })
      section.setProps({ layout: 'col', gap: 2, pad: 5 })
      section.make('card')
      section.place(ctx.ui.text({ id: 'd-gradients-h', content: 'Stock gradients', font: 'h2' }))
      section.place(ctx.ui.text({ id: 'd-gradients-p', content: '16 named backgrounds from the installable pack (one file: actions/compile/gradients.ts). Each swatch resolves its name at compile time — a blank swatch is a gap.', font: 'body' }))
      const grid = ctx.ui.box({ id: 'd-gradients-grid' })
      grid.setProps({ layout: 'row', gap: 2, wrap: true })
      for (const name of ['sunset', 'ocean', 'forest', 'berry', 'royal', 'ember', 'mint', 'peach', 'storm', 'candy', 'lagoon', 'wine', 'gold', 'slate', 'blossom', 'midnight']) {
        const swatch = ctx.ui.box({ id: `d-gradient-${name}` })
        swatch.setProps({ layout: 'col', align: 'center', justify: 'center', pad: 3, width: '140px', height: '72px', bg: `gradient:${name}` })
        swatch.place(ctx.ui.text({ id: `d-gradient-${name}-t`, content: name, font: 'caption' }))
        grid.place(swatch)
      }
      section.place(grid)
      content.place(section)
    }

    // ── Live tuner ──
    {
      const { stage } = placeView(ctx, content, 'dye', 'Live tuner', 'One box, five knobs: background, radius, effect word, font, gradient.', [
        { id: 'd-dye-bg', kind: 'select', label: 'bg', options: ['#FFFFFF', '#F5F3FF', '#5B21B6', '#B91C1C', '#111827', 'red', 'blue'] },
        { id: 'd-dye-radius', kind: 'select', label: 'radius', options: ['sm', 'md', 'lg', 'full'] },
        { id: 'd-dye-effect', kind: 'select', label: 'effect', options: ['flat', 'raised', 'shadow', 'glow', 'floating', 'inset'] },
        { id: 'd-dye-font', kind: 'select', label: 'font', options: ['body', 'body-lg', 'h2', 'h3', 'caption', 'mono'], value: 'body-lg' },
        { id: 'd-dye-gradient', kind: 'select', label: 'gradient', options: ['none', 'sunset', 'ocean', 'forest', 'berry', 'royal', 'midnight'], value: 'none' },
      ])
      const target = ctx.ui.box({ id: 'd-dye-target' })
      target.setProps({ layout: 'col', align: 'center', justify: 'center', pad: 6, bg: '#FFFFFF', width: '220px', height: '140px' })
      target.make('card')
      target.place(ctx.ui.text({ id: 'd-dye-target-t', content: 'Dye me', font: 'body-lg' }))
      stage.place(target)
    }

    return { ok: true }
  },
})
