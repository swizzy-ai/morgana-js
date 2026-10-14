import { createCustomObject } from '@studiomorgana/sdk'

/**
 * A custom object: a new UI kind, `ctx.ui.kanbanColumn(…)`, composed from
 * built-ins at build time. It ships no browser code because it needs none.
 */
export default createCustomObject({
  name: 'kanban-column',
  defaultProps: { title: 'Column' },
  define: (handle, ctx) => {
    handle.setProps({ layout: 'column', gap: 2, pad: 4 })
    handle.make('card')
    // Child ids are project-global, so derive them from this instance's id.
    handle.place(ctx.ui.text({ id: `${ctx.id}-title`, content: ctx.props.title, font: 'title' }))
    handle.place(ctx.ui.text({ id: `${ctx.id}-cards`, content: '' }))
  },
})
