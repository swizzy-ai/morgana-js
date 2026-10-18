import { circle, defineAsset, motion, star, type Layer, type Motion } from '@studiomorgana/assets'

// A hit effect, built procedurally: a flash and a ring of sparks flying out.
// The kit is seeded, so every build makes the same burst.
export default defineAsset({
  name: 'burst',
  kind: '2d',
  fps: 24,
  build: (kit) => {
    const parts: Layer[] = []
    const moves: Motion[] = []
    const flash = circle('flash', { size: 'medium', fill: 'light yellow' })
    parts.push(flash)
    moves.push(motion(flash).grows(0.2).over('fast').eases('out'), motion(flash).fades().over(0.5))
    const count = 12
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + kit.between(-0.2, 0.2)
      const spark = star(`spark-${i}`, { size: kit.between(0.07, 0.13), points: 4, inner: 0.35, fill: kit.pick(['yellow', 'orange', 'light orange']) })
      parts.push(spark)
      moves.push(
        motion(spark).moves([Math.cos(angle), Math.sin(angle)], kit.between(0.3, 0.42)).over(0.7).eases('out'),
        motion(spark).fades().over(0.7).eases('in'),
        motion(spark).turns(kit.between(90, 270), 'clockwise').over(0.7),
      )
    }
    return { parts, animations: { burst: moves } }
  },
})
