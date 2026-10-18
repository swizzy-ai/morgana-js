// The plugin Morgana loads for `plugins: ['@studiomorgana/assets']`.
import { definePlugin } from '@studiomorgana/sdk'
import type { AssetDefinition } from './index'
import { compileAsset, variantsOf } from './compiler'
import { words } from './words'

export default definePlugin<AssetDefinition>({
  name: 'assets',
  about: 'Things: 2D sprites and 3D models, with animations, built from words.',
  reads: 'src/assets',
  defines: ['defineAsset'],
  refers: 'asset',
  words,
  variants: variantsOf,
  seed: (asset, variant) => asset.variants?.[variant]?.seed,
  makes: (asset, make) => {
    if (asset.kind !== '2d' && asset.kind !== '3d') make.fail(`kind must be '2d' or '3d', not "${String((asset as { kind?: unknown }).kind)}"`)
    const kit = { variant: make.variant, seed: make.seed, random: make.random, between: make.between, pick: make.pick }
    const out = (() => {
      try {
        return compileAsset(asset, kit)
      } catch (err) {
        return make.fail(err instanceof Error ? err.message : String(err))
      }
    })()
    for (const f of out.files) make.file(f.role, f.name, f.data)
    make.describe({ kind: out.kind, clips: out.clips, ...(out.triangles !== undefined ? { triangles: out.triangles } : {}) })
  },
  explains: [
    'Assets are files in src/assets/ that `export default defineAsset({ name, kind, parts, animations })`.',
    "3D: box, cylinder, cone, sphere, rock, terrain — placed with on, under, beside, against; turned with turned('a quarter', 'left').",
    "2D: circle, ellipse, rect, star, polygon, heart, path — placed with at('top left'), on(layer).",
    "Motion: motion(part).turns / spins / swings / moves / bobs / pulses / squashes / fades / blinks / flips / grows, then over('slow').eases('bounce').",
    "Point at an asset from a page with `src: 'asset:coin'`, a variant with `asset:heart@half`, a file with `asset:coin#clip:spin`.",
  ].join('\n'),
})
