import { circle, defineAsset, ellipse, motion, star } from '@studiomorgana/assets'

// A pickup coin: a rim, a raised face, a star, a glint.
const rim = circle('rim', { size: 'huge', fill: 'gold', outline: 'dark gold', outlineWidth: 'thick' })
const face = circle('face', { size: 0.6, fill: 'light gold' }).on(rim)
const mark = star('mark', { size: 0.34, fill: 'dark gold' }).on(rim)
const glint = ellipse('glint', { size: [0.1, 0.26], fill: 'white', opacity: 0.7 }).at([0.34, 0.36]).turned('a bit').on(rim)

export default defineAsset({
  name: 'coin',
  kind: '2d',
  parts: [rim, face, mark, glint],
  animations: {
    spin: [motion(rim).flips('around').over('normal')],
    shine: [motion(glint).fades(0.1).over('fast').loops(), motion(rim).pulses('tiny').over('fast')],
  },
})
