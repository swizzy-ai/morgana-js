import { defineAsset, rock, type Part } from '@studiomorgana/assets'

// Rocks for scattering: a lumpy boulder and a few pebbles, a new arrangement per seed.
export default defineAsset({
  name: 'rock',
  kind: '3d',
  variants: { boulder: { seed: 3 }, pile: { seed: 11 }, slab: { seed: 23 } },
  build: (kit) => {
    const looks = kit.pick(['stone', 'dark stone', 'light stone'])
    const w = kit.between(0.9, 1.4)
    const h = kit.variant === 'slab' ? 0.35 : kit.between(0.6, 0.9)
    const parts: Part[] = [rock('boulder', { size: [w, h, kit.between(0.8, 1.1)], looks, seed: kit.seed, lumpy: 0.7 }).at(0, h * 0.4, 0)]
    const pebbles = kit.variant === 'pile' ? 5 : 2
    for (let i = 0; i < pebbles; i++) {
      const a = kit.between(0, Math.PI * 2), r = kit.between(0.7, 1.0), s = kit.between(0.15, 0.3)
      parts.push(rock(`pebble-${i}`, { size: s, looks, seed: kit.seed + i + 1, lumpy: 0.5 }).at(Math.cos(a) * r, s * 0.35, Math.sin(a) * r))
    }
    return parts
  },
})
