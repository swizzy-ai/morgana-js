import { defineClientAction } from '@morgana/sdk'

/** Lanes page wiring — server round-trip vs local answer. */

function firedId(ctx: any): string {
  const target = (ctx.event as any)?.target
  if (typeof target === 'string' && target) return target
  const el = (ctx.event as any)?.element as Element | null | undefined
  const node = el?.closest?.('[data-entity]')
  return node?.getAttribute?.('data-entity') ?? ''
}

export const lanesPage = defineClientAction({
  config: { on: ['d-lane-server-go.clicked', 'd-lane-client-go.clicked'] },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-lanes-content')) return { ok: false, reason: 'not-lanes-page' }
    const id = firedId(ctx)
    if (id === 'd-lane-server-go') {
      const t0 = Date.now()
      const res = (await ctx.actions.run('laneEcho', { msg: 'hello from docs' })) as any
      ;(ctx.ui.get('d-lane-server-out') as any)?.set?.(
        'content',
        `lane=${res.lane} at=${res.at} echo="${res.echo}" (${Date.now() - t0}ms round trip)`,
      )
      return { ok: true, lane: 'server' }
    }
    if (id === 'd-lane-client-go') {
      ;(ctx.ui.get('d-lane-client-out') as any)?.set?.(
        'content',
        `lane=client at=${new Date().toISOString()} echo="hello from docs" (0ms — never left the page)`,
      )
      return { ok: true, lane: 'client' }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
