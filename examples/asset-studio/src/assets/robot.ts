import { box, cylinder, defineAsset, motion, sphere } from '@studiomorgana/assets'

// A character from parts. Limbs pivot at the shoulder and hip, so a walk cycle
// is four swings, the far side half a step behind.
const torso = box('torso', { size: [0.7, 0.8, 0.45], looks: 'plastic orange' }).at(0, 1.25, 0)
const head = box('head', { size: [0.5, 0.4, 0.42], looks: 'light metal' }).on(torso, 0.06)
const visor = box('visor', { size: [0.38, 0.12, 0.04], looks: 'glow sky' }).against(head, 'front')
const antenna = cylinder('antenna', { size: [0.04, 0.25], looks: 'iron', sides: 6 }).on(head)
const bulb = sphere('bulb', { size: 0.1, looks: 'glow red' }).on(antenna)
const armLeft = box('arm-left', { size: [0.16, 0.65, 0.18], looks: 'metal' }).beside(torso, 'left', 0.04).nudge('up', 0.05).pivot('top')
const armRight = box('arm-right', { size: [0.16, 0.65, 0.18], looks: 'metal' }).beside(torso, 'right', 0.04).nudge('up', 0.05).pivot('top')
const legLeft = box('leg-left', { size: [0.22, 0.75, 0.25], looks: 'dark metal' }).under(torso).nudge('left', 0.18).pivot('top')
const legRight = box('leg-right', { size: [0.22, 0.75, 0.25], looks: 'dark metal' }).under(torso).nudge('right', 0.18).pivot('top')
const footLeft = box('foot-left', { size: [0.26, 0.1, 0.36], looks: 'rubber' }).under(legLeft).nudge('forward', 0.05)
const footRight = box('foot-right', { size: [0.26, 0.1, 0.36], looks: 'rubber' }).under(legRight).nudge('forward', 0.05)

export default defineAsset({
  name: 'robot',
  kind: '3d',
  parts: [torso, head, visor, antenna, bulb, armLeft, armRight, legLeft, legRight, footLeft, footRight],
  animations: {
    walk: [
      motion(legLeft).swings('a bit', 'forward and back').over('normal'),
      motion(legRight).swings('a bit', 'forward and back').over('normal').offset(0.5),
      motion(armLeft).swings('a bit', 'forward and back').over('normal').offset(0.5),
      motion(armRight).swings('a bit', 'forward and back').over('normal'),
      motion(torso).bobs('tiny').over(0.5),
    ],
    idle: [motion(head).swings('a bit', 'left and right').over('lazy'), motion(bulb).pulses('large').over('fast')],
    wave: [motion(armRight).turns(150, 'counterclockwise').over('slow').eases('spring')],
  },
})
