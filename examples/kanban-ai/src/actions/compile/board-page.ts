import { defineClientAction } from '@studiomorgana/sdk'

/**
 * The board page. A compile action: it runs once at build time and describes
 * the page as a sequence of statements. There is no template layer.
 *
 * Read top to bottom: header, the add-a-task row, the AI planning row, the three
 * columns, and the move row. Each `id` is project-global, so prefix them when a
 * second page uses the same kinds.
 */
export const boardPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({ name: 'board', address: '/' })
    page.app('board')

    // The root box carries the page's background and text colour. Swizzy's dark
    // surface: #0c0c0d, with warm off-white text.
    const root = ctx.ui.box({ id: 'root' })
    root.setProps({ layout: 'column', gap: 5, pad: 6, bg: '#0c0c0d', color: '#f4f1ec', minH: '100vh' })

    // Kicker: the product name, small and in the accent colour.
    root.place(ctx.ui.text({ id: 'kicker', content: 'SWIZZY · KANBAN', font: 'caption', color: '#FF6A3D' }))

    // Title: `h2` is a heading, so it uses the `display` font (Fraunces).
    // `bind` follows the server object's computed label, live.
    const title = ctx.ui.text({ id: 'board-title', content: 'Kanban', font: 'h2', tracking: 'tight' })
    title.bind('object:board/main.label')
    root.place(title)

    // Row 1: add a task by hand. It lands in the To do column.
    const add = ctx.ui.box({ id: 'add-row' })
    add.setProps({ layout: 'row', gap: 2 })
    add.place(ctx.ui.input({ id: 'new-card', placeholder: 'Add a task' }))
    add.place(ctx.ui.button({ id: 'add-card', label: 'Add task' }))
    root.place(add)

    // Row 2: the AI row. Describe a goal; the server asks the model to split it
    // into tasks and adds each one to To do. Without a model it still splits the
    // goal (see src/actions/server/plan-card.ts).
    const plan = ctx.ui.box({ id: 'plan-row' })
    plan.setProps({ layout: 'row', gap: 2 })
    plan.place(ctx.ui.input({ id: 'plan-text', placeholder: 'Describe a goal and Swizzy will split it into tasks' }))
    plan.place(ctx.ui.button({ id: 'plan-card', label: 'Plan with AI' }))
    root.place(plan)

    // The three columns. Each is the custom object from src/objects/kanban-column.ts.
    const columns = ctx.ui.box({ id: 'columns' })
    columns.setProps({ layout: 'row', gap: 4 })
    columns.place(ctx.ui.kanbanColumn({ id: 'col-todo', title: 'To do' }))
    columns.place(ctx.ui.kanbanColumn({ id: 'col-doing', title: 'Doing' }))
    columns.place(ctx.ui.kanbanColumn({ id: 'col-done', title: 'Done' }))
    root.place(columns)

    // Row 3: move the oldest card along. The server picks the card, so two people
    // pressing at once cannot move the same one twice.
    const moves = ctx.ui.box({ id: 'move-row' })
    moves.setProps({ layout: 'row', gap: 2 })
    moves.place(ctx.ui.button({ id: 'start-next', label: 'Start next →' }))
    moves.place(ctx.ui.button({ id: 'finish-next', label: 'Finish next →' }))
    root.place(moves)

    // A line of feedback for whatever was just done.
    root.place(ctx.ui.text({ id: 'status', content: '', font: 'caption', color: '#9b978f' }))

    page.place(root)
    return { ok: true }
  },
})
