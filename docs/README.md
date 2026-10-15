# Morgana guide

Morgana is a full-stack TypeScript framework: one small surface — **actions**,
**events** and **`ctx`** — from the page to the server, compiled, and deployed
with one command.

Read in order the first time. Every example is from
[`examples/team-board`](../examples/team-board), a real project that CI builds
and typechecks — so the snippets compile.

| # | Section | You will learn |
|---|---|---|
| 0 | [Why Morgana](00-why-morgana.md) | What it is for, and what it is not |
| 1 | [Actions, events, ctx](01-core.md) | The whole programming model |
| 2 | [Apps and pages](02-apps-and-pages.md) | Several apps in one project, routing, access |
| 3 | [Client objects](03-client-objects.md) | Building the UI, styling with props, binding to data |
| 4 | [The backend](04-backend.md) | Server actions, HTTP routes, responses, server rendering, collections, server objects |
| 5 | [Lifecycles and events](05-lifecycles.md) | When everything runs, in one timeline |
| 6 | [Custom objects](06-custom-objects.md) | Your own UI kinds |
| 7 | [Built-in events](07-events.md) | Every `on` you can write |
| 8 | [Types](08-types.md) | `morgana types` and contracts |
| 9 | [The full example](09-example.md) | The team board, start to finish, deployed |
| 10 | [Fonts and assets](10-fonts-and-assets.md) | Google and self-hosted fonts, the type scale, weights, tracking, outlines; the `assets/` folder |
| 11 | [Designing an app](11-designing-an-app.md) | The order to plan in: actions, events, UI objects, server, then server objects |

## The docs explain; `morgana spec` lists

Every option of every API is in `morgana spec`, generated from the SDK you
have installed — so it is never out of date:

```bash
morgana spec                  # topics
morgana spec server-object    # defineServerObject, self, access, ctx.objects
morgana spec server           # ctx.server: request, responses, collections, email…
morgana spec ui button        # one kind's props and handle
morgana spec events           # every `on` selector
morgana spec --all            # everything, one document
```

These pages never list every prop or method. When you need the full surface,
the section tells you which `spec` to run.
