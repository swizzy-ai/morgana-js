# 4 · The backend

The server side is the same model: **server actions** that run on events, plus
**server objects** for durable, live state. Locally they run under
`morgana dev`; deployed, in a sandbox in the cloud. Both hosts behave the same.

- [Server actions](#server-actions)
- [Actions as HTTP routes](#actions-as-http-routes)
- [Responses](#responses)
- [Server rendering: fetch, then render](#server-rendering-fetch-then-render)
- [Collections](#collections)
- [Server objects](#server-objects)
- [Auth](#auth)

## Server actions

```ts
import { defineServerAction } from '@studiomorgana/sdk'

export const openBoard = defineServerAction({
  handler: async (ctx) => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    return { cards: await board.cards() }
  },
})
```

With no `on`, it is called by name — `ctx.actions.run('openBoard', {})`. With
an `on`, the event runs it: an HTTP request, a schedule, a record change, an
object event.

## Actions as HTTP routes

`on: 'http.<method> /path'` makes an action a route. Route params, the query
string and the JSON body all arrive in `ctx.args`; the raw request is
`ctx.server.request`.

```ts
// src/actions/server/cards-api.ts
export const listCards = defineServerAction({
  config: { on: 'http.get /v1/cards' },
  handler: async (ctx) => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    return board.cards({ column: ctx.server.request.query.column })
  },
})
```

`auth: 'member'` refuses signed-out callers with `401` before the action runs:

```ts
config: { on: 'http.post /v1/cards', auth: 'member' }
```

**Reserved paths.** `/`, and anything under `/api/`, `/assets/`, `/pages/` or
`/apps/`, belong to the host. A route there is a build error.

## Responses

What the action returns becomes the response:

| The action… | The client receives |
|---|---|
| returns a value | `200` · `{ "success": true, "data": { "result": … } }` |
| throws | an error status · `{ "success": false, "message": "…" }` |
| calls `ctx.server.respond(body, { status, contentType, headers })` | exactly that — no wrapper |
| sets `ctx.server.response.status(201)` and returns | the wrapper, with that status |
| calls `ctx.server.response.stream(async (emit) => …)` | a streamed body, sent as it is produced |
| returns `ctx.ui.pages.render(name)` | HTML — see below |

```ts
// src/actions/server/create-card.ts — validation and a 201
export const createCard = defineServerAction({
  config: { on: 'http.post /v1/cards', auth: 'member' },
  handler: async (ctx) => {
    const { text, column } = ctx.args as Contract['input']
    if (!text?.trim()) {
      ctx.server.respond({ error: 'text is required' }, { status: 400 })
      return null
    }
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
    const card = await board.addCard({ text, column })
    ctx.server.response.status(201)
    return { id: card.id, text: card.text, column: card.column }
  },
})
```

```ts
// Not JSON at all: a download.
ctx.server.respond(csv, {
  contentType: 'text/csv',
  headers: { 'content-disposition': 'attachment; filename="cards.csv"' },
})
return null
```

After `respond`, `return null` — the response is already decided.

## Server rendering: fetch, then render

For a page whose content depends on the request — a record, a profile, an
order — fetch the data **before** the page is sent, so the first response is
the finished page.

1. Declare the page with `render: 'server'` and lay it out as usual:

   ```ts
   const card = ctx.ui.pages.create({ name: 'card', address: 'cards/:id', render: 'server' })
   card.app('board')
   card.place(ctx.ui.text({ id: 'card-text', content: '', font: 'h3' }))
   card.place(ctx.ui.text({ id: 'card-meta', content: '' }))
   ```

2. Give its route to a server action that loads the data, fills the objects
   and returns the render:

   ```ts
   // src/actions/server/card-page.ts
   export interface Contract {
     input: { id: string }       // the route param, typed
     output: unknown
   }

   export const cardPage = defineServerAction<ServerContext<Contract>>({
     config: { on: 'http.get /cards/:id' },
     handler: async (ctx) => {
       const { id } = ctx.args
       const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
       const cards = await board.cards()
       const card = cards.find((c) => c.id === id)
       if (!card) {
         ctx.server.respond('No such card', { status: 404, contentType: 'text/plain' })
         return null
       }
       const text = await ctx.ui.get('card-text')
       const meta = await ctx.ui.get('card-meta')
       text?.set('content', card.text)
       meta?.set('content', `${card.column} · added by ${card.author}`)
       return ctx.ui.pages.render('card')
     },
   })
   ```

`ctx.ui.get` on the server is async — `await` it. The page's `access` is
checked before the action runs, so a gated page never renders for someone who
may not see it.

## Collections

Project-wide tables. Declare the shape in a compile action; use them from any
server action.

```ts
// src/actions/compile/stores.ts
export const stores = defineServerAction({
  config: { on: 'compile' },
  handler: async (ctx) => {
    await ctx.server.collections.create('activity', {
      columns: [{ name: 'kind', type: 'string' }, { name: 'text', type: 'string' }],
    })
    return { ok: true }
  },
})

// any server action
await ctx.server.collections.add('activity', { kind: 'card', text })
const { items, total } = await ctx.server.collections.query('activity', { sort: { field: 'createdAt', dir: 'desc' } })
```

A write naming an undeclared column is refused. Record changes are events:
`on: 'store.activity.created'`.

## Server objects

When state belongs to *a thing* — a board, a room, a cart, a game — make it a
server object. Each instance has its own state and tables; methods run one at
a time, all-or-nothing; and every browser watching sees changes live.

```ts
// src/server-objects/board.ts (abridged)
export default defineServerObject({
  name: 'board',
  state: { title: 'Untitled board', cardCount: 0 },
  collections: {
    cards: { columns: [{ name: 'text', type: 'string' }, { name: 'column', type: 'string' }, { name: 'author', type: 'string' }] },
  },
  computed: { label: (s) => `${s.title} · ${s.cardCount} cards` },
  access: { read: 'public', subscribe: 'public', cards: 'public', addCard: 'member', moveCard: 'member' },
  on: {
    'cards.added': (self) => self.set({ cardCount: self.state.cardCount + 1 }),
  },
  methods: {
    cards: async (self, p: { column?: string } = {}) =>
      self.db.cards.query({ where: p.column ? { column: p.column } : undefined }).items,
    addCard: async (self, p: { text: string; column?: string }) => {
      const card = self.db.cards.add({ text: p.text, column: p.column ?? 'todo', author: self.caller?.email ?? 'server' })
      self.emit('card', card)
      return card
    },
  },
})
```

Reach it as `ctx.objects.board`, from the server and the browser:

```ts
const board = await ctx.objects.board.getOrCreate('main', { title: 'Team Board' })
await board.addCard({ text: 'Ship it' })        // typed from the definition
const state = await board.state()               // state + computed
```

What the definition gives you:

| Key | What it is |
|---|---|
| `state` | Each instance's initial state. `self.set(patch)` changes it, committed with the call. |
| `collections` | The instance's own tables: `self.db.cards.add / get / update / remove / query / count`. |
| `computed` | Values derived from state, served with it — bindable like state. |
| `methods` | Transactions. Write one as `async function*` to stream its `yield`s to the caller. |
| `access` | What a **browser** may do: `'public'`, `'member'`, `{ role }`. Unlisted means server-only. Server code may do everything. |
| `on` | Reactions to the instance's own writes (`cards.added`), state (`state.title`) and events — committed with the call that caused them. |
| `onCreate` | Runs inside the create transaction. |
| `jobs` + `self.defer(job)` | Background work after the call commits. |
| `self.schedule('5m', method)` | Run a method later. |

Outside the instance, its events are triggers: a client action can follow one
instance live (`on: 'object:board/main.cards.added'`), and a server action
can react to every instance (`on: 'object:board.card'`, with the instance as
`ctx.object`).

**Use `getOrCreate` in server code** — `get(name)` is a handle to an instance
that must already exist, and calls on a missing one fail.

### The full server object API

```bash
morgana spec server-object
```

prints every definition key, everything on `self`, the access rules, and the
`ctx.objects` API — generated from the SDK you have installed.

## Sandboxes

`ctx.server.sandbox` gives a server action a working folder. It can write files
into it, install packages, run programs, and start a server that keeps running,
with a URL. Godverse uses one to build and serve the page its editor describes.

```ts
export const preview = defineServerAction({
  handler: async (ctx) => {
    const box = await ctx.server.sandbox.open('session-42')     // made if new, kept if not
    await box.writeMany({ 'package.json': '{"type":"module"}', 'server.js': code })
    const installed = await box.install(['marked'])             // npm install marked
    if (!installed.ok) return { problems: installed.stderr }
    const result = await box.run(['node', 'check.js'])          // { ok, exitCode, stdout, stderr, timedOut }
    const server = (await box.processes()).find((p) => p.running)
      ?? await box.start(['node', 'server.js'], { port: 'auto' }) // PORT is set; waits until it answers
    return { url: server.url }
  },
})
```

- **Commands are lists of words** (`['npm', 'install']`), never a shell line. `node`, `npm` and `npx` run on the host's Node, so they behave the same on every OS.
- **A started program outlives the call.** The next action that opens the same sandbox sees it in `processes()`. `stop()` ends it, and `destroy()` also deletes the files.
- **Paths stay inside.** `../` and absolute paths are refused, and so is a link that leads out.
- **A failing program is a result, not an error.** Read `ok`. `start` throws, with the program's output, if it stops before it serves.

| Host | A sandbox is |
|---|---|
| `morgana dev` | a plain folder, `.data/sandboxes/<name>/`. No overhead and no isolation: programs run as you, so it's for your own code. Started programs stop when dev stops. |
| cloud | not available yet; it says so when an action asks. The plan is an isolated container (Cloudflare Sandbox) behind the same API. |

## Auth

The page signs people in — `ctx.auth.signUp`, `ctx.auth.signIn`,
`ctx.auth.signOut`, or a `ctx.ui.login()` object. On the server, `ctx.auth.require()` returns the user
or refuses with 401. Inside a server object method the caller is `self.caller`.
Pages and routes gate with `access` / `auth` as above.

## Rules

- **Authority lives here.** Validate in the server action or the object method,
  never only in the browser.
- **Routes avoid the reserved paths** (`/`, `/api/`, `/assets/`, `/pages/`, `/apps/`).
- **`respond` then `return null`.**
- **No Node built-ins** in server code — deployed code runs in a sandbox.

## Full surface

```bash
morgana spec server           # ctx.server: request, respond, response, collections, files, email, queue
morgana spec server-object
morgana spec ctx server
```

Next: [lifecycles and events →](05-lifecycles.md)
