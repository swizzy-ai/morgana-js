# @studiomorgana/helpers

Write Morgana UI as sentences. Every new project gets it from `morgana init`
(installed alongside the SDK), so read this and use it — do not hand-roll a
parallel helper layer per project, and do not hand-write `for`/`forEach`
loops at the call site: a brick covers them.

```ts
import { defineClientAction } from '@studiomorgana/sdk'
import { helpers, theme } from '@studiomorgana/helpers'

const station = theme('station-dark')
  .color('screen', '#0b0a08').color('orange', '#fe9920')
  .font('mono', 'JetBrains Mono')
  .appearance('primary', (make) => make.background('orange').textColor('screen').font('mono').uppercase().pointer())

export const startPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const { create, place, make, set } = helpers(ctx, station)

    create.page('start').at('/start').in('main')
    const go = create.button('go', 'Start task')
    make(go).appearance('primary')
    place(go).on('start')
    return { ok: true }
  },
})
```

`helpers(ctx, theme)` binds the verbs to the action's `ctx`. Every sentence ends
in ordinary Morgana calls, so helpers and hand-written code mix freely.

## The verbs

| Verb | For | Example |
|---|---|---|
| `create` | new things (compile) | `create.button('go', 'Start')`, `create.page('wall').at('/wall').in('console').for('members').otherwise('login')` |
| `place` | where it goes | `place(go).in(form)`, `place(screen).on('wall')`; into a list = the row repeated per record |
| `make` | how it looks | `make(card).appearance('card').padding('large').rounded()` |
| `set` | what it says, holds or does | `set(email).type('email').placeholder('you@co.com').required()` |
| `show` / `hide` | visibility | `hide('gate')` |
| `enable` / `disable` | can it be used | `disable('approve')` |
| `fill` / `add` / `clear` | lists | `fill('jobs').with(records)`, `add(line).to('trail')` |
| `when` | events (browser) | `when('start').clicked().run('startTask')` |
| `go` | navigation (browser) | `go.to('/wall')` |
| `theme` | names colours, fonts, appearances | `theme('dark').color('orange', '#fe9920')` |

Sizes are words — `none tiny small medium large huge` — and colours and fonts
are names from your theme. Raw values still work.

Amounts can also be points, one fixed standard
([docs/13-points.md](../../docs/13-points.md)): `make(card).padding('2 points').spaced('a little')`,
`make(title).size('3 points')`, `animate.move(box).left('1.5 points').for('4 points')`.
A point is 8px (0.1s for time) unless the theme says otherwise:
`theme('tight').points({ distance: '4px', words: { 'a little': 3 } })`. The size
words above keep the values they always had.

`onHover()`, `onFocus()`, `onPress()`, `whenDisabled()`, `onPhone()`,
`onTablet()`, `onDesktop()` apply to the rest of their sentence:
`make(tile).bordered().onHover().border('orange')`.

Type `make(x).` or `set(x).` and your editor lists every word.

## Themes, light and dark

A theme's **roles** switch with light and dark; **named colours** stay fixed.

```ts
export const station = theme('station')
  .background({ light: '#efe9de', dark: '#100f0d' })
  .card({ light: '#fbf8f2', dark: '#0b0a08' })
  .text({ light: '#1b1814', dark: '#f4ecdd' })
  .border({ light: '#d9cfbf', dark: '#262119' })
  .primary('#fe9920')
  .color('adblue', '#4aa8ff')
  .font('read', 'IBM Plex Sans').pageFont('read')
  .appearance('card', (make) => make.background('card').border('border').rounded())
```

Roles: `background` `text` `card` `cardText` `muted` `mutedText` `border`
`primary` `primaryText` `accent` `accentText` `danger` `success` `warning`.

`helpers(ctx, station)` registers it as a Morgana theme, and every
`create.page(...)` paints the whole page from it, following the visitor's
light/dark setting. Change the mode in the browser with `mode.toggle()`,
`mode.dark()`, `mode.light()`.

## Animation

An animation is a sentence: **what** moves, **how**, its **timing**, then **when**.

```ts
animate.fadeIn(card).whenItAppears()                       // page load, CSS only
animate.bounce(icon).when(button).clicked()                // browser
animate.move(box).right('large').for('slow').when(button).clicked()
animate.pulse(dot).every('5s').now()
animate.shake(form).now()
```

| Part | Words |
|---|---|
| how | `fadeIn` `fadeOut` `slideUp` `slideDown` `slideLeft` `slideRight` `slideIn` `slideOut` `scaleIn` `scaleOut` `pulse` `bounce` `spin` `sway` `smooth` `bouncy` `shake` `pop` `move` `custom` |
| move | `.left()` `.right()` `.up()` `.down()` — `tiny small medium large huge` or pixels; `.home()` goes back |
| timing | `.for(d)` how long · `.after(d)` wait first · `.every(d)` repeat with a rest · `.forever()` · `.times(n)` · `.backAndForth()` · `.slowly()` `.quickly()` |
| shape | `.from('left')` `.toward('right')` (slides) · `.turns(2)` (spin) · `.along('y')` (sway) · `.easing('ease-in-out')` |
| when | `.now()` · `.when(x).clicked()` / `changed` `submitted` `selected` `opened` `closed` `hovered` `focused` · `.whenItAppears()` |

A duration `d` reads as English: `'quick'` `'normal'` `'slow'` `'very slow'`,
`'300ms'` `'2s'` `'1.5 seconds'` `'half a second'`, or milliseconds.

Page-load motion (`whenItAppears` in a compile action) has fixed timing for
now; for custom timing play it with `.now()` in a `loaded` action.

## Sequences: `steps()`

Several steps as one action. Steps run in order and share a scope: name a
result with `as`, then use it as `$name` or `$name.field`. The first failure
stops the sequence with a message naming the step; an `otherwise` list runs
instead, with the message in `$error`.

```ts
export const onSave = defineClientAction({
  config: { on: 'save.clicked' },
  handler: steps([
    { do: 'read', from: 'task-input', as: 'title' },
    { do: 'server', action: 'saveTask', send: ['title'], as: 'saved' },
    { do: 'clear', object: 'task-input' },
    { do: 'set', object: 'status', to: 'Saved.' },
  ], { otherwise: [{ do: 'set', object: 'status', to: '$error' }] }),
})

export const saveTask = defineServerAction({
  handler: steps.server([
    { do: 'create', collection: 'tasks', values: { title: '$title', done: false }, as: 'task' },
    { do: 'save', record: '$task' },
    { do: 'return', value: '$task' },
  ]),
})
```

| Side | Steps |
|---|---|
| browser | `read`, `set`, `clear`, `show`, `hide`, `go`, `message`, `state.set`, `state.add`, `state.push` |
| server | `create` (a draft), `save` (insert, or update when it has an id), `add`, `update`, `delete`, `find`, `return` |
| either | `server` (call a server action with values from the scope), `call`, `wait`, `log` |

Data steps refuse to run in the browser, and page steps on the server, with a
message saying where they belong. Godtongue writes its rules as `steps()`.

## The bricks

`helpers(ctx, theme)` also hands you `bricks` — compound sentences for the
thing a page would otherwise write out longhand more than twice. Build page
code from bricks; add a brick only when a pattern reaches here.

```ts
const { create, place, make, bricks } = helpers(ctx, station)

// Fixed-count runs — builds the first, clone()s the rest; no loops in page code
const segs = bricks.repeat(10, () => make(create.box('conv-seg')).background('track').done(),
  (seg, i) => { place(seg).in(track); seg.setProps({ id: `conv-seg-${i}` }) })

// Hidden unless a state value holds (batched steps, gated panels)
bricks.onlyWhile(authEmail, 'authStep', 'email')

// A meter of labelled live cells — caption over a state-bound value
bricks.cells(meter, [['m-time', 'Time', 'meter.time'], ['m-tok', 'Tokens', 'meter.tokens']])

// A segmented control: one key per member, the active one lit by state
bricks.segmented(foot, 'theme.mode', [['system', 'System'], ['dark', 'Dark']])

// A list whose rows follow a state array (the row becomes the record template)
bricks.rows('log', logLine, 'log')
```

| Brick | Kills |
|---|---|
| `repeat(count, build, configure?)` | every fixed-count run (segments, bars, dots) — build one, clone the rest |
| `onlyWhile(thing, path, when)` | batched show/hide state wiring |
| `cells(into, [[id, label, path]], looks?)` | meter/status cells written by hand |
| `segmented(into, stateKey, [[id, label]])` | pill groups and their active-state condition |
| `rows(id, row, path, key?)` | a list template + `fill().from()` boilerplate |

Looks are theme appearance names; pass your own with the optional parameters.
Type `bricks.` in your editor to see every one.
