import { createCustomObject } from '@studiomorgana/sdk'

/**
 * A custom UI kind: `ctx.ui.kanbanColumn({ id, title })`. Built from built-in
 * kinds at build time, so it ships no browser code of its own.
 *
 * Styling is props only (`bg`, `radius`, `border`, `pad`…). Never `class` or
 * `style`. The palette is Swizzy's: ink-dark surfaces, one orange accent.
 */
export default createCustomObject({
  name: 'kanban-column',
  defaultProps: { title: 'Column' },
  define: (handle, ctx) => {
    handle.setProps({
      layout: 'column',
      gap: 3,
      pad: 4,
      width: 300,
      minW: 260,
      bg: '#161618',
      radius: 18,
      border: true,
      borderColor: '#2a2a2e',
    })
    // Child ids are project-global, so derive them from this instance's id.
    // Two columns both named "title" would be a build error.
    handle.place(ctx.ui.text({ id: `${ctx.id}-title`, content: ctx.props.title, font: 'title', color: '#FF6A3D' }))
    // The cards are a text list the page fills in (see refresh() in board.ts).
    handle.place(ctx.ui.text({ id: `${ctx.id}-cards`, content: '', font: 'body', color: '#f4f1ec' }))
  },
})
