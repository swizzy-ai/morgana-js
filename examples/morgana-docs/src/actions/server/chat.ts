import { defineServerAction } from '@morgana/sdk'

/**
 * Chat backend — history in a collection, live frames on the channel.
 * Posting does both: late joiners read history, present panes hear the frame.
 */

export const chatHistory = defineServerAction({
  handler: async (ctx) => {
    const result = await (ctx.server.collections as any).query('docs_chat', {
      sort: { field: 'createdAt', dir: 'asc' },
      page: 1,
      pageSize: 100,
    })
    return { items: result.items ?? [] }
  },
})

export const chatPost = defineServerAction({
  handler: async (ctx) => {
    const user = String((ctx.args as any)?.user ?? 'anon').slice(0, 24)
    const text = String((ctx.args as any)?.text ?? '').trim()
    if (!text) throw new Error('message must not be empty')
    if (text.length > 280) throw new Error('message is too long (max 280)')
    const record = await (ctx.server.collections as any).add('docs_chat', {
      user,
      text,
      createdAt: Date.now(),
    })
    await (ctx.events as any).publish('docs-chat', { user, text, at: Date.now() })
    return record
  },
})
