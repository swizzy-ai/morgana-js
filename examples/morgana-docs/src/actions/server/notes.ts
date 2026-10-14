import { defineServerAction } from '@morgana/sdk'

/**
 * Docs backend — notes collection. The browser never touches storage; every
 * mutation goes through these, and the page repaints from the results.
 */

export const notesList = defineServerAction({
  handler: async (ctx) => {
    const result = await (ctx.server.collections as any).query('docs_notes', {
      sort: { field: 'createdAt', dir: 'desc' },
      page: 1,
      pageSize: 100,
    })
    return { items: result.items ?? [] }
  },
})

export const notesAdd = defineServerAction({
  handler: async (ctx) => {
    const text = String((ctx.args as any)?.text ?? '').trim()
    if (!text) throw new Error('note text must not be empty')
    if (text.length > 280) throw new Error('note is too long (max 280)')
    return (ctx.server.collections as any).add('docs_notes', { text, createdAt: Date.now() })
  },
})

export const notesClear = defineServerAction({
  handler: async (ctx) => {
    const result = await (ctx.server.collections as any).query('docs_notes', { page: 1, pageSize: 500 })
    const items = (result.items ?? []) as Array<{ id: string }>
    for (const item of items) {
      await (ctx.server.collections as any).remove('docs_notes', item.id)
    }
    return { ok: true, cleared: items.length }
  },
})

/** The server side of the Lanes page — proves the round trip. */
export const laneEcho = defineServerAction({
  handler: async (ctx) => {
    const msg = String((ctx.args as any)?.msg ?? 'hello')
    return { lane: 'server', at: new Date().toISOString(), echo: msg }
  },
})
