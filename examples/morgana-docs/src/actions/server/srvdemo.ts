import { defineServerAction } from '@morgana/sdk'

/**
 * Action-as-router for /srvdemo/. Fetches the notes, loads the compile-time
 * table by id, sets the rows, renders the page. The visitor gets finished
 * HTML in one trip — no empty shell, no client refetch.
 */
export const srvdemoPage = defineServerAction({
  config: { on: 'http.get /srvdemo/' },
  handler: async (ctx) => {
    const result = await (ctx.server.collections as any).query('docs_notes', {
      sort: { field: 'createdAt', dir: 'desc' },
      page: 1,
      pageSize: 20,
    })
    const rows = (result.items ?? []).map((n: any) => ({ text: n.text, createdAt: n.createdAt }))
    const table = await ctx.ui.get('srv-table')
    if (!table) throw new Error('srv-table not found in server graph')
    table.setProps({ rows })
    return ctx.ui.pages.render('srvdemo')
  },
})
