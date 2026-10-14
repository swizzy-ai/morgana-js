import { defineServerAction } from '@studiomorgana/sdk'

/**
 * A server action triggered by a server object's event — any board, any
 * caller. The instance is `ctx.object`; the event is `ctx.args.event`.
 */
export const logCard = defineServerAction({
  config: { on: 'object:board.card' },
  handler: async (ctx) => {
    const { payload } = (ctx.args as { event: { payload: { text: string } } }).event
    await ctx.server.collections.add('activity', { kind: 'card', text: payload.text })
  },
})

/** On a schedule: trim the log to the last 500 entries, every night. */
export const trimActivity = defineServerAction({
  config: { on: 'cron(0 3 * * *)' },
  handler: async (ctx) => {
    const { items, total } = await ctx.server.collections.query('activity', { sort: { field: 'createdAt', dir: 'asc' }, pageSize: 1000 })
    for (const row of items.slice(0, Math.max(0, total - 500))) {
      await ctx.server.collections.remove('activity', String(row.id))
    }
  },
})
