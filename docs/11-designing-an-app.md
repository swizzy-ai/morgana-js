# 11 · Designing an app

Morgana has one model — actions run on events, with a `ctx` — so an app is
designed in the same order it runs. Do not start from layers, services or a
database diagram. Start from what can happen.

1. **Actions** — every verb the app has: *load the board*, *add a card*,
   *approve a draft*.
2. **Events** — the `on` that runs each one: a click, `loaded`, a route, a
   schedule, a record change, an object event.
3. **UI objects** — what each browser action reads and writes on the page.
   This tells you the pages.
4. **Server** — the server action or collection each one calls.
5. **Server objects** — last, and only where they earn it.

Write it down as one table per page before writing code. The table *is* the
design: every row becomes one action, and every column names a file.

## 1 · Actions and their events

For the team board:

| Action | Event (`on`) | UI objects | Server |
|---|---|---|---|
| `loadBoard` | `loaded` | `col-*-cards` | `openBoard` |
| `addCard` | `add-card.clicked` | `new-card` | `board.addCard` |
| `cardAdded` | `object:board/main.cards.added` | `col-*-cards` | — |
| `listCards` | `http.get /v1/cards` | — | `board.cards` |
| `logCard` | `object:board.card` | — | `activity` collection |
| `trimActivity` | `cron(0 3 * * *)` | — | `activity` collection |

Rows with UI objects are **browser actions**; rows without are **server
actions**. Every `on` must be one of the [built-in events](07-events.md); when
the verb has none, it is a server action with no `on`, called by name.

## 2 · UI objects make the pages

Group the UI column by page and you have each page's objects — the compile
action that builds it places exactly those. Name ids after the page
(`board-title`, `admin-title`); they are global.

A page does not grow objects at runtime. Anything repeated — rows, cards,
log lines — is one `list` with a content template, fed records:

```ts
// compile: the template, with *field bindings
const row = ctx.ui.text({ id: 'feed-row', content: '*name — *total' })
const feed = ctx.ui.list({ id: 'feed' })
feed.addContent(row)

// browser: set the records
ctx.ui.get('feed')!.set('data', records)
```

## 3 · Records go in collections

Most server state is records: users' items, a catalog, a ledger, a log.
Collections are durable, queryable, and every write is an event
(`store.<name>.created|updated|deleted`) other actions react to.

Prefer an **append-only ledger** to a running total when several writers touch
one number — a balance is the sum of its rows, so no write can be lost.

## 4 · Server objects, only where they earn it

Persistence is not the reason — collections persist too. Make a server object
when **one thing** has all three:

- **people watching it live** — its events reach every open browser;
- **writes that must happen one at a time** — methods are serialized and
  all-or-nothing;
- **a lifecycle of its own** — schedules, background jobs, waiting.

A board everyone edits at once is one. A chat room, a game, a running job with
an approval gate are too. A user's list of things, a catalog or a settings
record is not — those are collection rows.

When a server object also needs to be listed (every job a user has), keep an
index row in a collection and let the object update it from its own events.

## Checklist

- Every verb is an action with an `on`, or a named server action.
- Every UI object in the table is placed by one compile action.
- Every repeated thing is a `list` with a template.
- Records are collection rows; every server object has a reason from §4.
- Authority (who may do what) is in server actions and object `access`,
  never only in the browser.

Next: [back to the guide](README.md)
