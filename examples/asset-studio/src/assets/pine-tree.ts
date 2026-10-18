import { cone, cylinder, defineAsset, motion, type Part } from '@studiomorgana/assets'

// A procedural pine. Each variant is a seed: the same seed builds the same
// tree on every machine, so a forest is three lines in a level.
export default defineAsset({
  name: 'pine-tree',
  kind: '3d',
  variants: { a: { seed: 1 }, b: { seed: 2 }, c: { seed: 7 } },
  build: (kit) => {
    const height = kit.between(0.5, 0.8)
    const trunk = cylinder('trunk', { size: [0.24, height], looks: 'bark', sides: 7 }).at(0, height / 2, 0).pivot('bottom')
    const parts: Part[] = [trunk]
    let below: Part = trunk
    const tiers = kit.pick([3, 4, 4, 5])
    for (let i = 0; i < tiers; i++) {
      const width = 1.5 - (i / tiers) * 1.0 + kit.between(-0.1, 0.1)
      const tall = 0.9 - i * 0.08
      const tier = cone(`tier-${i}`, { size: [width, tall], sides: 8, looks: kit.pick(['pine', 'dark pine', 'light pine']) })
        .on(below).nudge('down', i === 0 ? 0.15 : tall * 0.45).turned(kit.between(0, 45), 'left')
      parts.push(tier)
      below = tier
    }
    return { parts, animations: { sway: [motion(trunk).swings('a little', 'side to side').over('slow')] } }
  },
})
