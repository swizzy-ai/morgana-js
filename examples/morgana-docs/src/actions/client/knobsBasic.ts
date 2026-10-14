import { defineClientAction } from '@morgana/sdk'

/**
 * Knob + log wiring for the basic-objects page. One action owns every knob
 * event on the page (`on` is an array; `firedId` tells them apart) and every
 * logged target event. The KNOBS table is the whole contract: knob id →
 * target, prop, and how to read the control.
 */

function firedId(ctx: any): string {
  const target = (ctx.event as any)?.target
  if (typeof target === 'string' && target) return target
  const el = (ctx.event as any)?.element as Element | null | undefined
  const node = el?.closest?.('[data-entity]')
  return node?.getAttribute?.('data-entity') ?? ''
}

function readControl(ctx: any, id: string): string {
  const h = ctx.ui.get(id) as any
  // The DOM is the freshest truth: handle getters can lag the just-fired
  // change (the select above proved it — handle still held the old value
  // while the <select> already showed the new one).
  const el = h?.getElement?.() as HTMLElement | null | undefined
  if (el) {
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
      return (el as HTMLInputElement).value
    }
    const nested = el.querySelector('select, input') as HTMLInputElement | null
    if (nested) return nested.value
    const checked = el.getAttribute('data-checked')
    if (checked !== null) return checked
  }
  if (!h) return ''
  if (typeof h.value === 'string') return h.value
  const v = h.get?.('value')
  if (typeof v === 'string') return v
  if (typeof h.checked === 'boolean') return String(h.checked)
  const c = h.get?.('checked')
  if (typeof c === 'boolean') return String(c)
  return ''
}

/** knob id → target id, prop, and value coercion. */
const KNOBS: Record<string, { target: string; prop: string; parse: (raw: string) => unknown; method?: string }> = {
  'd-box-bg': { target: 'd-box-target', prop: 'bg', parse: (v) => v },
  'd-box-pad': { target: 'd-box-target', prop: 'pad', parse: Number },
  'd-box-radius': { target: 'd-box-target', prop: 'radius', parse: (v) => v },
  'd-text-content': { target: 'd-text-target', prop: 'content', parse: (v) => v },
  'd-text-font': { target: 'd-text-target', prop: 'font', parse: (v) => v },
  'd-text-color': { target: 'd-text-target', prop: 'color', parse: (v) => v },
  'd-link-href': { target: 'd-link-target', prop: 'href', parse: (v) => v },
  'd-image-src': { target: 'd-image-target', prop: 'src', parse: (v) => v },
  'd-image-fit': { target: 'd-image-target', prop: 'fit', parse: (v) => v },
  'd-image-width': { target: 'd-image-target', prop: 'width', parse: (v) => v },
  'd-badge-label': { target: 'd-badge-target', prop: 'label', parse: (v) => v },
  'd-badge-variant': { target: 'd-badge-target', prop: 'variant', parse: (v) => v },
  'd-alert-title': { target: 'd-alert-target', prop: 'title', parse: (v) => v },
  'd-alert-variant': { target: 'd-alert-target', prop: 'variant', parse: (v) => v },
  'd-alert-dismiss': { target: 'd-alert-target', prop: 'dismissible', parse: (v) => v === 'true' },
  'd-avatar-name': { target: 'd-avatar-target', prop: 'name', parse: (v) => v, method: 'setName' },
  'd-avatar-src': { target: 'd-avatar-target', prop: 'src', parse: (v) => v, method: 'setSrc' },
  'd-avatar-status': { target: 'd-avatar-target', prop: 'status', parse: (v) => v, method: 'setStatus' },
  'd-rule-orient': { target: 'd-rule-target', prop: 'orientation', parse: (v) => v, method: 'setOrientation' },
  'd-rule-variant': { target: 'd-rule-target', prop: 'variant', parse: (v) => v, method: 'setVariant' },
  'd-skel-animate': { target: 'd-skel-target', prop: 'animate', parse: (v) => v === 'true', method: 'setAnimate' },
  'd-skel-width': { target: 'd-skel-target', prop: 'width', parse: (v) => v, method: 'setSize' },
  'd-crumbs-sep': { target: 'd-crumbs-target', prop: 'separator', parse: (v) => v, method: 'setSeparator' },
  'd-quote-status': { target: 'd-quote-status-t', prop: 'value', parse: (v) => v, method: 'setValue' },
  'd-facts-ring': { target: 'd-facts-ring-t', prop: 'value', parse: Number, method: 'setValue' },
}

/** target id → its log list. Clicks/changes on targets land here. */
const LOGS: Record<string, string> = {
  'd-box-target': 'd-box-log',
  'd-box-target-t': 'd-box-log',
  'd-badge-target': 'd-badge-log',
  'd-alert-target': 'd-alert-log',
  'd-link-target': 'd-link-log',
  'd-toast-target': 'd-toast-log',
  'd-facts-code': 'd-facts-log',
}

/** Toast demo buttons → variant (flood/clear handled specially). */
const TOAST_VARIANTS: Record<string, string> = {
  'd-toast-info': 'info',
  'd-toast-success': 'success',
  'd-toast-warning': 'warning',
  'd-toast-danger': 'danger',
}

export const knobsBasic = defineClientAction({
  // NOTE: `on` must be a literal — the compiler extracts triggers statically
  // and cannot see spreads/computed arrays. Keep this list in sync with
  // KNOBS + LOGS below; a knob missing here simply never fires.
  config: {
    on: [
      'd-box-bg.changed',
      'd-box-pad.changed',
      'd-box-radius.changed',
      'd-text-content.changed',
      'd-text-font.changed',
      'd-text-color.changed',
      'd-link-href.changed',
      'd-image-src.changed',
      'd-image-fit.changed',
      'd-image-width.changed',
      'd-badge-label.changed',
      'd-badge-variant.changed',
      'd-alert-title.changed',
      'd-alert-variant.changed',
      'd-alert-dismiss.changed',
      'd-avatar-name.changed',
      'd-avatar-src.changed',
      'd-avatar-status.changed',
      'd-rule-orient.changed',
      'd-rule-variant.changed',
      'd-skel-animate.changed',
      'd-skel-width.changed',
      'd-crumbs-sep.changed',
      'd-quote-status.changed',
      'd-facts-ring.changed',
      'd-facts-code.copied',
      'd-facts-code.copyFailed',
      'd-media-vplay.clicked',
      'd-media-vpause.clicked',
      'd-media-aplay.clicked',
      'd-media-apause.clicked',
      'd-box-target.clicked',
      'd-box-target-t.clicked',
      'd-badge-target.clicked',
      'd-alert-target.clicked',
      'd-link-target.clicked',
      'd-toast-info.clicked',
      'd-toast-success.clicked',
      'd-toast-warning.clicked',
      'd-toast-danger.clicked',
      'd-toast-flood.clicked',
      'd-toast-clear.clicked',
      'd-toast-target.clicked',
    ],
  },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-basic-content')) return { ok: false, reason: 'not-basic-page' }
    const id = firedId(ctx)

    if (id === 'd-media-vplay' || id === 'd-media-vpause' || id === 'd-media-aplay' || id === 'd-media-apause') {
      const target = id.includes('vplay') || id.includes('vpause') ? 'd-media-vtarget' : 'd-media-atarget'
      const verb = id.includes('pause') ? 'pause' : 'play'
      ;(ctx.ui.get(target) as any)?.[verb]?.()
      return { ok: true, media: `${target}.${verb}` }
    }

    if (id === 'd-toast-flood' || id === 'd-toast-clear' || TOAST_VARIANTS[id]) {
      const region = (ctx.ui.get('d-toast-target') as any)
      const stamp = new Date().toLocaleTimeString()
      if (id === 'd-toast-clear') {
        region?.clear?.()
        return { ok: true, cleared: true }
      }
      const duration = Number(readControl(ctx, 'd-toast-duration')) || 4000
      if (id === 'd-toast-flood') {
        for (let i = 1; i <= 7; i += 1) region?.notify?.({ title: `Toast ${i}`, description: 'cap drops the oldest', variant: 'info', duration })
      } else {
        region?.notify?.({ title: `${TOAST_VARIANTS[id]} toast`, description: `shown @ ${stamp}`, variant: TOAST_VARIANTS[id], duration })
      }
      return { ok: true, toasted: id }
    }

    const knob = KNOBS[id]
    if (knob) {
      const raw = readControl(ctx, id)
      const target = (ctx.ui.get(knob.target) as any)
      if (knob.method && typeof target?.[knob.method] === 'function') {
        target[knob.method](knob.parse(raw))
      } else {
        target?.set?.(knob.prop, knob.parse(raw))
      }
      return { ok: true, knob: id, value: raw }
    }

    const logId = LOGS[id]
    if (logId) {
      const log = ctx.ui.get(logId) as any
      const kids = (log?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
      if (kids >= 8) log?.clear?.()
      const when = new Date().toLocaleTimeString()
      log?.append?.({ label: `${id} fired @ ${when}` })
      return { ok: true, logged: id }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
