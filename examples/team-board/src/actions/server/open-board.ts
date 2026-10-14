import { defineServerAction } from '@studiomorgana/sdk'

/**
 * An action with no `on` is called by name: `ctx.actions.run('openBoard')`.
 * It runs on the server, so it may do what a browser may not — here, create
 * the board the first time anyone opens it.
 */
export interface Contract {
  input: Record<string, never>
  output: { label: string; cards: Array<{ id: string; text: string; column: string }> }
}

export const openBoard = defineServerAction({
  handler: async (ctx): Promise<Contract['output']> => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    const [state, cards] = await Promise.all([board.state(), board.cards()])
    return { label: state.label, cards: cards.map((c) => ({ id: c.id, text: c.text, column: c.column })) }
  },
})
