# Morgana

A full-stack TypeScript framework with one small surface — **actions**,
**events** and **`ctx`** — from the page to the server. Compiled, typed end to
end, and deployed with one command.

```bash
npx @studiomorgana/cli init my-app
cd my-app && npm install
npx morgana dev          # http://localhost:4317
npx morgana deploy
```

`morgana init` installs **[`@studiomorgana/helpers`](packages/helpers)** with the
SDK. Read its README and use it — pages are written as sentences
(`create · place · make · set · fill · when · animate · theme`), and its
**bricks** (`repeat`, `cells`, `segmented`, `rows`, `onlyWhile`) exist so
application code never hand-writes `for`/`forEach` loops or grows its own
helper list. Reach for a brick before writing one.

```ts
// A button click in the browser, a durable object on the server, one model.
export const addCard = defineClientAction({
  config: { on: 'add-card.clicked' },
  handler: async (ctx) => {
    const text = String(ctx.ui.get('new-card')!.get('value') ?? '')
    await ctx.objects.board.get('main').addCard({ text })
  },
})

// An HTTP route is an action too.
export const listCards = defineServerAction({
  config: { on: 'http.get /v1/cards' },
  handler: async (ctx) => (await ctx.objects.board.getOrCreate('main')).cards(),
})
```

## Learn

- **[The guide](docs/README.md)** — the model, apps and pages, client objects,
  the backend (HTTP routes, responses, server rendering, server objects),
  lifecycles, custom objects, events, types, and a full example.
- **`morgana spec`** — the complete API, generated from the SDK you have
  installed: `morgana spec server-object`, `morgana spec ui button`,
  `morgana spec events`.
- **[`examples/team-board`](examples/team-board)** — the guide's running example.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how it works inside.

Every new project gets an `AGENTS.md`, so coding agents build with Morgana
correctly from the first prompt.

## What an app gets

- **Auth for your users**, separate from Morgana accounts: server `ctx.auth`
  (`require`, `signIn/signUp`, roles, password reset, email verification) and
  client `ctx.auth` (`signIn/signUp/signOut`, Google sign-in). Sessions are an
  HttpOnly cookie. Gate pages with `access: 'member' | { role }`.
- **Server:** collections, files, queues, `ctx.server.email`, secrets,
  `respond()` and streaming, cron and store triggers, channels.
- **Server objects:** named, durable instances with their own state and
  tables, methods (including streaming ones), schedules and background jobs;
  the same typed `ctx.objects` on the server and in the browser.
- **Pages:** static, SPA or server-rendered; `products/:id` routes; every
  component kind styled by props (hover/focus/active states, themes, dark
  mode). Several apps per project.
- **Types:** `morgana types` types `ctx.actions.run`, `ctx.objects` and your
  custom UI kinds from your own code.
- **Hosting:** each project at its own subdomain, plus DNS-verified custom
  domains.

## Commands

| Command | Does |
|---|---|
| `morgana init [name]` | scaffold a project |
| `morgana dev` | compile, serve on :4317, recompile on change |
| `morgana build` | compile to `dist/` |
| `morgana types` | generate `.morgana/` types for actions, server objects and custom objects |
| `morgana artifacts list\|dump\|push` | what the project's plugins build; export it; upload it ahead of a deploy |
| `morgana spec [topic]` | print the API surface |
| `morgana deploy` | build, upload new artifacts, publish, verify (`--dry-run` shows the plan) |
| `morgana login` / `logout` | sign in via the browser / forget the token |
| `morgana status` | what the cloud holds for this project |
| `morgana secrets set\|list\|remove` | secrets server actions read with `ctx.vars.get()` |
| `morgana domains add\|verify\|list\|remove` | serve the project at a hostname you own |
| `morgana eject` | a plain React + Express codebase with no framework trace |

## Packages

| Package | What it is |
|---|---|
| [`@studiomorgana/sdk`](packages/sdk) | the developer interface — contexts, objects, contracts, config |
| [`@studiomorgana/helpers`](packages/helpers) | write UI as sentences — `create place make set fill when go theme animate`, plus compound **bricks** (repeat, cells, segmented, rows, onlyWhile) |
| [`@studiomorgana/cli`](packages/morgana-cli) | the `morgana` command |
| [`@studiomorgana/assets`](packages/assets) | the first plugin: 2D and 3D assets with animations, written in words |
| [`@studiomorgana/sdk-compile`](packages/sdk-compile) | the compiler |
| [`@studiomorgana/agents`](packages/morgana-agents) | the agent loop behind `ctx.agents` |
| [`@studiomorgana/wizard`](packages/wizard) | durable multi-step AI workflows behind `ctx.ai` wizards |
| [`@studiomorgana/eject`](packages/morgana-eject) | `morgana eject` |

## Status

Published as `0.7.0`. `init → dev → build → deploy` work end to end; the same
full-stack scenarios run on `morgana dev` and a real worker in CI.

## Licence

Apache-2.0.
