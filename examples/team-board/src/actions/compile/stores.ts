import { defineServerAction } from '@studiomorgana/sdk'

/** A project-wide collection, declared at build time: the activity log. */
export const stores = defineServerAction({
  config: { on: 'compile' },
  handler: async (ctx) => {
    await ctx.server.collections.create('activity', {
      columns: [
        { name: 'kind', type: 'string' },
        { name: 'text', type: 'string' },
      ],
    })
    return { ok: true }
  },
})
