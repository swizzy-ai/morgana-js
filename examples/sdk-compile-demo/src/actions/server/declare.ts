import { defineServerAction } from '@morgana/sdk'

/**
 * Declare the orders collection. This runs in the compile lane, so the shape
 * lands in dist/server/stores.json and the host provisions the table at boot.
 */
export const declare = defineServerAction({
  config: { on: 'compile' },
  handler: async (ctx) => {
    // Declaring the shape is a compile-lane write and nothing else — reads are
    // runtime-only in this lane (`collections.count is runtime-only in compile`),
    // so the contract assertions live in `verifyContract` below instead.
    await ctx.server.collections.create('orders', {
      columns: [
        { name: 'total', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'customer', type: 'string' },
        { name: 'paid', type: 'boolean' },
      ],
    })
    return { ok: true }
  },
})
