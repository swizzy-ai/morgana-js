# Building with Morgana

This is a Morgana project: a full-stack TypeScript app built from **actions**
(functions), **events** (`config.on` — when they run) and **`ctx`** (everything
they can do). Read this before writing code here.

## Look things up, don't guess

```bash
npx morgana spec                 # topics
npx morgana spec server-object   # full server object API
npx morgana spec server          # ctx.server: requests, responses, collections, email…
npx morgana spec ui <kind>       # one UI kind's props and handle (ui button, ui table…)
npx morgana spec events          # every valid `on`
npx morgana spec --all           # everything
```

`spec` is generated from the installed SDK, so it is exact. Guide:
https://github.com/swizzy-ai/morgana-js/tree/main/docs

## Design before code

Plan in Morgana's order, one table per page, before writing files:

1. **Actions** — every verb (load the list, add an item, approve).
2. **Event** — the `on` that runs each one.
3. **UI objects** — what each browser action reads and writes (this gives the pages).
4. **Server** — the server action or collection each calls.
5. **Server objects** — last: only for a thing people watch live, that takes
   concurrent writes and has its own lifecycle. Records are collection rows.

Repeated things (rows, log lines) are one `list` with a content template
(`list.addContent(template)`, `*field` bindings), fed with `set('data', records)`.

## Commands

```bash
npx morgana dev          # http://localhost:4317, recompiles on save
npx morgana types        # regenerate .morgana/ types (dev and build do it too)
npm run typecheck        # morgana types && tsc --noEmit — run before you finish
npx morgana build
npx morgana deploy
```

## Where things go

```
morgana.config.ts
src/actions/compile/   defineClientAction, on: 'compile'  — make apps, pages, objects (build time)
src/actions/client/    defineClientAction, on: '<id>.clicked' | 'loaded' | …  — runs in the browser
src/actions/server/    defineServerAction — http routes, cron, triggers, or called by name
src/server-objects/    defineServerObject — durable state + methods, ctx.objects.<camelName>
src/objects/           createCustomObject — your own UI kinds, ctx.ui.<camelName>
```

## Patterns

```ts
// compile: create and place
const page = ctx.ui.pages.create({ name: 'home', address: '/' })
page.app('main')
const save = ctx.ui.button({ id: 'save', label: 'Save' })
page.place(save)

// browser: react, read, write
export const onSave = defineClientAction({
  config: { on: 'save.clicked' },
  handler: async (ctx) => { ctx.ui.get('status')?.set('content', 'Saved') },
})

// server: an HTTP route
export const list = defineServerAction({
  config: { on: 'http.get /v1/items' },
  handler: async (ctx) => ctx.server.collections.query('items'),
})

// server: call by name from anywhere — ctx.actions.run('openThing', {})
export const openThing = defineServerAction({ handler: async (ctx) => ({ ok: true }) })

// server rendering: page has render: 'server'; its route action fills it, then renders
return ctx.ui.pages.render('card')
```

## Rules — these are where builds and deploys fail

- **Styling is props only.** `pad`, `gap`, `bg`, `radius`, `layout`, `font`… and
  `make('card')`. Never `class`, never `style`.
- **Text:** `font` is the type scale — `display-lg display h1 h2 h3 h4 h5 h6
  headline title subtitle body-lg body body-me body-sm caption mono`. `family`
  is a font declared in `morgana.config.ts` `fonts` (Google fonts are
  self-hosted at build). `fontWeight: 'semibold'`, `tracking: 'tight'`,
  `stroke: { width, color }` adjust it. Never load a font with CSS.
- **Assets:** files in `assets/` are served at `/assets/…`; build URLs with
  `ctx.assets.url('img/x.png')`.
- **Object ids are global to the project.** Duplicate id = build error. Prefix
  per page; inside a custom object derive child ids from `ctx.id`.
- **Create objects only in compile actions.** At runtime, `ctx.ui.get(id)` and
  `get` / `set` / `setProps`.
- **HTTP routes never use `/`, `/api/`, `/assets/`, `/pages/`, `/apps/`** — the
  host owns them (build error). Use e.g. `/v1/...`.
- **After `ctx.server.respond(...)`, `return null`.**
- **No Node built-ins in server code** (`fs`, `node:crypto`…). Deployed server
  code runs in a sandbox.
- **Server code uses `getOrCreate`** for server objects; `get(name)` fails if the
  instance does not exist.
- **A server object's `access` is what a browser may do.** Unlisted = server
  only. Validate inside methods.
- **Custom object `methods` exist only in the browser**, not on the handle a
  compile action gets.
- **`on` accepts only the shapes in `morgana spec events`.** A made-up event
  name is a build error.
- **`loaded` fires on every page** — check you are on yours first.
- **Type calls with a `Contract`** exported from the action's file (one action
  per file). Run `npm run typecheck` before finishing.
