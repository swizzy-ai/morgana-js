import { defineServerAction } from '@morgana/sdk'

export const declareStores = defineServerAction({
  config: { on: 'compile' },
  handler: async (ctx) => {
    await ctx.server.collections.create('notes', {
      columns: [
        { name: 'text', type: 'string' },
        { name: 'tags', type: 'json' },
      ],
    })
    return { ok: true }
  },
})
