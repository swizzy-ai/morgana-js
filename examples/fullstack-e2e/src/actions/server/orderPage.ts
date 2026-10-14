import { defineServerAction } from '@morgana/sdk'
export const orderPage = defineServerAction({
  config: { on: 'http.get /orders/:id' },
  handler: async (ctx) => {
    const u = ctx.auth.require()
    const t = await ctx.ui.get('order-t')
    t?.setProps({ content: `ORDER ${String(ctx.args.id)} for ${u.email}` })
    return ctx.ui.pages.render('order')
  },
})
