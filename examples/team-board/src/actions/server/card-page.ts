import { defineServerAction, type ServerContext } from '@studiomorgana/sdk'

/**
 * Server-side rendering: fetch the data first, then render.
 *
 * The page `card` is declared with `render: 'server'` (board-page.ts). This
 * action owns its route: it loads the objects the compile lane placed, fills
 * them from the board, and returns the rendered HTML — the browser receives a
 * finished page, data and all, on the first response.
 */
/** Route params arrive in `ctx.args`; the Contract types them. */
export interface Contract {
  input: { id: string }
  output: unknown
}

export const cardPage = defineServerAction<ServerContext<Contract>>({
  config: { on: 'http.get /cards/:id' },
  handler: async (ctx) => {
    const { id } = ctx.args
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    const cards = await board.cards()
    const card = cards.find((c) => c.id === id)
    if (!card) {
      ctx.server.respond('No such card', { status: 404, contentType: 'text/plain' })
      return null
    }
    const text = await ctx.ui.get('card-text')
    const meta = await ctx.ui.get('card-meta')
    text?.set('content', card.text)
    meta?.set('content', `${card.column} · added by ${card.author}`)
    return ctx.ui.pages.render('card')
  },
})
