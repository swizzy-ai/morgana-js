import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell } from '../../nav'

/**
 * Lanes — the same idea in all three. Compile stamps the build time into the
 * page; the server button round-trips through laneEcho; the client button
 * answers locally. Three timestamps, three lanes, one page.
 */
export const lanes = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'lanes',
      address: 'lanes',
      title: 'Lanes — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'lanes', 'Lanes', 'Compile, server, client — the same question answered three ways.')

    const stamped = new Date().toISOString()

    const mk = (id: string, title: string, body: string, btn: string | null) => {
      const card = ctx.ui.box({ id: `d-lane-${id}` })
      card.setProps({ layout: 'col', gap: 2, pad: 5 })
      card.make('card')
      card.place(ctx.ui.text({ id: `d-lane-${id}-h`, content: title, font: 'h2' }))
      card.place(ctx.ui.text({ id: `d-lane-${id}-p`, content: body, font: 'body' }))
      card.place(ctx.ui.text({ id: `d-lane-${id}-out`, content: id === 'compile' ? `stamped at build: ${stamped}` : 'press the button', font: 'mono' }))
      if (btn) card.place(ctx.ui.button({ id: `d-lane-${id}-go`, label: btn, variant: 'primary' }))
      content.place(card)
    }

    mk('compile', 'Compile lane', 'Runs in Node at build time. This timestamp was written when the page was compiled — reload and it does not change until rebuild.', null)
    mk('server', 'Server lane', 'Runs in the sandbox (dev host here). Press to round-trip through laneEcho.', 'Ask the server')
    mk('client', 'Client lane', 'Runs in this browser. Press to answer without leaving the page.', 'Answer locally')

    return { ok: true }
  },
})
