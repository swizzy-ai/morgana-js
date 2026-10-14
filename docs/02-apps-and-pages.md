# 2 · Apps and pages

A project can hold several **apps**. An app is a named group of pages with its
own identity — a customer site and an admin console, or a web app and a
desktop app. Apps in one project share everything behind them: server actions,
server objects, collections, auth, and one deploy.

```ts
// src/actions/compile/apps.ts
export const apps = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('board', { displayName: 'Team Board' })
    ctx.apps.create('admin', { displayName: 'Team Board Admin' })

    const login = ctx.ui.pages.create({ name: 'login', address: 'login' })
    login.app('board')
    login.place(ctx.ui.login({ id: 'login-form' }))

    const admin = ctx.ui.pages.create({
      name: 'admin',
      address: 'admin',
      access: { role: 'admin' },   // who may see it
      redirect: 'login',           // where everyone else goes
    })
    admin.app('admin')
    // …
    return { ok: true }
  },
})
```

`morgana.config.ts` names the entry page:

```ts
export default defineConfig({ name: 'team-board', entry: 'board' })
```

## Pages

`ctx.ui.pages.create({ name, address, … })` in a compile action makes a page;
`page.app(name)` attaches it to an app; `page.place(object)` puts objects on it.

| Option | Meaning |
|---|---|
| `address` | The path: `'/'`, `'admin'`, `'cards/:id'` (params) |
| `access` | `'public'` (default), `'member'` (signed in), or `{ role: 'admin' }` |
| `redirect` | Where a visitor without access is sent — a page name or URL |
| `render: 'server'` | Rendered per request by a server action — see [server rendering](04-backend.md#server-rendering-fetch-then-render) |

Access is enforced by the host before the page is served — the HTML of a
gated page never reaches a visitor who may not see it.

## Rules

- **Every page belongs to an app.** A page with no app compiles but is not
  deployed.
- **Page and object ids are global to the project**, across all apps. Prefix
  shared ids per page (`admin-title`, `board-title`).
- **`/` and the prefixes `/api/`, `/assets/`, `/pages/`, `/apps/`** belong to
  the host. Pages live at their `address`; HTTP routes must avoid these.

## Full surface

```bash
morgana spec apps
morgana spec pages
```

Next: [client objects →](03-client-objects.md)
