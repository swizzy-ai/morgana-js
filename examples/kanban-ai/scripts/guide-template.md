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

<!-- SOURCE -->

## Extend it

- **A fourth column:** add a `kanbanColumn` in `board-page.ts`, a constant in
  `client/board.ts`, and a column name the server accepts (it is a string, so
  nothing else changes).
- **A second model call:** copy `plan-card.ts`. Keep the fallback, so the feature
  still answers offline.
- **Sharing a board:** the object is named `main`. Name it per board id and pass the
  id to `getOrCreate`.
- **Deploy:** `npx morgana deploy` sends the code and the project secrets to the worker.
