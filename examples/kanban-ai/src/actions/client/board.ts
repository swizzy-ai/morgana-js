import { defineClientAction, type ClientContext } from '@studiomorgana/sdk'

/**
 * Browser actions: they run on the visitor's device and answer one event each.
 * Anything that changes data calls a server object method or a server action.
 * Nothing here writes to the database directly.
 */

const COLUMNS = ['todo', 'doing', 'done'] as const

/** Draw the three columns from the server's current cards. */
async function refresh(ctx: ClientContext) {
  const { cards } = await ctx.actions.run('openBoard', {})
  for (const col of COLUMNS) {
    const list = ctx.ui.get(`col-${col}-cards`)
    // Each card is one bullet line. Empty columns show nothing.
    list?.set('content', cards.filter((c) => c.column === col).map((c) => `• ${c.text}`).join('\n'))
  }
}

function say(ctx: ClientContext, text: string) {
  ctx.ui.get('status')?.set('content', text)
}

/** Fill the board once, when the page loads. */
export const loadBoard = defineClientAction({
  config: { on: 'loaded' },
  handler: async (ctx) => {
    if (!ctx.ui.get('col-todo-cards')) return // another page
    await refresh(ctx)
  },
})

/** Add a task by hand. The server object does the writing. */
export const addCard = defineClientAction({
  config: { on: 'add-card.clicked' },
  handler: async (ctx) => {
    const input = ctx.ui.get('new-card')!
    const text = String(input.get('value') ?? '').trim()
    if (!text) return say(ctx, 'Write a task first.')
    try {
      await ctx.objects.board.get('main').addCard({ text })
      input.set('value', '')
      say(ctx, `Added "${text}" to To do.`)
    } catch (err) {
      say(ctx, `Could not add it: ${(err as Error).message}`)
    }
  },
})

/**
 * The AI row. The server asks the model to split the goal and adds each task to
 * To do. The page only shows how many it made.
 */
export const planWithAi = defineClientAction({
  config: { on: 'plan-card.clicked' },
  handler: async (ctx) => {
    const input = ctx.ui.get('plan-text')!
    const text = String(input.get('value') ?? '').trim()
    if (!text) return say(ctx, 'Describe a goal first.')
    say(ctx, 'Planning…')
    try {
      const { steps } = await ctx.actions.run('planCard', { text })
      input.set('value', '')
      say(ctx, `Planned ${steps.length} tasks.`)
    } catch (err) {
      say(ctx, `Could not plan it: ${(err as Error).message}`)
    }
  },
})

/** Move the oldest To do card to Doing, or the oldest Doing card to Done. */
export const startNext = defineClientAction({
  config: { on: 'start-next.clicked' },
  handler: (ctx) => moveNext(ctx, 'todo', 'doing'),
})

export const finishNext = defineClientAction({
  config: { on: 'finish-next.clicked' },
  handler: (ctx) => moveNext(ctx, 'doing', 'done'),
})

async function moveNext(ctx: ClientContext, from: string, to: string) {
  try {
    const { moved } = await ctx.actions.run('moveNext', { from, to })
    // A move does not fire the add/remove events above, so redraw here.
    await refresh(ctx)
    say(ctx, moved ? `Moved "${moved}" to ${to === 'doing' ? 'Doing' : 'Done'}.` : 'Nothing to move.')
  } catch (err) {
    say(ctx, `Could not move it: ${(err as Error).message}`)
  }
}

/**
 * Live: when any browser adds, moves or removes a card, every open board redraws.
 * The events come from the board object that holds the cards, so this page
 * hears its changes whoever made them.
 */
export const cardsChanged = defineClientAction({
  config: { on: ['object:board/main.cards.added', 'object:board/main.cards.removed'] },
  handler: (ctx) => refresh(ctx),
})
