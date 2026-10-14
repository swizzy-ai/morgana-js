import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell } from '../../nav'

/**
 * Server-rendered proof page. Structure is defined here at compile time with
 * no data; the owning server action (`server/srvdemo.ts`) fetches the notes,
 * loads the table by id, sets the rows, and renders per request.
 */
export const srvdemo = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'srvdemo',
      address: 'srvdemo',
      title: 'Server-rendered — Morgana Docs',
      render: 'server',
    })
    page.app('main')
    const content = placeShell(
      ctx,
      page,
      'srvdemo',
      'Server-rendered notes',
      'Built per request: the action fetches notes, loads the table, renders. View source — the rows are in the first response.',
    )
    content.place(
      ctx.ui.table({
        id: 'srv-table',
        columns: [
          { key: 'text', label: 'Note' },
          { key: 'createdAt', label: 'Created', format: 'date' },
        ],
        rows: [],
      }),
    )
    return { ok: true }
  },
})
