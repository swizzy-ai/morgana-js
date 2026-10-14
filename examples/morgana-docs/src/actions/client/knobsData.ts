import { defineClientAction } from '@studiomorgana/sdk'

/** Knob + log wiring for the data-objects page. */

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
    const checked = el.getAttribute('data-checked')
    if (checked !== null) return checked
  }
  if (!h) return ''
  const v = h.get?.('value')
  if (typeof v === 'string') return v
  return ''
}

const KNOBS: Record<string, { target: string; prop: string; parse: (raw: string) => unknown; method?: string }> = {
  'd-grid-density': { target: 'd-grid-target', prop: 'density', parse: (v) => v },
  'd-grid-sticky': { target: 'd-grid-target', prop: 'stickyHeader', parse: (v) => v === 'true' },
  'd-grid-select': { target: 'd-grid-target', prop: 'selection', parse: (v) => (v === 'true' ? { mode: 'single' } : false) },
  'd-tabs-active': { target: 'd-tabs-target', prop: 'activeKey', parse: (v) => v },
  'd-tabs-orient': { target: 'd-tabs-target', prop: 'orientation', parse: (v) => v },
  'd-tabs-variant': { target: 'd-tabs-target', prop: 'variant', parse: (v) => v },
  'd-dialog-title': { target: 'd-dialog-target', prop: 'title', parse: (v) => v },
  'd-dialog-variant': { target: 'd-dialog-target', prop: 'variant', parse: (v) => v },
  'd-chart-kind': { target: 'd-chart-target', prop: 'kind', parse: (v) => v },
  'd-folds-multiple': { target: 'd-folds-target', prop: 'multiple', parse: (v) => v === 'true', method: 'setMultiple' },
  'd-folds-collapse': { target: 'd-folds-target', prop: 'collapsible', parse: (v) => v === 'true', method: 'setCollapsible' },
  'd-folds-variant': { target: 'd-folds-target', prop: 'variant', parse: (v) => v, method: 'setVariant' },
  'd-folds-size': { target: 'd-folds-target', prop: 'size', parse: (v) => v, method: 'setSize' },
  'd-pop-title': { target: 'd-pop-target', prop: 'title', parse: (v) => v, method: 'setTitle' },
  'd-pop-place': { target: 'd-pop-target', prop: 'placement', parse: (v) => v, method: 'setPlacement' },
  'd-pop-size': { target: 'd-pop-target', prop: 'size', parse: (v) => v, method: 'setSize' },
  'd-draw-place': { target: 'd-draw-target', prop: 'placement', parse: (v) => v, method: 'setPlacement' },
  'd-draw-size': { target: 'd-draw-target', prop: 'size', parse: (v) => v, method: 'setSize' },
  'd-draw-title': { target: 'd-draw-target', prop: 'title', parse: (v) => v, method: 'setTitle' },
  'd-drop-value': { target: 'd-drop-target', prop: 'value', parse: (v) => v, method: 'setValue' },
  'd-menu-value': { target: 'd-menu-target', prop: 'value', parse: (v) => v, method: 'setValue' },
}

function log(ctx: any, logId: string, line: string): void {
  const target = ctx.ui.get(logId) as any
  const kids = (target?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
  if (kids >= 8) target?.clear?.()
  target?.append?.({ label: line })
}

export const knobsData = defineClientAction({
  config: {
    on: [
      'd-grid-density.changed',
      'd-grid-sticky.changed',
      'd-grid-select.changed',
      'd-tabs-active.changed',
      'd-tabs-orient.changed',
      'd-tabs-variant.changed',
      'd-dialog-title.changed',
      'd-dialog-variant.changed',
      'd-dialog-open.clicked',
      'd-chart-kind.changed',
      'd-rows-new.changed',
      'd-rows-add.clicked',
      'd-rows-clear.clicked',
      'd-rows-target.clicked',
      'd-dialog-target.clicked',
      'd-folds-multiple.changed',
      'd-folds-collapse.changed',
      'd-folds-variant.changed',
      'd-folds-size.changed',
      'd-folds-target.changed',
      'd-pop-title.changed',
      'd-pop-place.changed',
      'd-pop-size.changed',
      'd-pop-target.changed',
      'd-draw-place.changed',
      'd-draw-size.changed',
      'd-draw-title.changed',
      'd-draw-open.clicked',
      'd-draw-target.clicked',
      'd-tip-content.changed',
      'd-tip-show.clicked',
      'd-tip-hide.clicked',
      'd-drop-value.changed',
      'd-drop-open.clicked',
      'd-drop-target.clicked',
      'd-menu-value.changed',
      'd-menu-pick.clicked',
      'd-menu-target.clicked',
      'd-grid-target.clicked',
      'd-tabs-target.changed',
    ],
  },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-data-content')) return { ok: false, reason: 'not-data-page' }
    const id = firedId(ctx)
    const stamp = new Date().toLocaleTimeString()

    if (id === 'd-rows-add') {
      const label = readControl(ctx, 'd-rows-new') || 'Untitled row'
      ;(ctx.ui.get('d-rows-target') as any)?.append?.({ label })
      log(ctx, 'd-rows-log', `appended "${label}" @ ${stamp}`)
      return { ok: true, added: label }
    }
    if (id === 'd-rows-clear') {
      ;(ctx.ui.get('d-rows-target') as any)?.clear?.()
      log(ctx, 'd-rows-log', `cleared @ ${stamp}`)
      return { ok: true, cleared: true }
    }
    if (id === 'd-dialog-open') {
      ;(ctx.ui.get('d-dialog-target') as any)?.open?.()
      log(ctx, 'd-dialog-log', `opened @ ${stamp}`)
      return { ok: true, opened: true }
    }

    if (id === 'd-draw-open') {
      ;(ctx.ui.get('d-draw-target') as any)?.open?.()
      log(ctx, 'd-draw-log', `opened @ ${stamp}`)
      return { ok: true, opened: true }
    }
    if (id === 'd-tip-show') {
      ;(ctx.ui.get('d-tip-target') as any)?.show?.()
      log(ctx, 'd-tip-log', `shown @ ${stamp}`)
      return { ok: true, shown: true }
    }
    if (id === 'd-tip-hide') {
      ;(ctx.ui.get('d-tip-target') as any)?.hide?.()
      log(ctx, 'd-tip-log', `hidden @ ${stamp}`)
      return { ok: true, hidden: true }
    }
    if (id === 'd-drop-open') {
      ;(ctx.ui.get('d-drop-target') as any)?.open?.()
      log(ctx, 'd-drop-log', `opened @ ${stamp}`)
      return { ok: true, opened: true }
    }
    if (id === 'd-menu-pick') {
      const picked = (ctx.ui.get('d-menu-target') as any)?.selectItem?.('y')
      log(ctx, 'd-menu-log', `selectItem('y') → ${picked} @ ${stamp}`)
      return { ok: true, picked }
    }

    const knob = KNOBS[id]
    if (knob) {
      const raw = readControl(ctx, id)
      const target = (ctx.ui.get(knob.target) as any)
      // Chart kind repaints through its own renderer (setKind), not set().
      if (knob.target === 'd-chart-target' && typeof target?.setKind === 'function') {
        target.setKind(raw)
      } else if (knob.method && typeof target?.[knob.method] === 'function') {
        // Structural props the delegation reads off attributes (accordion
        // multiple/collapsible/variant) — methods keep meta + DOM in sync.
        target[knob.method](knob.parse(raw))
      } else {
        target?.set?.(knob.prop, knob.parse(raw))
      }
      // Chart honesty: report whether the kind actually drew something.
      if (knob.target === 'd-chart-target') {
        const el = target?.getElement?.() as Element | null | undefined
        const drawn = (el?.querySelectorAll('svg')?.length ?? 0) > 0
        log(ctx, 'd-chart-log', `kind=${raw} → ${drawn ? 'drawn' : 'NOTHING RENDERED (gap?)'} @ ${stamp}`)
      }
      return { ok: true, knob: id, value: raw }
    }

    const view = id.startsWith('d-rows') ? 'd-rows-log' : id.startsWith('d-grid') ? 'd-grid-log' : id.startsWith('d-tabs') ? 'd-tabs-log' : id.startsWith('d-dialog') ? 'd-dialog-log' : id.startsWith('d-folds') ? 'd-folds-log' : id.startsWith('d-draw') ? 'd-draw-log' : id.startsWith('d-drop') ? 'd-drop-log' : id.startsWith('d-menu') ? 'd-menu-log' : id.startsWith('d-tip') ? 'd-tip-log' : id.startsWith('d-pop') ? 'd-pop-log' : null
    if (view) {
      log(ctx, view, `${id} fired @ ${stamp}`)
      return { ok: true, logged: id }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
