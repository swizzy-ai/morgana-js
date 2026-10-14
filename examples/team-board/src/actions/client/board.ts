import { defineClientAction, type ClientContext } from '@studiomorgana/sdk'

const column = (name: string) => `col-${name}-cards`

/** Fill the columns once, when a page with the board on it loads. */
export const loadBoard = defineClientAction({
  config: { on: 'loaded' },
  handler: async (ctx) => {
    if (!ctx.ui.get(column('todo'))) return // another page
    // Typed from open-board.ts's Contract.
    const { cards } = await ctx.actions.run('openBoard', {})
    for (const card of cards) append(ctx, card.column, card.text)
  },
})

/** A click runs an action in the browser; the method runs on the server. */
export const addCard = defineClientAction({
  config: { on: 'add-card.clicked' },
  handler: async (ctx) => {
    const input = ctx.ui.get('new-card')!
    const text = String(input.get('value') ?? '')
    if (!text.trim()) return
    await ctx.objects.board.get('main').addCard({ text })
    input.set('value', '')
  },
})

/**
 * Live: every browser on the board hears each new card — including ones other
 * people add — over the page's connection to that instance.
 */
export const cardAdded = defineClientAction({
  config: { on: 'object:board/main.cards.added' },
  handler: (ctx) => {
    const card = (ctx.event.payload as { data: { column: string; text: string } }).data
    append(ctx, card.column, card.text)
  },
})

function append(ctx: ClientContext, col: string, text: string) {
  const list = ctx.ui.get(column(col))
  if (!list) return
  const before = String(list.get('content') ?? '')
  list.set('content', before ? `${before}\n• ${text}` : `• ${text}`)
}
