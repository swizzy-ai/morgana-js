import { defineClientAction } from '@morgana/sdk'

export const checkout = defineClientAction({
  config: { on: 'clicked' },
  handler: (ctx) => {
    ctx.ui.state.set('cart.open', true)
    // Live handle: reach the object declared in seed.ts and repaint it.
    ctx.ui.get('cta')?.set('label', 'Checkout now')
    return { ok: true }
  },
})
