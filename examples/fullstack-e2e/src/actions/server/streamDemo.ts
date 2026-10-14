import { defineServerAction } from '@morgana/sdk'

/** Three chunks, 400ms apart — the client must see the first long before the last. */
export const streamDemo = defineServerAction({
  config: { on: 'http.get /stream/demo' },
  handler: async (ctx) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    await ctx.server.response.stream(async (emit) => {
      await emit('one\n')
      await wait(400)
      await emit({ n: 2 })
      await wait(400)
      await emit('three\n')
    })
    return null
  },
})
