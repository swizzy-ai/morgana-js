import { box, defineAsset, motion } from '@studiomorgana/assets'

// A treasure chest. The lid sits on the base, hinged at its back; the bands
// and the lock are attached to the lid, so they open with it.
const base = box('base', { size: [1.2, 0.7, 0.8], looks: 'wood' }).at(0, 0.35, 0)
const gold = box('gold', { size: [1.04, 0.1, 0.64], looks: 'glow gold' }).attach(base).at(0, 0.66, 0)
const lid = box('lid', { size: [1.24, 0.3, 0.84], looks: 'dark wood' }).on(base).hinged('back')
const bands = [-0.42, 0.42].flatMap((x, i) => [
  box(`band-${i}`, { size: [0.08, 0.72, 0.84], looks: 'iron' }).attach(base).at(x, 0.35, 0),
  box(`lid-band-${i}`, { size: [0.08, 0.32, 0.88], looks: 'iron' }).attach(lid).at(x, 0.85, 0),
])
const lock = box('lock', { size: [0.16, 0.2, 0.06], looks: 'gold' }).against(lid, 'front').nudge('down', 0.12)

export default defineAsset({
  name: 'chest',
  kind: '3d',
  parts: [base, gold, lid, ...bands, lock],
  animations: {
    open: [motion(lid).turns('a third', 'backward').over('slow').eases('bounce')],
    rattle: [motion(lid).swings('a little', 'forward and back').over(0.25)],
  },
})
