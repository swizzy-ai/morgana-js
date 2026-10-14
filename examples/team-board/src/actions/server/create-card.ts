import { defineServerAction } from '@studiomorgana/sdk'

/**
 * A typed HTTP endpoint. `on: 'http.post /v1/cards'` makes the action a route;
 * the JSON body arrives in `ctx.args`. The exported `Contract` types it for
 * every caller, `ctx.actions.run('createCard', …)` included — one action per
 * file is what lets a `Contract` say which action it describes.
 */
export interface Contract {
  input: { text: string; column?: string }
  output: { id: string; text: string; column: string }
}

export const createCard = defineServerAction({
  config: { on: 'http.post /v1/cards', auth: 'member' },
  handler: async (ctx) => {
    const { text, column } = ctx.args as Contract['input']
    if (!text?.trim()) {
      // Your own status and body, instead of the { success, data } wrapper.
      ctx.server.respond({ error: 'text is required' }, { status: 400 })
      return null
    }
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    const card = await board.addCard({ text, column })
    ctx.server.response.status(201)
    return { id: card.id, text: card.text, column: card.column }
  },
})
