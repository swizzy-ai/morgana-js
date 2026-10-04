import { defineClientAction } from '@morgana/sdk'

export const watcher = defineClientAction({
  config: { on: 'state:cart.open' },
  handler: (ctx) => {
    const open = ctx.ui.state.get('cart.open')
    ctx.ui.state.set('cart.statusLabel', open ? 'cart open!' : 'cart closed')
    return { ok: true }
  },
})
