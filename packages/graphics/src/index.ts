/**
 * @studiomorgana/graphics — a graphic is a tree of objects placed in a canvas,
 * like every Morgana object (budding-gilgamesh/godverse/README.md).
 *
 *   // morgana.config.ts: libraries: ['@studiomorgana/graphics']
 *   const { canvas, shape, text } = graphics(ctx)
 *   const view = canvas('view', { size: '16:9', mode: '2d', length: 6 })
 *   view.place(shape('logo', { shape: 'circle', colour: '#CCFF33', keys: [[0, { scale: 0 }], [1, { scale: 1 }]] }))
 *   // browser: ctx.ui.get('logo').set('colour', '#FF6B5B'); ctx.ui.get('view').seek(0)
 *
 * The objects are custom objects (ctx.ui.gv*) shipped by this package; a
 * loaded action calls mountGraphics(ctx.ui) once per page.
 */
import './kinds'

export { defineKind, keyed, loadThree, mountCanvas, mountPart, mountGraphics, clockMethods, Stage, type Kind } from './runtime'
export { solid } from './kinds'

type Props = Record<string, unknown>
const maker = (ctx: any, kind: string) => (id: string, props: Props = {}) => ctx.ui[kind]({ id, ...props })

/** The graphics lane's creators. Each returns an ordinary Morgana handle. */
export function graphics(ctx: any) {
  return {
    canvas: maker(ctx, 'gvCanvas'),
    group: maker(ctx, 'gvGroup'),
    shape: maker(ctx, 'gvShape'),
    text: maker(ctx, 'gvText'),
    model: maker(ctx, 'gvModel'),
    light: maker(ctx, 'gvLight'),
  }
}
