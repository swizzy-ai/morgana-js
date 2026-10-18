# @studiomorgana/assets

2D sprites and 3D models with animations, written in words and built into
standard files: glTF for 3D; SVG, self-animating SVG and sprite sheets with an
atlas for 2D. It's the first Morgana plugin.

```ts
// morgana.config.ts
export default defineConfig({ name: 'my-game', plugins: ['@studiomorgana/assets'] })
```

```ts
// src/assets/chest.ts
import { box, defineAsset, motion } from '@studiomorgana/assets'

const base = box('base', { size: [1.2, 0.7, 0.8], looks: 'wood' }).at(0, 0.35, 0)
const lid = box('lid', { size: [1.24, 0.3, 0.84], looks: 'dark wood' }).on(base).hinged('back')

export default defineAsset({
  name: 'chest', kind: '3d', parts: [base, lid],
  animations: { open: [motion(lid).turns('a third', 'backward').over('slow').eases('bounce')] },
})
```

```ts
// any page
page.place(ctx.ui.image({ id: 'coin', src: 'asset:coin#clip:spin', alt: 'coin' }))
```

- `morgana build` builds every definition in `src/assets/`. Unchanged ones come from `.morgana/artifacts/` and are never rebuilt.
- `morgana artifacts list` shows what was built. `morgana artifacts dump robot --out exported` writes plain files for Blender, Godot, Unity or any engine.
- References: `asset:name`, `asset:name@variant`, `asset:name#clip:walk`.

## The words

| | |
|---|---|
| Placement | `on`, `under`, `beside(x, 'left')`, `against(x, 'front')`, `nudge('up', 'small')`, `at(x, y, z)` (escape hatch) |
| Pivots | `pivot('top')`, `hinged('back')` |
| Turning | `turned('a quarter', 'left')` · turns: `a little`, `a bit`, `an eighth`, `a quarter`, `a third`, `half`, `full`, or degrees · directions: `left`, `right`, `forward`, `backward`, `clockwise`, `counterclockwise` |
| Motion | `turns`, `spins`, `swings('a bit', 'forward and back')`, `moves`, `bobs`, `pulses`, `squashes`, `fades`, `blinks`, `flips('around')`, `grows`, then `over('slow')`, `eases('bounce')`, `offset(0.5)`, `after(1)`, `loops()` |
| Surfaces | `wood`, `bark`, `metal`, `iron`, `gold`, `stone`, `grass`, `leaf`, `pine`, `sand`, `snow`, `rubber`, `plastic`, `glass`, `water`, `glow` + any colour: `'plastic orange'`, `'glow sky'` |
| Colours | named colours with `light`, `dark`, `pale`, `deep`: `'dark gold'` |

Every build is deterministic: the same definition and variant produce the same bytes on every machine.
