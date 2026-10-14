import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell } from '../../nav'

/**
 * Streaming — two planes on one channel. Panes A and B both subscribe to
 * docs-chat over SSE; posting from either updates both, and the frame
 * inspector shows the raw frames landing. Open this page in a second tab
 * and it becomes a third plane for free.
 */
export const stream = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'stream',
      address: 'stream',
      title: 'Streaming — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(
      ctx,
      page,
      'stream',
      'Streaming',
      'Two panes, one channel (docs-chat). Post from either — both hear it.',
    )

    const panes = ctx.ui.box({ id: 'd-chat-panes' })
    panes.setProps({ layout: 'row', gap: 3, wrap: true })

    for (const plane of ['a', 'b'] as const) {
      const pane = ctx.ui.box({ id: `d-chat-pane-${plane}` })
      pane.setProps({ layout: 'col', gap: 2, pad: 4, bg: '#FFFFFF', minW: 300, grow: 1 })
      pane.make('card')
      pane.place(ctx.ui.text({ id: `d-chat-pane-${plane}-h`, content: `Plane ${plane.toUpperCase()}`, font: 'h3' }))
      pane.place(ctx.ui.list({ id: `d-chat-${plane}-list` }))
      const row = ctx.ui.box({ id: `d-chat-${plane}-row` })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.input({ id: `d-chat-${plane}-new`, placeholder: `Post as Plane ${plane.toUpperCase()}…`, value: '' }))
      row.place(ctx.ui.button({ id: `d-chat-${plane}-send`, label: 'Send', variant: 'primary' }))
      pane.place(row)
      panes.place(pane)
    }
    content.place(panes)

    const insp = ctx.ui.box({ id: 'd-frames' })
    insp.setProps({ layout: 'col', gap: 2, pad: 5 })
    insp.make('card')
    insp.place(ctx.ui.text({ id: 'd-frames-h', content: 'Frame inspector', font: 'h2' }))
    insp.place(ctx.ui.text({ id: 'd-frames-p', content: 'Raw channel:docs-chat frames as they land.', font: 'body' }))
    insp.place(ctx.ui.list({ id: 'd-frames-list' }))
    content.place(insp)

    return { ok: true }
  },
})
