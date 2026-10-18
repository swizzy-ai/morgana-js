import { defineAsset, ellipse, motion } from '@studiomorgana/assets'

// A slime enemy. Everything on the body moves with it; it squashes from its
// base so it stays on the ground.
const shadow = ellipse('shadow', { size: [0.56, 0.08], fill: 'black', opacity: 0.18 }).at([0.5, 0.88])
const body = ellipse('body', { size: [0.64, 0.5], fill: 'slime', outline: 'dark slime' }).at([0.5, 0.62]).pivot('bottom')
const shine = ellipse('shine', { size: [0.15, 0.08], fill: 'white', opacity: 0.75 }).at([0.35, 0.5]).turned('a bit', 'counterclockwise').on(body)
const eyeLeft = ellipse('eye-left', { size: [0.09, 0.14], fill: 'black' }).at([0.41, 0.6]).on(body)
const eyeRight = ellipse('eye-right', { size: [0.09, 0.14], fill: 'black' }).at([0.59, 0.6]).on(body)
const mouth = ellipse('mouth', { size: [0.1, 0.04], fill: 'dark slime' }).at([0.5, 0.71]).on(body)

export default defineAsset({
  name: 'slime',
  kind: '2d',
  parts: [shadow, body, shine, eyeLeft, eyeRight, mouth],
  animations: {
    idle: [motion(body).squashes('small').over('normal')],
    blink: [motion(eyeLeft).blinks().over('slow'), motion(eyeRight).blinks().over('slow')],
    hop: [
      motion(body).bobs('large').over('normal').eases('out'),
      motion(body).squashes('medium').over(0.5),
      motion(shadow).pulses('medium').over('normal').offset(0.5),
    ],
  },
})
