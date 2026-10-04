import { defineClientAction } from '@morgana/sdk'

/**
 * Page-load data fetch — runs when the page finishes loading, calls the
 * backend `getStats` action, and publishes the result to state (picked up
 * live by data-bound elements, e.g. the home stats readout).
 */
export const loadStats = defineClientAction({
  config: { on: 'loaded' },
  handler: async (ctx) => {
    const stats = await ctx.actions.run('getStats')
    ctx.ui.state.set('stats', stats)
    return { ok: true }
  },
})
