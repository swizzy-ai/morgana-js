# 7 · Built-in events

`config.on` is a string (or a list of them). Its shape says which lane runs
the action. An `on` the compiler cannot place is a build error, never a dead
binding.

| `on` | Lane | Runs when |
|---|---|---|
| `compile` | build | The project builds. |
| `<event>` | browser | Any object on the page emits it — `'loaded'`, `'clicked'`. |
| `<objectId>.<event>` | browser | That object emits it — `'add-card.clicked'`. |
| `<objectId>.<prop>.changed` | browser | One prop of one object changes. |
| `state:<path>` | browser | A state value changes. |
| `http.<method> /path/:param` | server | A request matches. Params, query and body in `ctx.args`. |
| `cron(<expression>)` | server | On a schedule — `'cron(0 3 * * *)'`. |
| `store.<collection>.created\|updated\|deleted` | server | A collection record changes. |
| `channel:<name>` | server | A message is published to the channel. |
| `action:<name>:completed` | server | Another action finished. |
| `object:<type>.<event>` | server | Any instance of a server object emits it. The instance is `ctx.object`. |
| `object:<type>/<name>.<event>` | browser or server | One named instance emits it — live in the browser. |

Short DOM names work too: `click` → `clicked`, `change`/`input` → `changed`,
`submit` → `submitted`, `load` → `loaded`.

What the event carried is `ctx.event` in the browser and `ctx.args.event` for
server triggers.

## Several at once

```ts
config: { on: ['save.clicked', 'form.submitted'] }
```

## Options

`config` also takes `auth` (`'member'` for HTTP routes), `when` (a filter on
the event), `debounce` / `throttle` (ms), and `enabled`.

## Full surface

```bash
morgana spec events           # the table above, every browser event, ActionConfig
morgana spec ui <kind>        # the events one kind emits
```

Every row of this table is checked against the compiler by Morgana's own test
suite, so it cannot drift from what `on` accepts.

Next: [types →](08-types.md)
