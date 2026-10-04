import { defineServerAction } from '@morgana/sdk'

export const onOrder = defineServerAction({
  handler: (ctx) => {
    ctx.log('order created', JSON.stringify(ctx.args))
    return { ok: true }
  },
})
