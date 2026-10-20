import { defineClientAction } from '@studiomorgana/sdk'

/**
 * The page's actions: the words go to the world as you type (throttled), a
 * new world draws a new seed, keep pins the one on screen, and what the world
 * made comes back as the seed line and the handle list.
 */

const world = (ctx: { ui: { get(id: string): { set(k: string, v: unknown): void } | undefined } }) => ctx.ui.get('world')

export const sayWorld = defineClientAction({
  config: { on: 'state:words', debounce: 600 },
  handler: (ctx) => {
    ctx.ui.setState({ seed: '' })
    world(ctx)?.set('seed', '')
    world(ctx)?.set('words', ctx.ui.state.get('words'))
  },
})

export const newWorld = defineClientAction({
  config: { on: 'again.clicked' },
  handler: (ctx) => {
    ctx.ui.setState({ seed: '' })
    world(ctx)?.set('seed', '')
    // Same words, a fresh draw: nudge the prop so the world builds again.
    world(ctx)?.set('words', `${String(ctx.ui.state.get('words'))}${' '.repeat(Math.floor(Math.random() * 3) + 1)}`)
  },
})

export const keepWorld = defineClientAction({
  config: { on: 'keep.clicked' },
  handler: (ctx) => {
    const seed = String(ctx.ui.state.get('shownSeed') ?? '')
    if (!seed) return
    ctx.ui.setState({ seed, note: `Kept: this exact world is at ?seed=${seed}. Change a handle line and only that changes.` })
    world(ctx)?.set('seed', seed)
  },
})

export const worldMade = defineClientAction({
  config: { on: 'world.made' },
  handler: (ctx) => {
    const p = ctx.event.payload as { seed: string; pinned: boolean; unknown: string[]; nearest: number; rows: unknown[] }
    ctx.ui.setState({
      shownSeed: p.seed,
      shown: `seed ${p.seed}${p.pinned ? ' · kept' : ''} · ${p.nearest >= 1 ? 'first world' : `${Math.round(p.nearest * 100)}% different from the last ones`}`,
      note: p.unknown.length ? `Not understood: ${p.unknown.join(', ')}` : '',
      rows: p.rows,
    })
  },
})

export const worldFailed = defineClientAction({
  config: { on: 'world.failed' },
  handler: (ctx) => { ctx.ui.setState({ note: String((ctx.event.payload as { message: string }).message) }) },
})

/** On open: a kept seed in the address shows that exact world. */
export const openWorld = defineClientAction({
  config: { on: 'loaded' },
  handler: (ctx) => {
    if (ctx.event.origin !== 'home') return
    const seed = String(ctx.ui.state.get('seed') ?? '')
    if (seed) world(ctx)?.set('seed', seed)
    world(ctx)?.set('words', ctx.ui.state.get('words'))
  },
})
