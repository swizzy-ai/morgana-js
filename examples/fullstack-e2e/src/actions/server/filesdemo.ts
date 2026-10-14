import { defineServerAction } from '@studiomorgana/sdk'
export const filesdemo = defineServerAction({
  handler: async (ctx) => {
    await ctx.server.files.write('reports/a.txt', 'hello r2', 'text/plain')
    const text = await ctx.server.files.read('reports/a.txt')
    const list = await ctx.server.files.list('reports')
    let traversal = 'allowed'
    try { await ctx.server.files.read('../secrets') } catch (e) { traversal = String((e as Error).message) }
    return { text, names: list.map((f: { path: string }) => f.path), traversal }
  },
})
