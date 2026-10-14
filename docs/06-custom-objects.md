# 6 · Custom objects

A custom object is your own UI kind. Drop one file in `src/objects/` and it
becomes `ctx.ui.<name>`, created and placed exactly like a built-in — no
registration, no manifest.

```ts
// src/objects/kanban-column.ts
import { createCustomObject } from '@studiomorgana/sdk'

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
```

```ts
// any compile action — typed by `morgana types`
columns.place(ctx.ui.kanbanColumn({ id: 'col-todo', title: 'To do' }))
```

The name `kanban-column` becomes `ctx.ui.kanbanColumn`; its `defaultProps`
become typed props.

## Two lanes

| Lane | Keys | Runs |
|---|---|---|
| **Build** | `define`, `defaultProps`, `state`, `render` | In Node, at build. Composes built-ins. No DOM. |
| **Browser** | `onPrepare`, `onMount`, `onUpdate`, `onDestroy`, `methods` | In the page. The DOM is here. |

A custom object that only uses `define` ships **no JavaScript at all** — it
compiles to the built-in objects it is made of, with their styling, events and
binding. Only browser hooks or `methods` add code to the page.

## Browser code: lifecycle and methods

When you need the DOM — a canvas, a video element, a third-party widget:

```ts
export default createCustomObject({
  name: 'video-player',
  defaultProps: { src: '' },
  onMount: (el, ctx) => { /* el is the element; attach the player */ },
  onUpdate: (next, ctx) => { /* props changed after mount */ },
  onDestroy: (ctx) => { /* clean up */ },
  methods: {
    seek: (handle, seconds: number) => handle.set('time', seconds),
  },
})
```

`methods` are attached to the handle **in the browser**, after a reference
like `ctx.ui.get('player')`. They are not on the handle a compile action gets
from `ctx.ui.videoPlayer(…)`. To type them in a browser action:

```ts
import type player from '../../objects/video-player'
const p = ctx.ui.get('player') as BoxHandle & CustomObjectMethods<typeof player>
p.seek(10)
```

## Rules

- **Derive child ids from `ctx.id`.** Two instances with fixed child ids
  collide.
- **`define` has no DOM.** Anything touching the page belongs in `onMount`.
- **`methods` are browser-only.**
- **Props, never `class` or `style`** — inside a custom object too.

## Full surface

```bash
morgana spec custom-object
```

Next: [built-in events →](07-events.md)
