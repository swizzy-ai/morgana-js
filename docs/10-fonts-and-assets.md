# 10 · Fonts and assets

## Assets

Anything in the project's `assets/` folder is published with the site, at
`/assets/<path>`:

```
assets/
  favicon.svg      → /assets/favicon.svg
  img/hero.jpg     → /assets/img/hero.jpg
  fonts/Clash.woff2
```

```ts
ctx.ui.image({ id: 'hero', src: ctx.assets.url('img/hero.jpg') })
ctx.ui.pages.create({ name: 'home', address: '/', favicon: '/assets/favicon.svg' })
```

`ctx.assets.url(path)` builds the URL; prefer it to writing `/assets/…` by
hand, because the cloud serves assets per environment.

## Fonts

Declare a project's fonts once, in `morgana.config.ts`, by the name objects
will use:

```ts
export default defineConfig({
  name: 'team-board',
  fonts: {
    brand:   { google: 'Inter', weights: [400, 600] },
    display: { google: 'Space Grotesk', weights: [600, 700] },
    clash:   { file: 'fonts/Clash.woff2', weight: '600 700' },   // in assets/
    serif:   'Georgia, serif',                                    // a CSS stack
  },
  // The defaults: which font body text, headings and code use.
  text: { body: 'brand', headings: 'display' },
})
```

| Source | What happens |
|---|---|
| `{ google: 'Inter', weights, italic? }` | Downloaded at build and served from your own `/assets`. Visitors never call Google. Cached in `.morgana/fonts/`, so later builds work offline. |
| `{ file: 'fonts/x.woff2', weight?, style? }` | A file in `assets/`. A variable font takes a range: `weight: '100 900'`. |
| `'Georgia, serif'` | A CSS stack — fonts already on the visitor's machine. |

Each takes an optional `fallback` (default `system-ui, sans-serif`), shown
while the font loads or if it cannot. A font that fails to download is a build
warning, never a failed build.

`text` sets the defaults: `body` for everything, `headings` for the heading
words of the scale (`display`, `h1`–`h6`, `headline`, `title`), `mono` for
`font: 'mono'` and code.

## Using fonts in an action

**Pick a step of the type scale** with `font` — one word sets size, weight,
line height and tracking:

```ts
ctx.ui.text({ id: 'title', content: 'Team Board', font: 'h2' })
```

`display-lg` · `display` · `h1`–`h6` · `headline` · `title` · `subtitle` ·
`body-lg` · `body` · `body-me` · `body-sm` · `caption` · `mono`

A word outside the scale is a build warning — it would style nothing.

**Pick a declared font** with `family` — typed by `morgana types`, so a
misspelled name is a type error:

```ts
ctx.ui.text({ id: 'logo', content: 'Morgana', family: 'clash', font: 'h3' })
```

**Adjust** with props:

| Prop | Takes |
|---|---|
| `fontWeight` | `thin` `extralight` `light` `regular` `medium` `semibold` `bold` `extrabold` `black`, or 100–900 |
| `tracking` | `tighter` `tight` `normal` `wide` `wider` `widest`, or em as a number (`0.08`) |
| `fontSize` | a size: `18`, `'1.5rem'` |
| `lineHeight` | `1.4`, `'24px'` |
| `fontStyle` | `'italic'` |
| `textTransform` | `'uppercase'` `'lowercase'` `'capitalize'` |
| `stroke` | outlined text: `{ width: 2, color: 'primary' }` |

```ts
ctx.ui.text({
  id: 'hero-title',
  content: 'Ship it',
  font: 'display',
  fontWeight: 'black',
  tracking: 'tighter',
  stroke: { width: 2, color: 'primary' },
})
```

`make()` takes the common ones as words: `make('h2')`, `make('bold')`,
`make('semibold')`, `make('light')`, `make('italic')`, `make('uppercased')`.

**At runtime**, the same props change on a live object:

```ts
ctx.ui.get('title')?.set('family', 'serif')
ctx.ui.get('title')?.set('fontWeight', 'bold')
```

**Per theme**, a theme's `fontFamily` token sets the font for everything inside
it.

## Your own scale words

Add or change steps of the scale in the config:

```ts
transformers: {
  fonts: {
    add: { hero: { 'font-size': '72px', 'font-weight': '800', 'letter-spacing': '-0.03em' } },
  },
},
```

Then `font: 'hero'` works like any built-in word.

## Rules

- **Declare fonts in `config.fonts`, use them with `family`.** Never `class`,
  `style` or `headCSS` to load a font.
- **`font` is the scale; `family` is the typeface.** `font: 'h2', family: 'serif'`
  is a serif h2.
- **Use `ctx.assets.url()`** for asset URLs.

## Full surface

```bash
morgana spec ui text      # every text prop, with its type
morgana spec config       # fonts, text, transformers
```
