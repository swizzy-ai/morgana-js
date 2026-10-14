import { defineClientAction } from '@studiomorgana/sdk'

/** Knob + log wiring for the structure-objects page. */

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

export const knobsStructure = defineClientAction({
  config: {
    on: [
      'd-stack-layout.changed',
      'd-stack-gap.changed',
      'd-stack-bg.changed',
      'd-variants-add.clicked',
      'd-variants-read.clicked',
    ],
  },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-structure-content')) return { ok: false, reason: 'not-structure-page' }
    const id = firedId(ctx)
    const stamp = new Date().toLocaleTimeString()

    if (id === 'd-stack-layout' || id === 'd-stack-gap' || id === 'd-stack-bg') {
      const prop = id === 'd-stack-layout' ? 'layout' : id === 'd-stack-gap' ? 'gap' : 'bg'
      const raw = readControl(ctx, id)
      ;(ctx.ui.get('d-stack-target') as any)?.set?.(prop, prop === 'gap' ? Number(raw) : raw)
      return { ok: true, knob: id }
    }
    if (id === 'd-variants-add') {
      const lister = ctx.ui.get('d-variants-lister') as any
      const n = (lister?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
      lister?.append?.({ label: `Row ${n + 1}` })
      log(ctx, 'd-variants-log', `appended row ${n + 1} @ ${stamp}`)
      return { ok: true }
    }
    if (id === 'd-variants-read') {
      const values = ((ctx.ui.get('d-variants-login') as any)?.getValues?.() ?? {}) as Record<string, unknown>
      ;(ctx.ui.get('d-variants-out') as any)?.set?.('content', JSON.stringify(values))
      return { ok: true }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
