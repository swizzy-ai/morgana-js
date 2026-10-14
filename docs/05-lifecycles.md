# 5 · Lifecycles and events

Everything in Morgana runs because an event happened. This is the whole
timeline in one place — when each thing runs, and what it may do there.

## Build

```
morgana build
  1. read morgana.config.ts, find every action, server object and custom object
  2. run compile actions          → apps, pages, objects, collections declared
     (in config `hooks` order, then the rest alphabetically)
  3. run each custom object's define, where it is placed
  4. generate .morgana/ types
  5. bundle browser and server actions, emit dist/
```

Order compile actions explicitly when one depends on another:

```ts
// morgana.config.ts
export default defineConfig({
  name: 'team-board',
  hooks: [{ on: 'compile', run: ['apps', 'boardPage'] }],
})
```

## A page, in the browser

```
request
  └─ render: 'server' page?  → its route action runs first (fetch, fill, render)
  └─ access check            → redirect or 401 before anything is sent
page served
  └─ custom objects: onPrepare (may await) → onMount
  └─ 'loaded'                 page rendered, objects mounted — fetch-on-load goes here
  └─ interaction events       'clicked', 'changed', 'submitted', …
  └─ state events             'state:<path>' when state changes
  └─ live events              'object:<type>/<name>.<event>' from a server object
leaving
  └─ custom objects: onDestroy
```

`loaded` fires on every page. A handler that belongs to one page checks it is
on that page first:

```ts
export const loadBoard = defineClientAction({
  config: { on: 'loaded' },
  handler: async (ctx) => {
    if (!ctx.ui.get('col-todo-cards')) return    // another page
    const { cards } = await ctx.actions.run('openBoard', {})
    // …
  },
})
```

## A server object instance

```
create / getOrCreate
  └─ onCreate(self, init)        inside the create transaction
  └─ event 'created'             → object:<type>.created triggers
method call                      one at a time per instance
  └─ method(self, params)        self.set, self.db.*, self.emit
  └─ on: reactions               '<table>.added|updated|removed', 'state.<key>', custom events
  └─ commit — all or nothing
  └─ after commit: events reach subscribers and object:… triggers;
     deferred jobs start; scheduled methods are booked
self.schedule('5m', 'remind')    a method, later
self.defer('summarise')          a job, in the background, on a snapshot
```

A method that throws changes nothing — its writes, state and events are all
discarded.

## Server actions

A server action runs once per event: an HTTP request, a `cron(…)` tick, a
`store.<collection>.created|updated|deleted`, an `object:…` event, a
`channel:<name>` message, or a call by name. Each run is independent — keep
state in collections or server objects, never in module variables.

## Your own events

In the page, `ctx.events.emit('name', payload)` raises an event and
`ctx.events.on('name', fn)` listens to it (it returns an unsubscribe).
Across the server, `ctx.events.publish(channel, payload)` sends to a channel,
and a server action follows it with `on: 'channel:<name>'`.

`on` itself only accepts the built-in shapes in [§7](07-events.md) — a made-up
name there is a build error, so wire your own events through `ctx.events` or a
channel.

## Full surface

```bash
morgana spec events           # every `on`
morgana spec custom-object    # onPrepare / onMount / onUpdate / onDestroy
morgana spec server-object    # onCreate, on, methods, jobs, schedule
```

Next: [custom objects →](06-custom-objects.md)
