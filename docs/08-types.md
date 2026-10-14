# 8 · Types

Morgana generates types from your code, so calls across the stack are checked
by TypeScript.

```bash
morgana types          # once
morgana types --watch  # while you work
```

`morgana build` and every `morgana dev` save regenerate them too. They land in
`.morgana/`, which the project's `tsconfig.json` includes (`morgana init` sets
this up).

| Generated | Types |
|---|---|
| `.morgana/types/registry.d.ts` | `ctx.actions.run('name', input)` — input and output, from each action's `Contract` |
| `.morgana/objects.d.ts` | `ctx.objects.<name>` — every method's params and result, from each server object |
| `.morgana/ui.d.ts` | `ctx.ui.<name>(props)` — each custom object, props from its `defaultProps` |

## Contracts

Export a `Contract` from an action's file:

```ts
// src/actions/server/create-card.ts
export interface Contract {
  input: { text: string; column?: string }
  output: { id: string; text: string; column: string }
}

export const createCard = defineServerAction({ /* … */ })
```

Every `ctx.actions.run('createCard', …)` is now checked, in the browser and on
the server. Inside the action, type `ctx.args` from it:

```ts
export const cardPage = defineServerAction<ServerContext<Contract>>({
  handler: async (ctx) => {
    const { id } = ctx.args    // string
  },
})
```

A `Contract` describes the action exported from its file. With several actions
in one file, it describes the one named after the file (`create-card.ts` →
`createCard`) — one action per file keeps it unambiguous. An action without a
`Contract` still works; it is just `unknown` at the call site.

## In CI

```bash
morgana types && tsc --noEmit
```

`morgana init` adds this as `npm run typecheck`.

Next: [the full example →](09-example.md)
