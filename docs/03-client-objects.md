# 3 · Client objects

The UI is made of **objects**: `box`, `text`, `button`, `input`, `table`,
`chart` and about a hundred more. You create them in a compile action, place
them on a page, and find them again at runtime by id.

```ts
// src/actions/compile/board-page.ts — at build time
const add = ctx.ui.box({ id: 'add-row' })
add.setProps({ layout: 'row', gap: 2 })
add.place(ctx.ui.input({ id: 'new-card', placeholder: 'What needs doing?' }))
add.place(ctx.ui.button({ id: 'add-card', label: 'Add card' }))
page.place(add)
```

```ts
// src/actions/client/board.ts — in the browser
const input = ctx.ui.get('new-card')!
input.get('value')
input.set('value', '')
```

Creation happens in the compile lane; the browser looks objects up with
`ctx.ui.get(id)` and changes them with `get` / `set` / `setProps`. A page does
not grow new objects at runtime — it changes the ones it has.

## Styling is props

Every visual property is a typed prop: `pad`, `gap`, `bg`, `color`, `radius`,
`border`, `width`, `font`, `layout`, `align`… `make()` applies a named look in
one word:

```ts
const hero = ctx.ui.box({ id: 'hero' })
hero.make('card')
hero.setProps({ layout: 'column', pad: 6, gap: 3 })
```

States are props too — `hover`, `focus`, `active`, `disabled` take the same
props for that state. Light and dark come from `mode`, or
`ctx.ui.theme.set('dark')` at runtime.

**There is no `class` and no `style`.** Everything stylable is reachable as a
prop or a `make()` word; reaching for CSS means a prop is missing.

## Binding to data

An object can follow a value instead of being set by hand. Bound to a server
object's state, it updates live in every browser:

```ts
const title = ctx.ui.text({ id: 'board-title', content: 'Team Board', font: 'h2' })
title.bind('object:board/main.label')   // follows the board's `label`, live
```

## Objects emit events

Objects emit events — `clicked`, `changed`, `submitted`, `selected`… — and an
action listens with `on: '<objectId>.<event>'`:

```ts
export const addCard = defineClientAction({
  config: { on: 'add-card.clicked' },
  handler: async (ctx) => { /* … */ },
})
```

The events each kind emits are on its handle: `morgana spec ui button`.

## Rules

- **Ids are project-global.** Two objects with one id is a build error; prefix
  shared ids per page.
- **Create in compile, change at runtime.** `ctx.ui.<kind>(…)` is a compile-lane
  call.
- **Props, never `class` or `style`.**

## Full surface

```bash
morgana spec ui               # every kind
morgana spec ui table         # one kind: props and handle
morgana spec ui handle        # what every handle has
```

Next: [the backend →](04-backend.md)
