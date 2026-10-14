import { defineClientAction } from '@studiomorgana/sdk'

/** Dye tuner wiring — bg and radius via set(), the effect word via make(). */

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

export const styleLab = defineClientAction({
  config: { on: ['d-dye-bg.changed', 'd-dye-radius.changed', 'd-dye-effect.changed', 'd-dye-font.changed', 'd-dye-gradient.changed'] },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-style-content')) return { ok: false, reason: 'not-style-page' }
    const id = firedId(ctx)
    const target = ctx.ui.get('d-dye-target') as any
    if (!target) return { ok: false, reason: 'no-target' }
    const raw = readControl(ctx, id)
    if (id === 'd-dye-bg') target?.set?.('bg', raw)
    else if (id === 'd-dye-radius') target?.set?.('radius', raw)
    else if (id === 'd-dye-effect') target?.make?.(raw)
    else if (id === 'd-dye-font') (ctx.ui.get('d-dye-target-t') as any)?.set?.('font', raw)
    else if (id === 'd-dye-gradient') {
      if (raw === 'none') target?.set?.('bg', '#FFFFFF')
      else target?.make?.(`gradient:${raw}`)
    } else return { ok: false, reason: 'unknown-control' }
    return { ok: true, knob: id, value: raw }
  },
})
