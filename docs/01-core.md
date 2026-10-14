# 1 · Actions, events, ctx

Three ideas are the whole model.

1. An **action** is a function in `src/actions/`.
2. An **event** decides when it runs — its `config.on`.
3. **`ctx`** is everything it can do: the UI, the server, objects, auth, other actions.

```ts
// src/actions/client/board.ts
import { defineClientAction } from '@studiomorgana/sdk'

export const addCard = defineClientAction({
  config: { on: 'add-card.clicked' },          // the event
  handler: async (ctx) => {                     // the action
    const input = ctx.ui.get('new-card')!       // ctx: the page…
    const text = String(input.get('value') ?? '')
    if (!text.trim()) return
    await ctx.objects.board.get('main').addCard({ text })   // …and the server
    input.set('value', '')
  },
})
```

An action is named by its export (`addCard`), not its file.

## Three lanes

Where an action runs follows from what it is for. The folder is convention;
`define…Action` and `on` are what decide.

| Lane | Write | `on` | Runs |
|---|---|---|---|
| **compile** | `defineClientAction` | `'compile'` | At build time, in Node. Creates apps, pages and objects. |
| **browser** | `defineClientAction` | a page event: `'add-card.clicked'`, `'loaded'`, `'state:…'` | In the page. |
| **server** | `defineServerAction` | `'http.get /x'`, `'cron(…)'`, `'store.x.created'`, `'object:…'` — or none | On the server, in a sandbox. |

A compile action is not a build script. It receives a real `ctx` and makes the
page by stating it:

```ts
// src/actions/compile/board-page.ts
export const boardPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({ name: 'board', address: '/' })
    page.app('board')
    page.place(ctx.ui.text({ id: 'board-title', content: 'Team Board', font: 'h2' }))
    return { ok: true }
  },
})
```

## Calling an action by name

A server action with no `on` is a function you call. `ctx.actions.run` works
from the browser and the server alike, and is typed when the action exports a
`Contract` ([§8](08-types.md)):

```ts
// src/actions/server/open-board.ts
export const openBoard = defineServerAction({
  handler: async (ctx) => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    return { cards: await board.cards() }
  },
})

// in a browser action
const { cards } = await ctx.actions.run('openBoard', {})
```

## ctx

`ctx` is shaped by the lane. Every lane has `args`, `vars`, `actions`,
`events`, `apps`, `assets`, `ai` and `log`. The browser adds `ui`, `auth`,
`objects` and `event` (what triggered it). The server adds `server`
(requests, responses, collections, email…), `auth`, `objects` and a
request-time `ui` for server rendering.

## Rules

- **One thing per action.** If two events need the same work, put it in a
  helper both import, or a server action both `run`.
- **Browser code is public.** Anything in a client action ships to the page.
  Secrets, authority and validation live in server actions and server objects.
- **Server code is not Node.** No `fs`, no `node:crypto`. The build warns.
- **Compile actions are idempotent.** They run on every build; the same input
  must make the same page.

## Full surface

```bash
morgana spec ctx              # the shared base
morgana spec ctx client       # browser and compile
morgana spec ctx server
```

Next: [apps and pages →](02-apps-and-pages.md)
