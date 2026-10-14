import { defineServerAction } from '@morgana/sdk'

/** Password reset end to end, inside one action. */
export const resetDemo = defineServerAction({
  handler: async (ctx) => {
    const email = `reset-${Date.now()}@x.com`
    await ctx.auth.users.create({ email, password: 'before-pass-1' })
    const reset = await ctx.auth.passwordReset.create(email)
    const missing = await ctx.auth.passwordReset.create(`nobody-${Date.now()}@x.com`)
    const user = await ctx.auth.passwordReset.complete(String(reset?.token), 'after-pass-1')
    let reused = 'accepted'
    try {
      await ctx.auth.passwordReset.complete(String(reset?.token), 'again-pass-1')
    } catch (e) {
      reused = (e as Error).message
    }
    return { verified: user.emailVerified, missing, reused }
  },
})
