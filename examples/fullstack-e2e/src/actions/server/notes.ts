import { defineServerAction } from '@morgana/sdk'

/** set/get by id, then a write naming an undeclared column. */
export const notesRoundTrip = defineServerAction({
  handler: async (ctx) => {
    await ctx.server.collections.set('notes', 'n1', { text: 'first', tags: ['a', 'b'] })
    await ctx.server.collections.set('notes', 'n2', { text: 'second', tags: [] })
    // Same id again: an upsert, never a wipe of the collection.
    await ctx.server.collections.set('notes', 'n1', { text: 'first, edited', tags: ['a'] })
    const one = await ctx.server.collections.get('notes', 'n1')
    const count = await ctx.server.collections.count('notes')
    let undeclared = 'accepted'
    try {
      await ctx.server.collections.add('notes', { text: 'x', colour: 'red' })
    } catch (e) {
      undeclared = (e as Error).message
    }
    return { text: one?.text, tags: one?.tags, count, undeclared }
  },
})
