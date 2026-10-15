# @studiomorgana/helpers

Write Morgana UI as sentences. Every new project gets it from `morgana init`.

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
