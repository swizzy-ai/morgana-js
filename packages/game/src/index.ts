/**
 * @studiomorgana/game — the game lane on a graphics canvas
 * (budding-gilgamesh/godverse/README.md §4).
 *
 *   // morgana.config.ts: libraries: ['@studiomorgana/graphics', '@studiomorgana/game']
 *   const { player, wall, grass } = game(ctx)
 *   view.place(grass('field', { area: [36, 36] }))
 *   view.place(wall('north', { size: [14, 1.6, 0.6], z: -7 }))
 *   view.place(player('me', { z: 4 }))
 *   // browser: on 'me.hit' — a game moment, as an ordinary Morgana event
 */
import './kinds'

type Props = Record<string, unknown>
const maker = (ctx: any, kind: string) => (id: string, props: Props = {}) => ctx.ui[kind]({ id, ...props })

/** The game lane's creators. Each returns an ordinary Morgana handle. */
export function game(ctx: any) {
  return {
    player: maker(ctx, 'gvPlayer'),
    wall: maker(ctx, 'gvWall'),
    grass: maker(ctx, 'gvGrass'),
  }
}
