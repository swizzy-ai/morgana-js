import { defineServerAction, type ServerContext } from '@studiomorgana/sdk'

/**
 * Move the oldest card from one column to another. The server decides which card
 * moves, so two people pressing at once cannot move the same one twice.
 */
export interface Contract {
  input: { from: string; to: string }
  output: { moved: string | null }
}

export const moveNext = defineServerAction<ServerContext<Contract>>({
  config: {},
  handler: async (ctx) => {
    // config.auth only guards HTTP routes. A named action checks the session itself.
    ctx.auth.require()
    const { from, to } = ctx.args
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Kanban' })
    // `cards` is sorted oldest first, so the first one in `from` is the oldest.
    const oldest = (await board.cards({ column: from }))[0]
    if (!oldest) return { moved: null }
    await board.moveCard({ id: oldest.id, column: to })
    return { moved: oldest.text }
  },
})
