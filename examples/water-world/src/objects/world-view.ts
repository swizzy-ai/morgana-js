/**
 * world-view — a world from words, rendered live on the page.
 *
 * Props: `words` (a sentence, plus `node.handle = value` lines), `seed`
 * (empty: a new world each time the words change; set: that exact world).
 * Emits `made` with the seed and every resolved handle, so the page can show
 * them, and `failed` with a reason.
 */
import { createCustomObject } from '@studiomorgana/sdk'
import { makeWorld, mountWorld, SHADERS, type World } from '@studiomorgana/world'
import type { Fingerprint, Values } from '@studiomorgana/media'

interface Row { id: string; node: string; path: string; value: string; asked: boolean }

/** Every leaf of every node, as rows for the page's handle list. */
function rowsOf(world: World): Row[] {
  const rows: Row[] = []
  const walk = (node: string, asked: string[], values: Values, prefix: string) => {
    for (const [k, v] of Object.entries(values)) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object') { walk(node, asked, v as Values, path); continue }
      rows.push({
        id: `${node}.${path}`,
        node,
        path,
        value: typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : String(v),
        asked: asked.includes(path),
      })
    }
  }
  for (const n of world.piece.nodes) walk(n.id, n.asked, n.values, '')
  walk('style', [], world.piece.style, '')
  return rows
}

export default createCustomObject({
  name: 'world-view',
  events: ['made', 'failed'],
  defaultProps: { words: '', seed: '' },

  define: (handle) => {
    handle.setProps({ layout: 'column', grow: 1, minH: 0, height: '100vh', bg: 'black', overflow: 'hidden' } as never)
  },

  onMount: (el, ctx) => {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%'
    el.style.position = 'relative'
    el.appendChild(canvas)
    const earlier: Fingerprint[] = []
    let stop: (() => void) | null = null
    const build = (words: string, seed: string) => {
      stop?.()
      try {
        const world = makeWorld(words || 'an ocean', { seed: seed || undefined, earlier })
        if (!seed) earlier.push(world.fingerprint)
        if (earlier.length > 24) earlier.shift()
        const view = mountWorld(canvas, world.scene, SHADERS, { scale: 0.6 })
        stop = view.play(0)
        ctx.emit('made', { seed: world.piece.seed, pinned: world.piece.pinned, unknown: world.unknown, nearest: world.nearest, rows: rowsOf(world) })
      } catch (err) {
        ctx.emit('failed', { message: String((err as Error)?.message ?? err) })
      }
    }
    ;(el as HTMLElement & { __build?: typeof build }).__build = build
    build(String(ctx.props['words'] ?? ''), String(ctx.props['seed'] ?? ''))
    ctx.onCleanup(() => stop?.())
  },

  onUpdate: (next, ctx) => {
    const build = (ctx.element as HTMLElement & { __build?: (w: string, s: string) => void }).__build
    build?.(String(next['words'] ?? ''), String(next['seed'] ?? ''))
  },
})
