import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell } from '../../nav'

/**
 * Data + backend — the docs app's own live backend. Notes live in the
 * docs_notes collection; every mutation goes browser → server action →
 * repaint, so state and storage agree. Seed action below keeps the demo
 * non-empty on a fresh backend.
 */
export const backend = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'backend',
      address: 'backend',
      title: 'Data + backend — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'backend', 'Data + backend', 'A live collection behind the page. Add, list, clear — all server actions.')

    const card = ctx.ui.box({ id: 'd-notes' })
    card.setProps({ layout: 'col', gap: 3, pad: 5 })
    card.make('card')
    card.place(ctx.ui.text({ id: 'd-notes-h', content: 'Notes (docs_notes)', font: 'h2' }))

    const row = ctx.ui.box({ id: 'd-notes-row' })
    row.setProps({ layout: 'row', gap: 2 })
    row.place(ctx.ui.input({ id: 'd-notes-new', placeholder: 'A note about the framework…', value: '' }))
    row.place(ctx.ui.button({ id: 'd-notes-add', label: 'Add note', variant: 'primary' }))
    row.place(ctx.ui.button({ id: 'd-notes-clear', label: 'Clear all', variant: 'danger' }))
    card.place(row)

    card.place(ctx.ui.text({ id: 'd-notes-count', content: 'Loading…', font: 'body-me' }))
    card.place(ctx.ui.list({ id: 'd-notes-list' }))
    content.place(card)

    return { ok: true }
  },
})
