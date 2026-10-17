import { defineServerAction } from '@studiomorgana/sdk'

/**
 * A server action with no `on` is called by name: the browser calls it with
 * `ctx.actions.run('openBoard', {})`. It runs on the server, so it may create the
 * board the first time anyone opens the page.
 *
 * `Contract` is the typed shape of its input and output. Every caller gets
 * those types, so a wrong field name is a build error, not a runtime surprise.
 */
export interface Contract {
  input: Record<string, never>
  output: { label: string; cards: Array<{ id: string; text: string; column: string }> }
}

export const openBoard = defineServerAction({
  handler: async (ctx): Promise<Contract['output']> => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Kanban' })
    const [state, cards] = await Promise.all([board.state(), board.cards()])
    return { label: state.label, cards: cards.map((c) => ({ id: c.id, text: c.text, column: c.column })) }
  },
})
