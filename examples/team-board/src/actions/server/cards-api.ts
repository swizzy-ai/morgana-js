import { defineServerAction } from '@studiomorgana/sdk'

/**
 * An action as an HTTP route. `on: 'http.<method> /path'` makes it one; route
 * params and the JSON body arrive in `ctx.args`. Returning a value sends
 * `{ success, data }`; `ctx.server.respond` sends exactly what you say.
 */

export const listCards = defineServerAction({
  config: { on: 'http.get /v1/cards' },
  handler: async (ctx) => {
    const column = ctx.server.request.query.column
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    return board.cards({ column })
  },
})

/** Not JSON at all: a CSV download, with the headers that make it one. */
export const exportCards = defineServerAction({
  config: { on: 'http.get /v1/cards.csv' },
  handler: async (ctx) => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    const cards = await board.cards()
    const csv = ['id,column,text', ...cards.map((c) => `${c.id},${c.column},"${String(c.text).replace(/"/g, '""')}"`)].join('\n')
    ctx.server.respond(csv, {
      contentType: 'text/csv',
      headers: { 'content-disposition': 'attachment; filename="cards.csv"' },
    })
    return null
  },
})
