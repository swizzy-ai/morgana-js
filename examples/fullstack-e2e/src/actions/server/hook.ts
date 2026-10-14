import { defineServerAction } from '@morgana/sdk'

/** A webhook shaping its own response. */
export const hook = defineServerAction({
  config: { on: 'http.post /hooks/test' },
  handler: async (ctx) => {
    ctx.server.respond('accepted', { status: 202, contentType: 'text/plain' })
    return null
  },
})
