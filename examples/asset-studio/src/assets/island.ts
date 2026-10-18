import { box, defineAsset, motion, terrain } from '@studiomorgana/assets'

// A low-poly island: noise terrain coloured by height, in a sea that rises and falls.
export default defineAsset({
  name: 'island',
  kind: '3d',
  variants: { north: { seed: 4 }, south: { seed: 19 } },
  build: (kit) => [
    terrain('land', { size: 8, peaks: 1.6, detail: 48, seed: kit.seed, bands: ['sand', 'light grass', 'grass', 'dark grass', 'stone', 'snow'] }),
    box('sea', { size: [9, 0.04, 9], looks: 'water' }).at(0, 0.03, 0),
  ],
  animations: { tide: [motion('sea').bobs('tiny').over('lazy')] },
})
