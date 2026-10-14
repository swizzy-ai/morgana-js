# 9 · The full example: a team board

Everything in this guide, in one app: [`examples/team-board`](../examples/team-board).

- a **live board** — add a card, and every open browser shows it
- a **server object** holding the board's state and cards
- a **custom object** for the columns
- **two apps** — the board and an admin console — sharing one backend
- a **typed JSON API**, a **CSV export**, and a **server-rendered** card page
- a **server trigger** writing an activity log, and a **nightly cron** trimming it

## The files

```
morgana.config.ts
src/
  server-objects/
    board.ts              state, the cards table, methods, access, reactions
  objects/
    kanban-column.ts      a custom UI kind: ctx.ui.kanbanColumn
  actions/
    compile/
      apps.ts             two apps, the login and admin pages
      board-page.ts       the board page, and the server-rendered card page
      stores.ts           the activity collection
    client/
      board.ts            load the board, add a card, live updates
    server/
      open-board.ts       called by name: create-or-open the board (typed)
      create-card.ts      POST /v1/cards — validation, 400, 201 (typed)
      cards-api.ts        GET /v1/cards, GET /v1/cards.csv
      card-page.ts        GET /cards/:id — fetch, fill, render
      activity.ts         object:board.card → activity log; nightly cron
```

## How it fits together

1. **Build.** `apps` and `boardPage` make two apps and four pages. The board
   page holds an input, a button and three `kanbanColumn`s; its title is bound
   to `object:board/main.label`.
2. **Load.** On `loaded`, the browser calls `openBoard` by name. That server
   action `getOrCreate`s the board — the browser itself may not create one,
   because `create` is not in the object's `access` — and returns the cards.
3. **Add.** `add-card.clicked` calls `board.addCard` from the browser. The
   method checks the text, writes the card, and emits `card`. The `cards.added`
   reaction bumps `cardCount`, which changes `label`, so every bound title
   updates.
4. **Live.** Every browser on the board runs `cardAdded` on
   `object:board/main.cards.added` and appends the card.
5. **Server side.** `object:board.card` runs `logCard`, which writes to the
   `activity` collection; `cron(0 3 * * *)` trims it nightly.
6. **API.** `POST /v1/cards` requires a member (401 otherwise), answers 400 on
   empty text, 201 with the card. `GET /v1/cards.csv` answers `text/csv` as a
   download.
7. **Server rendering.** `GET /cards/:id` loads the card, fills the page and
   returns the HTML — or a 404.

## Run it

```bash
cd examples/team-board
npx morgana dev
```

```bash
curl localhost:4317/v1/cards
curl -X POST localhost:4317/v1/cards -d '{"text":"x"}' -H 'content-type: application/json'   # 401
curl localhost:4317/v1/cards.csv
```

## Check it

```bash
npm run typecheck       # morgana types && tsc --noEmit
```

## Ship it

```bash
npx morgana login
npx morgana deploy
```

`deploy` builds, uploads, and checks that every page and asset serves. The same
code runs in the cloud: server actions in a sandbox, each board its own durable
instance.
