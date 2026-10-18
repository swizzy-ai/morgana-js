import { box, cone, cylinder, defineAsset, motion } from '@studiomorgana/assets'

// A windmill. Four sails are attached to the hub, a quarter turn apart around
// its centre; spinning the hub spins them all.
const tower = cone('tower', { size: [1.2, 2.4], top: 0.6, sides: 8, looks: 'light stone' }).at(0, 1.2, 0)
const roof = cone('roof', { size: [0.95, 0.65], sides: 8, looks: 'dark red' }).on(tower)
const door = box('door', { size: [0.32, 0.5, 0.1], looks: 'dark wood' }).against(tower, 'front').nudge('down', 0.95)
const axle = cylinder('axle', { size: [0.08, 0.4], looks: 'iron' }).turned('a quarter', 'forward').attach(tower).at(0, 2.3, 0.45)
const hub = box('hub', { size: 0.26, looks: 'dark wood' }).attach(tower).at(0, 2.3, 0.66)
const sails = [0, 1, 2, 3].map((i) =>
  box(`sail-${i}`, { size: [0.3, 1.2, 0.03], looks: 'white' }).attach(hub).at(0, 2.3 + 0.6, 0.7).pivot('bottom').turned(i * 90 + 20, 'counterclockwise'),
)

export default defineAsset({
  name: 'windmill',
  kind: '3d',
  parts: [tower, roof, door, axle, hub, ...sails],
  animations: {
    turn: [motion(hub).spins('clockwise').over('slow')],
    gale: [motion(hub).spins('clockwise').over('fast')],
  },
})
