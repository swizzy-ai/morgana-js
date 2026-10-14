import { defineServerAction } from '@studiomorgana/sdk'

/**
 * Declare the docs collections. Runs in the compile lane, so the shapes land
 * in dist/server/stores.json and the host provisions the tables at boot.
 */
export const declareDocsStores = defineServerAction({
  config: { on: 'compile' },
  handler: async (ctx) => {
    await (ctx.server.collections as any).create('docs_notes', {
      columns: [
        { name: 'text', type: 'string' },
        { name: 'createdAt', type: 'number' },
      ],
    })
    await (ctx.server.collections as any).create('docs_chat', {
      columns: [
        { name: 'user', type: 'string' },
        { name: 'text', type: 'string' },
        { name: 'createdAt', type: 'number' },
      ],
    })
    // Seed so the pages are never empty on first run. If the compile lane
    // has no live store in this host, the pages start empty instead of
    // failing the build — adding the first row is one click.
    try {
      const existing = (await (ctx.server.collections as any).query('docs_notes', { page: 1, pageSize: 1 })) as any
      if ((existing.items ?? []).length === 0) {
        for (const text of ['Every object on this site is the real object.', 'Knobs write props; the log proves events.']) {
          await (ctx.server.collections as any).add('docs_notes', { text, createdAt: Date.now() })
        }
      }
    } catch {
      // No live store at compile time — start empty.
    }
    return { ok: true }
  },
})
