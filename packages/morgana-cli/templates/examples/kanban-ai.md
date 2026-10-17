# Example: a kanban board with a live backend and AI planning

This is a complete Morgana project, written so an agent can copy its shape. It is a
three-column board (To do, Doing, Done) with:

- **A backend:** a board server object with its own table. Changes are transactions,
  and every open browser hears them live.
- **An AI feature:** "Plan with AI" asks the model to split a goal into tasks, on the
  server, with a fallback when no model is set.
- **Accounts:** writes need a signed-in visitor. Reads are public.
- **The Swizzy look:** ink-dark surfaces, one orange accent, Fraunces headings and
  IBM Plex Sans body text, all set in props and in `morgana.config.ts`.

The source below is the example in `examples/kanban-ai` in the morgana-js repo. It
builds and typechecks as it is.

## Run it

Start from a fresh project, then copy this example over it:

```bash
npx @studiomorgana/cli init my-board
cd my-board
# copy morgana.config.ts and src/ from below over the generated ones
# keep the generated package.json, which already has the right dependencies
npm install
npx morgana dev          # http://localhost:4317, recompiles on save
npx morgana types        # regenerate .morgana/ types after changing the objects
npm run typecheck        # types, then tsc --noEmit
```

For the AI feature, set a model key in the environment:

```bash
ANTHROPIC_API_KEY=... npx morgana dev    # or OPENAI_API_KEY, with MORGANA_LLM_PROVIDER=openai
```

Without a key, planning still works: it splits the goal on punctuation instead.

## How the pieces fit

| Piece | Where | Runs on | Does |
|---|---|---|---|
| Config | `morgana.config.ts` | build | Entry page, fonts, type scale |
| Page | `actions/compile/board-page.ts` | build | Describes the screen once |
| App and login | `actions/compile/apps.ts` | build | Groups pages; sign-in |
| Custom kind | `objects/kanban-column.ts` | build | A reusable `ctx.ui` kind |
| Backend | `server-objects/board.ts` | server | Cards: durable state and methods |
| Server actions | `actions/server/*.ts` | server | Named calls, and the AI feature |
| Browser actions | `actions/client/board.ts` | browser | React to clicks and live events |

Read the table as a rule: **compile** code creates things, **server** code changes
data, **browser** code reacts. A browser action never writes to the database.

## Rules this example relies on

These are the rules an agent most often gets wrong. Each one is shown in the code.

1. **Styling is props only.** `bg`, `color`, `radius`, `border`, `pad`, `gap`,
   `layout`, `font`. Never `class` or `style`. `layoutWrap` is not a prop.
2. **Ids are project-global.** A custom kind derives its child ids from `ctx.id`
   (`${ctx.id}-title`), so two columns never clash.
3. **Create kinds only at compile time.** At runtime, look them up with `ctx.ui.get(id)`
   and change them with `set` and `setProps`.
4. **Fonts go in config, not in pages.** `fonts` declares them, `text` maps body and
   heading steps to them. A page only picks a step (`font: 'h2'`).
5. **`config.auth` guards HTTP routes only.** A named action (called by
   `ctx.actions.run`) must check the session itself with `ctx.auth.require()`.
   `plan-card.ts` and `move-next.ts` do this.
6. **Object access is a list.** `access` says what a browser may call. Anything not
   named is server-only. `addCard` and `moveCard` are `member`.
7. **A method that changes data throws on bad input.** It does not return an error
   value. The caller sees the message.
8. **Reactions run inside the change.** The `on` block in `board.ts` keeps
   `cardCount` correct, in the same transaction as the add or remove.
9. **Live events come from the object.** `object:board/main.cards.added` fires for
   any browser's change. A move does not fire these, so `moveNext` on the page
   redraws directly.
10. **One action per file for a `Contract`.** The exported `Contract` types the
    input and output for every caller, so a wrong field is a build error.

## The source

### `morgana.config.ts`

Project settings: the entry page, fonts and the type scale. Fonts are declared here, never in a page.

```ts
import { defineConfig } from '@studiomorgana/sdk'

/**
 * The project's settings. Everything an agent needs to know about fonts and
 * the type scale lives here, so nothing is decided in the pages themselves.
 */
export default defineConfig({
  name: 'kanban-ai',
  // The page the visitor lands on. Pages are created in src/actions/compile/.
  entry: 'board',
  // Fonts are downloaded at build time and served from /assets. Visitors never
  // call Google. Pick any family on fonts.google.com and list its weights.
  fonts: {
    brand: { google: 'IBM Plex Sans', weights: [400, 500] },
    display: { google: 'Fraunces', weights: [600, 700] },
  },
  // Body text uses `brand`; every heading step (h1–h6, display…) uses `display`.
  text: { body: 'brand', headings: 'display' },
})
```

### `src/server-objects/board.ts`

The backend. A server object: durable state, its own table, methods that are transactions, and live events.

```ts
import { defineServerObject } from '@studiomorgana/sdk'

/**
 * A board is a server object: one durable instance per board, named `main`
 * here. It owns its own `cards` table, and its methods are transactions — two
 * people moving the same card at once cannot corrupt it.
 *
 * Every browser subscribed to the board hears each change live (the page's
 * `object:board/main.cards.*` events, see src/actions/client/board.ts).
 */
export default defineServerObject({
  name: 'board',
  state: { title: 'Kanban', cardCount: 0 },
  collections: {
    cards: {
      columns: [
        { name: 'text', type: 'string' },
        // One of: todo, doing, done. A string on purpose, so a new column is a
        // constant in the page, not a schema migration.
        { name: 'column', type: 'string' },
      ],
    },
  },
  // A value derived from state, read by the page with `bind('object:board/main.label')`.
  computed: {
    label: (s) => `${s.title} · ${s.cardCount} cards`,
  },
  // What a browser may do. Anything not named is server-only.
  // `member` means a signed-in visitor (see the login page in apps.ts).
  access: {
    read: 'public',
    subscribe: 'public',
    cards: 'public',
    addCard: 'member',
    moveCard: 'member',
  },
  // Reactions run in the same transaction as the change that caused them.
  on: {
    'cards.added': (self) => self.set({ cardCount: self.state.cardCount + 1 }),
    'cards.removed': (self) => self.set({ cardCount: self.state.cardCount - 1 }),
  },
  methods: {
    /** The cards, oldest first. `column` narrows it to one column. */
    cards: async (self, p: { column?: string } = {}) =>
      self.db.cards.query({ where: p.column ? { column: p.column } : undefined, sort: { field: 'createdAt' } }).items,

    /** A new card goes to `todo` unless told otherwise. */
    addCard: async (self, p: { text: string; column?: string }) => {
      const text = p.text.trim()
      if (!text) throw new Error('a card needs text')
      return self.db.cards.add({ text: text.slice(0, 280), column: p.column ?? 'todo' })
    },

    /** Move one card to another column. Throws when the card is gone. */
    moveCard: async (self, p: { id: string; column: string }) => {
      const card = self.db.cards.update(p.id, { column: p.column })
      if (!card) throw new Error(`no card ${p.id}`)
      return card
    },
  },
})
```

### `src/objects/kanban-column.ts`

A custom UI kind. Built from built-in kinds once, then used like any other `ctx.ui` kind.

```ts
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
```

### `src/actions/compile/apps.ts`

The app and its login page. Member-only actions and objects need the visitor signed in here.

```ts
import { defineClientAction } from '@studiomorgana/sdk'

/**
 * The app and its login page. An app groups pages under one address and one
 * auth. `member` actions and objects need a signed-in visitor, and that sign-in
 * happens here.
 */
export const apps = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('board', { displayName: 'Kanban' })

    const login = ctx.ui.pages.create({ name: 'login', address: 'login' })
    login.app('board')
    login.place(ctx.ui.login({ id: 'login-form' }))

    return { ok: true }
  },
})
```

### `src/actions/compile/board-page.ts`

The page, built at compile time. Layout is rows and columns of kinds, styled with props only.

```ts
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
```

### `src/actions/server/open-board.ts`

A server action called by name from the browser, with a typed Contract.

```ts
import { defineServerAction } from '@studiomorgana/sdk'

/**
 * A server action with no `on` is called by name: the browser calls it with
 * `ctx.actions.run('openBoard', {})`. It runs on the server, so it may create the
 * board the first time anyone opens the page.
 *
 * `Contract` is the typed shape of its input and output. Every caller gets
 * those types, so a wrong field name is a build error, not a runtime surprise.
 */
export interface Contract {
  input: Record<string, never>
  output: { label: string; cards: Array<{ id: string; text: string; column: string }> }
}

export const openBoard = defineServerAction({
  handler: async (ctx): Promise<Contract['output']> => {
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Kanban' })
    const [state, cards] = await Promise.all([board.state(), board.cards()])
    return { label: state.label, cards: cards.map((c) => ({ id: c.id, text: c.text, column: c.column })) }
  },
})
```

### `src/actions/server/plan-card.ts`

The AI feature. `ctx.ai.generateText` runs on the server; the key never reaches the browser.

```ts
import { defineServerAction, type ServerContext } from '@studiomorgana/sdk'

/**
 * The AI feature, as a server action.
 *
 * It asks the model to split a goal into 3–5 short tasks, one per line, then adds
 * each to the To do column. The model is `ctx.ai`. The key is read from the environment, so the browser never sees it:
 * ANTHROPIC_API_KEY or OPENAI_API_KEY, with MORGANA_LLM_PROVIDER choosing the provider.
 *
 * With no model reachable, the goal is split on punctuation instead. The feature
 * always answers, so the page can be tested offline.
 *
 * Planning creates data, so only a signed-in visitor may call it. `ctx.auth.require()`
 * checks that here. `config.auth` would not: it only guards HTTP routes, and this
 * action is called by name from the browser.
 */
export interface Contract {
  input: { text: string }
  output: { steps: string[] }
}

export const planCard = defineServerAction<ServerContext<Contract>>({
  config: {},
  handler: async (ctx) => {
    // config.auth only guards HTTP routes. A named action checks the session itself.
    ctx.auth.require()
    const text = String(ctx.args.text ?? '').trim().slice(0, 2000)
    if (!text) throw new Error('describe the goal first')

    let steps: string[]
    try {
      const answer = await ctx.ai.generateText({
        instructions: [
          'Split this goal into 3 to 5 short, concrete tasks a person can do.',
          'Answer with one task per line. No numbers, no bullets, no preamble.',
          `Goal: ${text}`,
        ].join('\n'),
        maxTokens: 300,
      })
      steps = answer
        .split('\n')
        .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 5)
    } catch {
      // No model reachable: fall back to splitting the goal itself.
      steps = fallbackSteps(text)
    }
    if (!steps.length) steps = fallbackSteps(text)

    const board = await ctx.objects.board.getOrCreate('main', { title: 'Kanban' })
    for (const step of steps) await board.addCard({ text: step, column: 'todo' })
    return { steps }
  },
})

/** Offline plan: each clause of the goal becomes a task, with a wrap-up task at the end. */
function fallbackSteps(goal: string): string[] {
  const parts = goal.split(/[.;\n]+|,\s+/).map((p) => p.trim()).filter((p) => p.length > 2)
  const steps = parts.length > 1 ? parts.slice(0, 4) : [goal, `Check the result of "${goal.slice(0, 60)}"`]
  return [...steps, 'Review and close the goal'].slice(0, 5)
}
```

### `src/actions/server/move-next.ts`

A member-only server action that changes data. It checks sign-in in code.

```ts
import { defineServerAction, type ServerContext } from '@studiomorgana/sdk'

/**
 * Move the oldest card from one column to another. The server decides which card
 * moves, so two people pressing at once cannot move the same one twice.
 */
export interface Contract {
  input: { from: string; to: string }
  output: { moved: string | null }
}

export const moveNext = defineServerAction<ServerContext<Contract>>({
  config: {},
  handler: async (ctx) => {
    // config.auth only guards HTTP routes. A named action checks the session itself.
    ctx.auth.require()
    const { from, to } = ctx.args
    const board = await ctx.objects.board.getOrCreate('main', { title: 'Kanban' })
    // `cards` is sorted oldest first, so the first one in `from` is the oldest.
    const oldest = (await board.cards({ column: from }))[0]
    if (!oldest) return { moved: null }
    await board.moveCard({ id: oldest.id, column: to })
    return { moved: oldest.text }
  },
})
```

### `src/actions/client/board.ts`

Browser actions. Each answers one event, and every write goes through the server.

```ts
import { defineClientAction, type ClientContext } from '@studiomorgana/sdk'

/**
 * Browser actions: they run on the visitor's device and answer one event each.
 * Anything that changes data calls a server object method or a server action.
 * Nothing here writes to the database directly.
 */

const COLUMNS = ['todo', 'doing', 'done'] as const

/** Draw the three columns from the server's current cards. */
async function refresh(ctx: ClientContext) {
  const { cards } = await ctx.actions.run('openBoard', {})
  for (const col of COLUMNS) {
    const list = ctx.ui.get(`col-${col}-cards`)
    // Each card is one bullet line. Empty columns show nothing.
    list?.set('content', cards.filter((c) => c.column === col).map((c) => `• ${c.text}`).join('\n'))
  }
}

function say(ctx: ClientContext, text: string) {
  ctx.ui.get('status')?.set('content', text)
}

/** Fill the board once, when the page loads. */
export const loadBoard = defineClientAction({
  config: { on: 'loaded' },
  handler: async (ctx) => {
    if (!ctx.ui.get('col-todo-cards')) return // another page
    await refresh(ctx)
  },
})

/** Add a task by hand. The server object does the writing. */
export const addCard = defineClientAction({
  config: { on: 'add-card.clicked' },
  handler: async (ctx) => {
    const input = ctx.ui.get('new-card')!
    const text = String(input.get('value') ?? '').trim()
    if (!text) return say(ctx, 'Write a task first.')
    try {
      await ctx.objects.board.get('main').addCard({ text })
      input.set('value', '')
      say(ctx, `Added "${text}" to To do.`)
    } catch (err) {
      say(ctx, `Could not add it: ${(err as Error).message}`)
    }
  },
})

/**
 * The AI row. The server asks the model to split the goal and adds each task to
 * To do. The page only shows how many it made.
 */
export const planWithAi = defineClientAction({
  config: { on: 'plan-card.clicked' },
  handler: async (ctx) => {
    const input = ctx.ui.get('plan-text')!
    const text = String(input.get('value') ?? '').trim()
    if (!text) return say(ctx, 'Describe a goal first.')
    say(ctx, 'Planning…')
    try {
      const { steps } = await ctx.actions.run('planCard', { text })
      input.set('value', '')
      say(ctx, `Planned ${steps.length} tasks.`)
    } catch (err) {
      say(ctx, `Could not plan it: ${(err as Error).message}`)
    }
  },
})

/** Move the oldest To do card to Doing, or the oldest Doing card to Done. */
export const startNext = defineClientAction({
  config: { on: 'start-next.clicked' },
  handler: (ctx) => moveNext(ctx, 'todo', 'doing'),
})

export const finishNext = defineClientAction({
  config: { on: 'finish-next.clicked' },
  handler: (ctx) => moveNext(ctx, 'doing', 'done'),
})

async function moveNext(ctx: ClientContext, from: string, to: string) {
  try {
    const { moved } = await ctx.actions.run('moveNext', { from, to })
    // A move does not fire the add/remove events above, so redraw here.
    await refresh(ctx)
    say(ctx, moved ? `Moved "${moved}" to ${to === 'doing' ? 'Doing' : 'Done'}.` : 'Nothing to move.')
  } catch (err) {
    say(ctx, `Could not move it: ${(err as Error).message}`)
  }
}

/**
 * Live: when any browser adds, moves or removes a card, every open board redraws.
 * The events come from the board object that holds the cards, so this page
 * hears its changes whoever made them.
 */
export const cardsChanged = defineClientAction({
  config: { on: ['object:board/main.cards.added', 'object:board/main.cards.removed'] },
  handler: (ctx) => refresh(ctx),
})
```


## Extend it

- **A fourth column:** add a `kanbanColumn` in `board-page.ts`, a constant in
  `client/board.ts`, and a column name the server accepts (it is a string, so
  nothing else changes).
- **A second model call:** copy `plan-card.ts`. Keep the fallback, so the feature
  still answers offline.
- **Sharing a board:** the object is named `main`. Name it per board id and pass the
  id to `getOrCreate`.
- **Deploy:** `npx morgana deploy` sends the code and the project secrets to the worker.
