# 13 · Points

A point is one fixed, standard way to say an amount, anywhere in Morgana:
pages, plugins, Godtongue, and later motion, 3D and sound. Say `'2 points'`
and it means the same thing in every project, every version and every format.

Points are their own package, `@studiomorgana/points`, with no dependencies.
The SDK names its types, while helpers, the compiler and Godtongue read amounts
with it. None of them depend on each other for it, so Godtongue can stand
alone and any other engine can use the same measurements.

## What a point is

| Kind | 1 point = | Example |
|---|---|---|
| `distance` | 8px | `'2 points'` = 16px |
| `text` | same as distance | `'3 points'` = 24px |
| `turns` | 1 degree | `'2 points'` = 2° |
| `size` | 5% of its own size | `'3 points'` = 15% bigger |
| `time` | 0.1 second, or ⅛ beat with a tempo | `'4 points'` = 0.4s |
| `opacity` | 5% | `'6 points'` = 30% |
| `blur` | 1px | |
| `volume` | 1 dB | |
| `pitch` | 1 semitone | |
| `pan` | 5% | |
| `world` | 10cm | |

Amounts read as English and take decimals: `'1.5 points'`, `'half a point'`,
`'one and a half points'`, `'2pt'`.

## Amount words

The amount words are named point values:

| Word | Points |
|---|---|
| `a hair`, `slightly` | 1 |
| `a little` | 2 |
| `a bit`, `some` | 4 |
| `a lot` | 8 |
| `far` | 16 |

You can count in hairs: `'3 hairs'` is three times `a hair`. Comparatives change
the last amount along the same doubling ladder: `more` and `a bit more` double
it, `much more` multiplies it by 4, `less` halves it, and `twice as far`,
`half as much` and `3 times as much` say exactly how much.

Exact units always work too: `'14px'`, `'5 degrees'`, `'a quarter turn'`, `'0.4s'`,
`'300ms'`, `'2 beats'`, `'30%'`, `'3 dB'`, `'50cm'`. A unit that doesn't fit the
kind is an error that says what does: `"4px" can't be a turn: turn is measured in
degrees or turns`.

## Changing the basis

For the whole project, in `morgana.config.ts`:

```ts
export default defineConfig({
  name: 'studio',
  points: { distance: '4px', turns: '5 degrees', words: { 'a little': 3, 'a smidge': 1.5 } },
})
```

Unset kinds keep the standard basis. Under `words`, a number is a number of
points and an amount (`'100px'`) is exact. A point always means its basis, so
amount words scale with it: with `distance: '4px'`, `a little` is 8px.

Plugins read the project basis through `make.points` ([Plugins](12-plugins.md)).
Pages built with helpers set it on the theme:
`theme('studio').points({ distance: '4px' })`. Godtongue reads the config and
lets a file set its own basis at the top (see the Godtongue README).

## Frames

On pages, a px is a CSS px. In video, motion and art, a px is a pixel on a
1080 frame: `points({ frame: { width: 3840, height: 2160 } })` doubles every px
amount, so a piece looks the same in every format. `exact: true` keeps literal
pixels, for pixel art.

## In code

```ts
import { points } from '@studiomorgana/points'   // also re-exported by helpers

const p = points({ basis: { distance: '4px' } })
p.read('a little', 'distance')            // 8
p.css('2 points', 'distance')             // '8px'
p.explain('a little', 'distance').how     // '"a little" = 2 points = 8px'
p.step(2, 'a bit more')                   // 4
p.with({ basis: { turns: '2 degrees' } }) // a file's basis over the project's
```

Next: [back to the guide](README.md)
