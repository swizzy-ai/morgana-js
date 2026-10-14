import { defineClientAction } from '@morgana/sdk'

/** Knob + log wiring for the display-objects page. */

function firedId(ctx: any): string {
  const target = (ctx.event as any)?.target
  if (typeof target === 'string' && target) return target
  const el = (ctx.event as any)?.element as Element | null | undefined
  const node = el?.closest?.('[data-entity]')
  return node?.getAttribute?.('data-entity') ?? ''
}

function readControl(ctx: any, id: string): string {
  const h = ctx.ui.get(id) as any
  const el = h?.getElement?.() as HTMLElement | null | undefined
  if (el) {
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return (el as HTMLInputElement).value
    const nested = el.querySelector('select, input') as HTMLInputElement | null
    if (nested) return nested.value
  }
  return ''
}

function log(ctx: any, logId: string, line: string): void {
  const target = ctx.ui.get(logId) as any
  const kids = (target?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
  if (kids >= 8) target?.clear?.()
  target?.append?.({ label: line })
}

const RELOAD_ITEMS = [
  { title: 'Reviewed', time: '11:15', content: 'docs pass finished' },
  { title: 'Merged', time: '11:40', content: 'five components landed' },
]

export const knobsDisplay = defineClientAction({
  config: {
    on: [
      'd-steps-current.changed',
      'd-steps-prev.clicked',
      'd-steps-next.clicked',
      'd-timeline-reload.clicked',
      'd-stat-value.changed',
      'd-stat-delta.changed',
      'd-stat-trend.changed',
      'd-tag2-label.changed',
      'd-tag2-variant.changed',
      'd-combo-value.changed',
      'd-combo-target.changed',
      'd-tags-clear.clicked',
      'd-tags-target.changed',
      'd-tree-expand.clicked',
      'd-tree-collapse.clicked',
      'd-tree-target.changed',
      'd-tree-target.selected',
      'd-rate-value.changed',
      'd-rate-target.changed',
      'd-edit-value.changed',
      'd-edit-target.changed',
      'd-edit-target.submitted',
      'd-files-target.changed',
    ],
  },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-display-content')) return { ok: false, reason: 'not-display-page' }
    const id = firedId(ctx)
    const stamp = new Date().toLocaleTimeString()

    if (id === 'd-steps-prev') {
      ;(ctx.ui.get('d-steps-target') as any)?.prev?.()
      log(ctx, 'd-steps-log', `prev @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-steps-next') {
      ;(ctx.ui.get('d-steps-target') as any)?.next?.()
      log(ctx, 'd-steps-log', `next @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-steps-current') {
      const n = Number(readControl(ctx, id)) || 0
      ;(ctx.ui.get('d-steps-target') as any)?.setCurrent?.(n)
      return { ok: true, current: n }
    }
    if (id === 'd-timeline-reload') {
      ;(ctx.ui.get('d-timeline-target') as any)?.setItems?.(RELOAD_ITEMS)
      log(ctx, 'd-timeline-log', `reloaded 2 items @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-stat-value') {
      ;(ctx.ui.get('d-stat-target') as any)?.setValue?.(readControl(ctx, id))
      return { ok: true }
    }
    if (id === 'd-stat-delta' || id === 'd-stat-trend') {
      const delta = id === 'd-stat-delta' ? readControl(ctx, id) : undefined
      const trend = id === 'd-stat-trend' ? readControl(ctx, id) : undefined
      const cur = (ctx.ui.get('d-stat-target') as any)
      const keepDelta = delta ?? String(cur?.get?.('delta') ?? '')
      const keepTrend = (trend ?? String(cur?.get?.('trend') ?? 'up')) as 'up' | 'down' | 'flat'
      cur?.setDelta?.(keepDelta, keepTrend)
      return { ok: true }
    }
    if (id === 'd-tag2-label') {
      ;(ctx.ui.get('d-tag2-target') as any)?.setLabel?.(readControl(ctx, id))
      return { ok: true }
    }
    if (id === 'd-tag2-variant') {
      ;(ctx.ui.get('d-tag2-target') as any)?.setVariant?.(readControl(ctx, id))
      return { ok: true }
    }
    if (id === 'd-combo-value') {
      const v = readControl(ctx, id)
      ;(ctx.ui.get('d-combo-target') as any)?.setValue?.(v)
      log(ctx, 'd-combo-log', `set value "${v}" @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-tags-clear') {
      ;(ctx.ui.get('d-tags-target') as any)?.clear?.()
      log(ctx, 'd-tags-log', `cleared @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-tree-expand') {
      ;(ctx.ui.get('d-tree-target') as any)?.expand?.()
      log(ctx, 'd-tree-log', `expanded all @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-tree-collapse') {
      ;(ctx.ui.get('d-tree-target') as any)?.collapse?.()
      log(ctx, 'd-tree-log', `collapsed all @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-rate-value') {
      const v = Number(readControl(ctx, id)) || 0
      ;(ctx.ui.get('d-rate-target') as any)?.setValue?.(v)
      return { ok: true }
    }
    if (id === 'd-edit-value') {
      const v = readControl(ctx, id)
      if (v !== '') {
        ;(ctx.ui.get('d-edit-target') as any)?.setValue?.(v)
        return { ok: true }
      }
      return { ok: false, reason: 'empty' }
    }
    // Target events (changed/selected/submitted) land in their view's log.
    const logFor: Record<string, string> = {
      'd-combo-target': 'd-combo-log',
      'd-tags-target': 'd-tags-log',
      'd-tree-target': 'd-tree-log',
      'd-rate-target': 'd-rate-log',
      'd-edit-target': 'd-edit-log',
      'd-files-target': 'd-files-log',
    }
    const eventName = String((ctx.event as any)?.name ?? 'event')
    if (logFor[id]) {
      log(ctx, logFor[id], `${id} ${eventName} @ ${stamp}`)
      return { ok: true, logged: id }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
