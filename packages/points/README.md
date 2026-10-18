# @studiomorgana/points

One fixed, standard way to say an amount, in English. No dependencies.

```ts
import { points } from '@studiomorgana/points'

const p = points()
p.read('2 points', 'distance')            // 16  (px)
p.read('a little', 'turns')               // 2   (degrees)
p.read('one and a half points', 'time')   // 150 (ms)
p.read('3 hairs', 'distance')             // 24
p.css('a bit', 'distance')                // '32px'
p.explain('a little', 'distance').how     // '"a little" = 2 points = 16px'
p.step(2, 'a bit more')                   // 4
```

| Kind | 1 point = |
|---|---|
| distance, text | 8px |
| turns | 1 degree |
| size | 5% of its own size |
| time | 0.1 second (⅛ beat with a tempo) |
| opacity, pan | 5% |
| blur | 1px |
| volume | 1 dB |
| pitch | 1 semitone |
| world | 10cm |

The amount words are named point values: `a hair` 1, `a little` 2, `a bit` / `some` 4,
`a lot` 8, `far` 16. Exact units work too: `'14px'`, `'5 degrees'`, `'0.4s'`, `'2 beats'`,
`'30%'`, `'3 dB'`, `'50cm'`.

Change what a point is, and what the words mean:

```ts
points({ basis: { distance: '4px', turns: '5 degrees' }, words: { 'a little': 3, 'a lot': '100px' } })
points({ frame: { width: 3840, height: 2160 } })   // px on a 1080 frame: doubled at 4K
points({ tempo: 120 })                              // '2 beats' = 1s
```

Every mistake is a sentence that says what to write instead:
`"4px" can't be a turn: turn is measured in degrees or turns ("5 degrees", "a quarter turn").`

Used by Morgana (`config.points`, `make.points`), `@studiomorgana/helpers` and
Godtongue. The full guide is in [docs/13-points.md](../../docs/13-points.md).
