# 0 · Why Morgana

Modern apps are full stack by default: a page, an API, a database, live
updates, background work, auth. Most stacks give each of those its own
framework, its own config and its own deployment, and you spend your time on
the seams.

Morgana is one surface for all of it.

- **One model.** Everything you write is an *action*: a function that runs when
  an *event* happens, given a `ctx` that is everything it can do. A button
  click, an HTTP request, a cron tick and a database write are all events.
- **Compiled, not configured.** `morgana build` reads your actions and emits a
  static site, a client runtime and sandboxed server code. There is no router
  file, no template language, no bundler config.
- **Durable state built in.** *Server objects* are named instances — a board, a
  chat room, a cart — with their own state, tables and methods, reachable the
  same way from the server and the browser, live.
- **One command to ship.** `morgana deploy` builds, uploads and verifies.
  `morgana dev` runs the same model locally.
- **Built for agents as much as people.** A small, regular surface; types
  generated from your code (`morgana types`); the full API one command away
  (`morgana spec`); and an `AGENTS.md` in every new project.

## What it is not

- Not a component library on React. Pages compile to HTML and a small runtime;
  there is no virtual DOM.
- Not a styling system with classes. Objects are styled with typed props and
  `make()` words — `class` and `style` are never used.
- Not Node on the server. Deployed server code runs in a sandbox: no `fs`, no
  Node built-ins. The build warns when one sneaks in.

## Start

```bash
npx @studiomorgana/cli init my-app
cd my-app && npm install
npx morgana dev          # http://localhost:4317
npx morgana deploy       # when you are ready
```

Next: [the core model →](01-core.md)
