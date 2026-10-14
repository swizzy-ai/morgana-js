import { defineClientAction } from '@studiomorgana/sdk'

/**
 * Chat wiring — one subscription feeds both panes plus the inspector.
 * History paints first (late joiners see context), live frames append after.
 */

function firedId(ctx: any): string {
  const target = (ctx.event as any)?.target
  if (typeof target === 'string' && target) return target
  const el = (ctx.event as any)?.element as Element | null | undefined
  const node = el?.closest?.('[data-entity]')
  return node?.getAttribute?.('data-entity') ?? ''
}

function paint(ctx: any, msg: { user?: string; text?: string; at?: number }): void {
  const line = `${msg.user ?? '?'}: ${msg.text ?? ''}`
  for (const listId of ['d-chat-a-list', 'd-chat-b-list']) {
    ;(ctx.ui.get(listId) as any)?.append?.({ label: line })
  }
  const insp = ctx.ui.get('d-frames-list') as any
  const kids = (insp?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
  if (kids >= 10) insp?.clear?.()
  insp?.append?.({ label: `channel:docs-chat ${JSON.stringify(msg).slice(0, 120)}` })
}

function readInput(ctx: any, id: string): string {
  const h = ctx.ui.get(id) as any
  const el = h?.getElement?.() as HTMLElement | null | undefined
  if (el && el.tagName === 'INPUT') return (el as HTMLInputElement).value
  return String(h?.value ?? h?.get?.('value') ?? '')
}

let subscribed = false

export const streamPage = defineClientAction({
  config: { on: ['loaded', 'd-chat-a-send.clicked', 'd-chat-b-send.clicked'] },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-stream-content')) return { ok: false, reason: 'not-stream-page' }
    const id = firedId(ctx)

    if (id === '') {
      // First load: paint history, then subscribe exactly once.
      const res = (await ctx.actions.run('chatHistory', {})) as { items: Array<{ user: string; text: string; at: number }> }
      for (const msg of res.items ?? []) paint(ctx, msg)
      if (!subscribed) {
        subscribed = true
        ;(ctx.events as any).subscribe('channel:docs-chat', null, (data: any) => paint(ctx, data ?? {}))
      }
      return { ok: true, history: (res.items ?? []).length }
    }

    const plane = id === 'd-chat-a-send' ? 'a' : id === 'd-chat-b-send' ? 'b' : null
    if (!plane) return { ok: false, reason: 'unknown-control' }
    const text = readInput(ctx, `d-chat-${plane}-new`).trim()
    if (!text) return { ok: false, reason: 'empty' }
    await ctx.actions.run('chatPost', { user: `Plane ${plane.toUpperCase()}`, text })
    const h = ctx.ui.get(`d-chat-${plane}-new`) as any
    if (typeof h?.clear === 'function') h.clear()
    else h?.set?.('value', '')
    // No manual paint: our own frame comes back over the channel like anyone's.
    return { ok: true, posted: true }
  },
})
