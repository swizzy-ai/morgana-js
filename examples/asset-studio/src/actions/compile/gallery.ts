import { defineClientAction } from '@studiomorgana/sdk'
import { helpers, type AssetPick } from '@studiomorgana/helpers'

/**
 * The gallery: every 2D asset, animated, by reference. `create.sprite` writes
 * `asset:coin#clip:spin`, which is resolved at build to the file the assets
 * plugin made, so this page never knows a path or a hash. 3D models are listed
 * as links to their .glb files.
 */
const SPRITES: Array<[string, AssetPick, string]> = [
  ['coin', { clip: 'spin' }, 'Coin — spin'],
  ['slime', { clip: 'hop' }, 'Slime — hop'],
  ['burst', { clip: 'burst' }, 'Burst — procedural'],
  ['heart', { variant: 'full', clip: 'beat' }, 'Heart — full'],
  ['heart', { variant: 'half' }, 'Heart — half'],
  ['heart', { variant: 'empty' }, 'Heart — empty'],
]

const MODELS: Array<[string, string]> = [
  ['asset:robot', 'Robot (walk, idle, wave)'],
  ['asset:chest', 'Chest (open, rattle)'],
  ['asset:windmill', 'Windmill (turn, gale)'],
  ['asset:pine-tree@a', 'Pine tree, seed a'],
  ['asset:rock@pile', 'Rock pile'],
  ['asset:island@north', 'Island, north'],
]

export const gallery = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const { create } = helpers(ctx)
    const page = ctx.ui.pages.create({ name: 'gallery', address: '/' })
    const frame = ctx.ui.box({ id: 'frame', layout: 'column', gap: 6, pad: 8 })
    frame.place(ctx.ui.text({ id: 'title', content: 'Asset studio', font: 'h2' }))
    frame.place(ctx.ui.text({ id: 'lede', content: 'Every image below is built from a definition in src/assets/ by the assets plugin.' }))

    const grid = ctx.ui.box({ id: 'sprites', layout: 'row', gap: 4, wrap: true })
    SPRITES.forEach(([name, pick, label], i) => {
      const card = ctx.ui.box({ id: `sprite-${i}`, layout: 'column', gap: 2, pad: 3, radius: 'lg', bg: 'muted', align: 'center' })
      // The helpers shorthand: `asset:coin#clip:spin`, sized in pixels, without writing the reference.
      card.place(create.sprite(`sprite-${i}-image`, name, { ...pick, alt: label }))
      card.place(ctx.ui.text({ id: `sprite-${i}-label`, content: label, font: 'caption' }))
      grid.place(card)
    })
    frame.place(grid)

    frame.place(ctx.ui.text({ id: 'models-title', content: '3D models (glTF)', font: 'title' }))
    const list = ctx.ui.box({ id: 'models', layout: 'column', gap: 2 })
    MODELS.forEach(([ref, label], i) => {
      const link = ctx.ui.link({ id: `model-${i}`, href: ref })
      link.place(ctx.ui.text({ id: `model-${i}-label`, content: label }))
      list.place(link)
    })
    frame.place(list)

    page.place(frame)
    return { ok: true }
  },
})
