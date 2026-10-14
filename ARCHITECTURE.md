# Morgana — architecture

How Morgana works inside: the build, the runtimes, the cloud worker, and the
deploy and auth design. For building apps, read the [guide](docs/README.md).

## How a build works

`morgana build` (or `compileProject()`) runs in this order:

1. **Scan.** Read `morgana.config.ts` and discover every action file, extracting
   each one's `config` and handler shape from the TypeScript AST.
2. **Discover custom objects.** Load each component definition in Node so its
   `define` and `methods` are callable.
3. **Run compile actions, in order.** Each bundles to CommonJS and is evaluated
   in-process with real `require`, so a helper importing a Node built-in works
   exactly as it would on disk. What it returns is the page IR.
4. **Bundle runtime actions.** Compile lane is done; now server and client actions
   are bundled per lane.
5. **Emit.**

```
dist/
  manifest.json           content hash, entry page, page list
  pages/home.html         one element per line
  assets/style.css        design tokens and layout
  assets/client.js        page runtime + browser actions + components
  server/actions/*.js     one self-contained ES module per action
  server/apis.json        declared routes
  server/stores.json      collection shapes
  server/triggers.json    cron and store hooks
```

### One esbuild profile per lane

`platform` and `format` are chosen per lane, and the choice is load-bearing:

| Lane | platform | format | Why |
|---|---|---|---|
| compile | `node` | `cjs` | evaluated in-process via `new Function` |
| server | `node` | `esm` | one self-contained file, deployed |
| client | `browser` | `iife` | one pass over every browser action |

Imports are real. An action may import siblings, shared helpers and third-party
packages from `node_modules`; esbuild resolves and inlines the whole graph.

`@studiomorgana/sdk` is never resolved from your project — your actions import it for
its factories, which are identity helpers, and for types. The compiler redirects
those specifiers to the SDK's own source so a value import gets the real
implementation rather than a stand-in. This is why the SDK ships its `src/`.

### The compile/server split has one sharp edge

The server lane bundles with `platform: 'node'`, which is right for *resolution*
but also leaves Node built-ins external. So `import { createHash } from
'node:crypto'` survives into the emitted module as a bare import. Under
`morgana dev` that file is imported by Node and resolves. The worker evaluates
the module body inside a function, where `import` is a SyntaxError.

The build warns:

```
warning  node:crypto is a Node built-in. This works in `morgana dev` and will fail on deploy.
```

It is a warning and not an error because the action is valid locally and the
compiler cannot know whether you will ship it. The deploy reaches the same
warning, since deploy builds first.

## The runtime

### Client

`assets/client.js` carries the page runtime, every browser action, and every
component that has runtime behaviour. A component that is only a `define` ships
no code at all — it compiles to plain objects in the HTML.

### Server

A deployed server action does not run in Node. It runs inside a **QuickJS WASM
sandbox** in a Durable Object, which exists because Cloudflare Workers forbids
`eval` and `new Function`. The sandbox gets `console` and the action's `ctx`, and
nothing else — no module loader, no `crypto`, no `fs`. Every import is inlined at
build time because there is no way to resolve one at runtime.

### Stores

Collections are SQLite inside a Durable Object, so reads and writes are not
metered. One table per collection, records as JSON plus a sort column, which keeps
the schema a function of the declared shape rather than of migrations.

## The backend

`morgana-server` is a private Cloudflare Worker. It is never published and is not
part of your project's dependencies.

```
KV                        durable state: deploys, projects, auth, trigger indexes
PROJECT_ACTIONS (DO)      runs server actions in the QuickJS sandbox
PROJECT_STORES  (DO)      SQLite collections
PROJECT_EVENTS  (DO)      channels, history, SSE subscribers
PROJECT_CHANNELS (DO)     channel ACLs
PROJECT_OBJECTS (DO)      custom objects
AI                        Workers AI binding
```

Two decisions worth knowing, because both were learned the hard way:

**Enumeration is never metered.** `KV.list()` allows 1,000 calls per day *per
account* on the free plan. A scheduled trigger that enumerated triggers once a
minute exhausted the whole account in 45 minutes and silently broke deploys for
every project. Sets are therefore index keys — `deploys:{env}:{pid}::assets:index`,
`triggers:{env}:{pid}::index` — so nothing enumerates after the first deploy.

**Runtime keys are not secrets.** A deployed page is a static bundle with no user
credentials, so it authenticates as a *project*. Each `(env, projectId)` gets one
random key, minted on first serve and injected into the HTML as a `<meta>` tag;
the compiled client sends it as `x-morgana-runtime`. It ships in the page, so
anyone can read it — its job is to scope a request to one project, not to
authenticate a person.

## Deploying

`morgana deploy` needs no arguments. The Morgana cloud URL is compiled in as the
default; `--url` or `MORGANA_URL` point somewhere else, which keeps self-hosting a
supported destination rather than a fork.

Credentials resolve in order, first match wins:

1. `--token`
2. `MORGANA_TOKEN` — how CI runs unattended
3. **the stored token** — what `morgana login` wrote, so signing in once is enough
4. **`morgana login`** — run automatically, in the browser, when there is nothing
   else

There is no shared deploy key, deliberately. A deploy uploads code that then
executes, so the credential is scoped to one project, expires in 30 days, and is
recorded against an identity. One unscoped value would authorise writing into
every project on the worker.

`morgana login` drives a consent flow: a loopback server on an ephemeral port, the
worker renders a permission screen listing the requested scopes, and the token
comes back in the URL **fragment** — which is why the callback serves a small page
that reads `location.hash` and posts it back. The token never passes through a
request line, an access log or a `Referer`.

After publishing, `deploy` verifies the page and every asset it references serve.
That the page *works* — stylesheet applied, runtime booted, no console errors — is
checked in CI, which installs a browser deliberately rather than asking every user
to have one.

## Headless deploy

```bash
MORGANA_TOKEN=$(node tools/mint-token.mjs https://your-worker.workers.dev)
```

`tools/mint-token.mjs` signs in over HTTP with a generated per-run identity, so a
machine gets a real token: one project, expiring, attributable. A CI job with a
checked-in email and password would just be a shared credential with extra steps.

## Deploying to your own infrastructure

`morgana deploy` targets the Morgana cloud by default. To publish somewhere else
— your own worker, a staging environment — name it:

```bash
morgana deploy --url https://your-worker.workers.dev
# or
export MORGANA_URL=https://your-worker.workers.dev
```

The credential is scoped to one project either way, so a self-hosted worker
enforces the same isolation.

## What an app gets

- **Auth for your users**, separate from Morgana accounts: server `ctx.auth`
  (`require`, `signIn/signUp`, roles, password reset, email verification) and
  client `ctx.auth` (`signIn/signUp/signOut`, Google sign-in). Sessions are an
  HttpOnly cookie. Gate pages with `access: 'member' | { role }`.
- **Server:** collections, files (R2), queues, `ctx.server.email` (Resend),
  secrets, `respond()` and streaming, cron and store triggers, channels.
- **Server objects:** named, durable instances with their own state and
  tables, methods (including streaming ones), schedules and background jobs;
  the same typed `ctx.objects` on the server and in the browser.
- **Pages:** static, SPA or server-rendered; `products/:id` routes; every one
  of 91 component kinds styled by props (hover/focus/active states, themes,
  dark mode).
- **Hosting:** each project at `<project>.<APPS_DOMAIN>`, plus DNS-verified
  custom domains.
