import { defineServerAction } from '@morgana/sdk'
export const welcome = defineServerAction({
  handler: async (ctx) => {
    const u = ctx.auth.require()
    const sent = await ctx.server.email.send({ to: String(u.email), subject: 'Welcome', text: 'hi' })
    return { sent, from: ctx.vars.get('EMAIL_FROM') }
  },
})
