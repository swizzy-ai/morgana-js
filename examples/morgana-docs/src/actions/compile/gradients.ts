import { defineClientAction } from '@morgana/sdk'

/**
 * Stock gradients — the installable pack.
 *
 * INSTALL: copy this one file into your project's `src/actions/compile/`
 * and add `'gradients'` to the compile `run` list in `morgana.config.ts`.
 * No other changes, no dependencies. 16 curated backgrounds, each usable
 * anywhere a background works:
 *
 *   box.make('gradient:sunset')        // explicit
 *   box.make('sunset')                 // bare, once registered here
 *   box.setProps({ bg: 'gradient:sunset' })
 *
 * Custom packs follow the same shape: another file, `transformers.gradients`
 * `add()` calls, `pack:name` ids to avoid collisions. A bad spec fails the
 * build naming this action — never a silent unstyled page.
 */

const STOCK: Record<string, { type: 'linear' | 'radial' | 'conic'; angle?: number; stops: Array<{ color: string; at?: number }> }> = {
  sunset: { type: 'linear', angle: 135, stops: [{ color: '#F59E0B' }, { color: '#EC4899' }] },
  ocean: { type: 'linear', angle: 135, stops: [{ color: '#0284C7' }, { color: '#6366F1' }] },
  forest: { type: 'linear', angle: 135, stops: [{ color: '#10B981' }, { color: '#065F46' }] },
  berry: { type: 'linear', angle: 135, stops: [{ color: '#A855F7' }, { color: '#EC4899' }] },
  royal: { type: 'linear', angle: 135, stops: [{ color: '#5B21B6' }, { color: '#1E1B4B' }] },
  ember: { type: 'linear', angle: 135, stops: [{ color: '#EF4444' }, { color: '#7C2D12' }] },
  mint: { type: 'linear', angle: 135, stops: [{ color: '#6EE7B7' }, { color: '#0284C7' }] },
  peach: { type: 'linear', angle: 135, stops: [{ color: '#FDBA74' }, { color: '#F472B6' }] },
  storm: { type: 'linear', angle: 135, stops: [{ color: '#475569' }, { color: '#0F172A' }] },
  candy: { type: 'linear', angle: 135, stops: [{ color: '#F9A8D4' }, { color: '#A78BFA' }] },
  lagoon: { type: 'linear', angle: 135, stops: [{ color: '#22D3EE' }, { color: '#10B981' }] },
  wine: { type: 'linear', angle: 135, stops: [{ color: '#9D174D' }, { color: '#3F1521' }] },
  gold: { type: 'linear', angle: 135, stops: [{ color: '#FDE68A' }, { color: '#D97706' }] },
  slate: { type: 'linear', angle: 135, stops: [{ color: '#F1F5F9' }, { color: '#CBD5E1' }] },
  blossom: { type: 'radial', stops: [{ color: '#FDF2F4' }, { color: '#F9A8D4' }] },
  midnight: { type: 'conic', stops: [{ color: '#1E1B4B' }, { color: '#5B21B6' }, { color: '#1E1B4B' }] },
}

export const gradients = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const store = (ctx.ui.transformers as any).gradients
    let count = 0
    for (const [name, spec] of Object.entries(STOCK)) {
      if (!store.has(name)) {
        store.add(name, spec)
        count += 1
      }
    }
    return { ok: true, registered: count, total: Object.keys(STOCK).length }
  },
})
