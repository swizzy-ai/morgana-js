import { defineClientAction } from '@studiomorgana/sdk'

/** Backend page wiring — notes CRUD through server actions. */

function firedId(ctx: any): string {
  const target = (ctx.event as any)?.target
  if (typeof target === 'string' && target) return target
  const el = (ctx.event as any)?.element as Element | null | undefined
  const node = el?.closest?.('[data-entity]')
  return node?.getAttribute?.('data-entity') ?? ''
}

function readInput(ctx: any, id: string): string {
  const h = ctx.ui.get(id) as any
  const el = h?.getElement?.() as HTMLElement | null | undefined
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return (el as HTMLInputElement).value
  return String(h?.value ?? h?.get?.('value') ?? '')
}

async function refresh(ctx: any): Promise<void> {
  const res = (await ctx.actions.run('notesList', {})) as { items: Array<{ text: string }> }
  const items = res.items ?? []
  const list = ctx.ui.get('d-notes-list') as any
  list?.clear?.()
  for (const item of items) list?.append?.({ label: item.text })
  ;(ctx.ui.get('d-notes-count') as any)?.set?.(
    'content',
    items.length === 0 ? 'No notes — add one above.' : `${items.length} note${items.length === 1 ? '' : 's'} in docs_notes`,
  )
}

export const backendPage = defineClientAction({
  config: { on: ['loaded', 'd-notes-add.clicked', 'd-notes-clear.clicked'] },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-backend-content')) return { ok: false, reason: 'not-backend-page' }
    const id = firedId(ctx)

    if (id === 'd-notes-add' || id === '') {
      // '' carries the loaded event alongside explicit add clicks; both
      // refresh, only the button writes.
      if (id === 'd-notes-add') {
        const text = readInput(ctx, 'd-notes-new').trim()
        if (!text) return { ok: false, reason: 'empty' }
        await ctx.actions.run('notesAdd', { text })
        const h = ctx.ui.get('d-notes-new') as any
        if (typeof h?.clear === 'function') h.clear()
        else h?.set?.('value', '')
      }
      await refresh(ctx)
      return { ok: true }
    }
    if (id === 'd-notes-clear') {
      await ctx.actions.run('notesClear', {})
      await refresh(ctx)
      return { ok: true, cleared: true }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
