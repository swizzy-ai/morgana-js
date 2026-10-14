import { defineClientAction } from '@studiomorgana/sdk'

/**
 * The board page. Compile actions run at build time and shape the page —
 * there is no template layer; creating a page is a statement like any other.
 */
export const boardPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({ name: 'board', address: '/' })
    page.app('board')

    // `font` picks the step of the type scale; h2 is a heading, so it is set in
    // the `display` font (config.text.headings). `tracking` tightens it a touch.
    const title = ctx.ui.text({ id: 'board-title', content: 'Team Board', font: 'h2', tracking: 'tight' })
    title.bind('object:board/main.label') // follows the server object's state, live

    const add = ctx.ui.box({ id: 'add-row' })
    add.setProps({ layout: 'row', gap: 2 })
    add.place(ctx.ui.input({ id: 'new-card', placeholder: 'What needs doing?' }))
    add.place(ctx.ui.button({ id: 'add-card', label: 'Add card' }))

    const columns = ctx.ui.box({ id: 'columns' })
    columns.setProps({ layout: 'row', gap: 4 })
    // Custom objects are created exactly like built-ins.
    columns.place(ctx.ui.kanbanColumn({ id: 'col-todo', title: 'To do' }))
    columns.place(ctx.ui.kanbanColumn({ id: 'col-doing', title: 'Doing' }))
    columns.place(ctx.ui.kanbanColumn({ id: 'col-done', title: 'Done' }))

    page.place(title)
    page.place(add)
    page.place(columns)

    // A server-rendered page: its content is filled per request (see card-page.ts).
    const card = ctx.ui.pages.create({ name: 'card', address: 'cards/:id', render: 'server' })
    card.app('board')
    card.place(ctx.ui.text({ id: 'card-text', content: '', font: 'h3' }))
    card.place(ctx.ui.text({ id: 'card-meta', content: '' }))

    return { ok: true }
  },
})
