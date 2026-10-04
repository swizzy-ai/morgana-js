# @morgana/sdk

The Morgana developer interface — types first.

This package is almost entirely types. The runtime exports are factories that
return what you gave them, plus the token and role catalogues, so action code can
`import` them and get real behaviour at build time without carrying a runtime
dependency into every project.

```bash
npm i @morgana/sdk
```

## What you import

```ts
import {
  defineConfig,
  defineClientAction,
  defineServerAction,
} from '@morgana/sdk'
```

### `defineConfig`

The project config, read from `morgana.config.ts`:

```ts
import { defineConfig } from '@morgana/sdk'

export default defineConfig({
  name: 'my-app',
  entry: 'home',
  minify: false,
  vars: {
    public: { siteName: 'My App' },
  },
  hooks: [{ on: 'compile', run: ['hello'] }],
})
```

### `defineClientAction` and `defineServerAction`

An **action** is a module exporting a handler, and what it exports decides where
it runs. `config.on` picks the lane:

| `config.on` | Runs |
|---|---|
| `'compile'` | at build time, in Node |
| `'api.post /x'`, `'cron'`, `'store.x.created'` | on the server, deployed |
| `'click'`, `'load'`, … | in the browser |

```ts
import { defineClientAction } from '@morgana/sdk'

export const hello = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('main', { displayName: 'Acme' })
    const page = ctx.ui.pages.create({ name: 'home', address: '/' })
    page.app('main')
    page.place(ctx.ui.text({ id: 'title', content: 'Hello', font: 'h2' }))
    return { ok: true }
  },
})
```

A compile action is not a build script — it receives the same `ctx` a server
action does and mutates the same page representation, which is why there is no
separate routing or templating layer to learn.

## `@morgana/sdk/generator`

Build-time helpers for generating a type registry from your action files:

```ts
import {
  resolveActionsDirs,
  generateRegistry,
  watchRegistry,
} from '@morgana/sdk/generator'
```

Used by the compiler; rarely imported directly.

## Why the package ships its `src/`

`@morgana/sdk-compile` resolves the SDK's **TypeScript source**, not the built
bundle, so that an action importing a real value gets the genuine implementation
rather than a stand-in. That is why `src/` is in `files`. A tarball without it
fails with *"cannot locate the @morgana/sdk source entry"* while the package is
plainly installed.

## Licence

Apache-2.0