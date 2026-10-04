# @morgana/sdk-compile

The Morgana compiler.

Takes a directory of TypeScript actions and emits `dist/`: pages, styles, one
client runtime, and one self-contained server module per action.

```bash
npm i @morgana/sdk-compile
```

Most people never call this directly — [`@morgana/cli`](../morgana-cli) wraps it
as `morgana build`. It is a separate package so the compiler can be used
programmatically, and so a build can run without the CLI.

## Usage

```ts
import { compileProject } from '@morgana/sdk-compile'

const result = await compileProject({
  dir: '/path/to/project',
  outDir: '/path/to/project/dist',
  minify: true,
})

console.log(result.pages, result.hash, result.warnings)
```

## What it does, in order

1. **Scan.** Read the config and discover every action file, extracting each one's
   `config` and handler shape from the TypeScript AST.
2. **Discover custom objects.** Load each component definition so its `define`
   and `methods` are callable.
3. **Run compile actions, in order.** Each bundles to CommonJS and is evaluated
   in-process with a real `require`, so a helper importing a Node built-in works
   as it would on disk. What they return is the page representation.
4. **Bundle runtime actions** per lane.
5. **Emit.**

```
dist/
  manifest.json           content hash, entry page, page list
  pages/home.html
  assets/style.css        design tokens and layout
  assets/client.js        page runtime + browser actions + components
  server/actions/*.js     one self-contained ES module per action
  server/apis.json        declared routes
  server/stores.json      collection shapes
  server/triggers.json    cron and store hooks
```

## One esbuild profile per lane

The platform and format are chosen per lane, and the choice is load-bearing:

| Lane | platform | format | Why |
|---|---|---|---|
| compile | `node` | `cjs` | evaluated in-process |
| server | `node` | `esm` | one self-contained file, deployed |
| client | `browser` | `iife` | one pass over every browser action |

Imports are real. An action may import siblings, shared helpers and third-party
packages; esbuild resolves and inlines the whole graph.

## It warns when an action will work locally and fail deployed

A deployed server action does not run in Node. It runs in a QuickJS WASM
sandbox with no module loader, no `crypto` and no `fs`. The server lane bundles
with `platform: 'node'` — right for resolution, but esbuild also leaves Node
built-ins external on that platform — so `import { createHash } from 'node:crypto'`
survives into the emitted module. Under `morgana dev` that file is imported by
Node and resolves. The worker evaluates the module body inside a function, where
`import` is a SyntaxError.

So the build says so:

```
warning  node:crypto is a Node built-in. This works in `morgana dev` and will fail on deploy.
```

A warning rather than an error, because the action is valid locally and the
compiler cannot know whether you will ship it. Measured end to end: upload `200`,
first call `500 Unexpected token '{'`.

## Why this package ships its `src/`

The compiler locates its own `client/runtime.ts` on disk at build time to bundle
the page runtime from source. A tarball without `src/` fails with *"cannot
locate the page runtime source"* while the package is plainly installed.

## Licence

Apache-2.0