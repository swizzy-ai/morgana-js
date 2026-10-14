import { defineClientAction } from '@morgana/sdk'
export const doSignup = defineClientAction({
  config: { on: 'signup-btn.clicked' },
  handler: async (ctx) => {
    // Unique per run: the worker keeps users between runs.
    const u = await ctx.auth.signUp({ email: `browser-${Date.now()}@x.com`, password: 'password-1' })
    const who = await ctx.actions.run('whoami', {})
    ctx.ui.get('who')?.set('content', `signed in as ${u.email} / server sees ${(who as { email: string }).email}`)
  },
})
