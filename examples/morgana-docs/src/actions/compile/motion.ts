import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell, placeView } from '../../nav'

/** The 16 runtime presets — the same list the AnimateApi declares. */
export const PRESETS = [
  'fadeIn', 'fadeOut', 'slideUp', 'slideDown', 'slideLeft', 'slideRight',
  'slideIn', 'slideOut', 'scaleIn', 'scaleOut', 'pulse', 'bounce',
  'spin', 'smooth', 'bouncy', 'sway',
]

/**
 * Motion lab — every preset on one target with timing knobs. One-shots are
 * awaited (the log shows the settle); loops are fire-and-forget and the next
 * Run replaces the current run. Under reduced motion the page says so instead
 * of sitting dead.
 */
export const motion = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'motion',
      address: 'motion',
      title: 'Motion lab — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'motion', 'Motion lab', 'Every preset, live. Pick one, tune it, Run.')

    const { stage } = placeView(ctx, content, 'motion', 'Preset runner', 'The purple box is the target. Reduced-motion systems see a note, not a dead box.', [
      { id: 'd-motion-preset', kind: 'select', label: 'preset', options: PRESETS, value: 'spin' },
      { id: 'd-motion-duration', kind: 'input', label: 'duration ms', value: '600' },
      { id: 'd-motion-distance', kind: 'input', label: 'distance units', value: '4' },
      { id: 'd-motion-dir', kind: 'select', label: 'from/to (slideIn/Out)', options: ['up', 'down', 'left', 'right'], value: 'up' },
      { id: 'd-motion-loop', kind: 'toggle', label: 'loop', value: 'false' },
      { id: 'd-motion-alternate', kind: 'toggle', label: 'alternate', value: 'false' },
    ])

    const target = ctx.ui.box({ id: 'd-motion-target' })
    target.setProps({ layout: 'col', align: 'center', justify: 'center', pad: 6, bg: '#5B21B6', color: '#FFFFFF', width: '160px', height: '160px' })
    target.place(ctx.ui.text({ id: 'd-motion-target-t', content: 'Run me', font: 'body-lg' }))
    stage.place(target)

    const row = ctx.ui.box({ id: 'd-motion-btns' })
    row.setProps({ layout: 'row', gap: 2 })
    row.place(ctx.ui.button({ id: 'd-motion-run', label: 'Run', variant: 'primary' }))
    stage.place(row)

    return { ok: true }
  },
})
