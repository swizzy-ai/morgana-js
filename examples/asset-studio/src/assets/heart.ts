import { defineAsset, heart, motion } from '@studiomorgana/assets'

// A health heart in three states. Variants override options by layer id, so
// one definition gives the whole HUD set: asset:heart@full, @half, @empty.
const left = heart('left', { size: 'huge', fill: 'red', half: 'left', outline: 'dark red' })
const right = heart('right', { size: 'huge', fill: 'red', half: 'right', outline: 'dark red' }).on(left)

export default defineAsset({
  name: 'heart',
  kind: '2d',
  canvas: 64,
  parts: [left, right],
  variants: {
    full: {},
    half: { set: { right: { fill: 'pale grey', outline: 'grey' } } },
    empty: { set: { left: { fill: 'pale grey', outline: 'grey' }, right: { fill: 'pale grey', outline: 'grey' } } },
  },
  animations: {
    beat: [motion(left).pulses('medium').over('fast').eases('out')],
  },
})
