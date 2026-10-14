import { defineClientAction } from '@studiomorgana/sdk'

/**
 * Knob + log wiring for the inputs page. Same shape as knobsBasic: literal
 * `on` (static extraction cannot see computed arrays), a KNOBS table, a LOGS
 * table. The form's "Read values" button calls getValues() and prints JSON.
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
  const el = h?.getElement?.() as HTMLElement | null | undefined
  if (el) {
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return (el as HTMLInputElement).value
    const nested = el.querySelector('select, input') as HTMLInputElement | null
    if (nested) return nested.value
    const checked = el.getAttribute('data-checked')
    if (checked !== null) return checked
  }
  if (!h) return ''
  if (typeof h.value === 'string') return h.value
  const v = h.get?.('value')
  if (typeof v === 'string') return v
  const c = h.get?.('checked')
  if (typeof c === 'boolean') return String(c)
  return ''
}

const KNOBS: Record<string, { target: string; prop: string; parse: (raw: string) => unknown; method?: string }> = {
  'd-button-label': { target: 'd-button-target', prop: 'label', parse: (v) => v },
  'd-button-variant': { target: 'd-button-target', prop: 'variant', parse: (v) => v },
  'd-button-disabled': { target: 'd-button-target', prop: 'disabled', parse: (v) => v === 'true' },
  'd-field-placeholder': { target: 'd-field-target', prop: 'placeholder', parse: (v) => v },
  'd-field-type': { target: 'd-field-target', prop: 'type', parse: (v) => v },
  'd-field-disabled': { target: 'd-field-target', prop: 'disabled', parse: (v) => v === 'true' },
  'd-area-placeholder': { target: 'd-area-target', prop: 'placeholder', parse: (v) => v },
  'd-area-rows': { target: 'd-area-target', prop: 'rows', parse: Number },
  'd-area-disabled': { target: 'd-area-target', prop: 'disabled', parse: (v) => v === 'true' },
  'd-tag-content': { target: 'd-tag-target', prop: 'content', parse: (v) => v },
  'd-tag-for': { target: 'd-tag-target', prop: 'for', parse: (v) => v },
  'd-num-value': { target: 'd-num-target', prop: 'value', parse: Number, method: 'setValue' },
  'd-num-step': { target: 'd-num-target', prop: 'step', parse: Number, method: 'setStep' },
  'd-pin-value': { target: 'd-pin-target', prop: 'value', parse: (v) => v, method: 'setValue' },
  'd-pick-value': { target: 'd-pick-target', prop: 'value', parse: (v) => v },
  'd-pick-searchable': { target: 'd-pick-target', prop: 'searchable', parse: (v) => v === 'true' },
  'd-pick-clearable': { target: 'd-pick-target', prop: 'clearable', parse: (v) => v === 'true' },
  'd-switch-label': { target: 'd-switch-target', prop: 'label', parse: (v) => v },
  'd-switch-checked': { target: 'd-switch-target', prop: 'checked', parse: (v) => v === 'true' },
  'd-switch-size': { target: 'd-switch-target', prop: 'size', parse: (v) => v },
  'd-switch-kind': { target: 'd-switch-target', prop: 'kind', parse: (v) => v },
  'd-form-layout': { target: 'd-form-target', prop: 'layout', parse: (v) => v },
  'd-progress-value': { target: 'd-progress-target', prop: 'value', parse: Number },
  'd-progress-variant': { target: 'd-progress-target', prop: 'variant', parse: (v) => v },
  'd-progress-striped': { target: 'd-progress-target', prop: 'striped', parse: (v) => v === 'true' },
  'd-progress-animated': { target: 'd-progress-target', prop: 'animated', parse: (v) => v === 'true' },
  'd-progress-label': { target: 'd-progress-target', prop: 'showLabel', parse: (v) => v === 'true' },
  'd-slide-value': { target: 'd-slide-target', prop: 'value', parse: Number, method: 'setValue' },
  'd-slide-step': { target: 'd-slide-target', prop: 'step', parse: Number, method: 'setStep' },
  'd-slide-size': { target: 'd-slide-target', prop: 'size', parse: (v) => v, method: 'setSize' },
}

const LOGS: Record<string, string> = {
  'd-button-target': 'd-button-log',
  'd-field-target': 'd-field-log',
  'd-area-target': 'd-area-log',
  'd-tag-target': 'd-lbl-log',
  'd-num-target': 'd-num-log',
  'd-pin-target': 'd-pin-log',
  'd-pick-target': 'd-pick-log',
  'd-switch-target': 'd-switch-log',
  'd-form-target': 'd-form-log',
  'd-form-read': 'd-form-log',
  'd-slide-target': 'd-slide-log',
}

function log(ctx: any, logId: string, line: string): void {
  const target = ctx.ui.get(logId) as any
  const kids = (target?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
  if (kids >= 8) target?.clear?.()
  target?.append?.({ label: line })
}

export const knobsInput = defineClientAction({
  config: {
    on: [
      'd-button-label.changed',
      'd-button-variant.changed',
      'd-button-disabled.changed',
      'd-field-placeholder.changed',
      'd-field-type.changed',
      'd-field-disabled.changed',
      'd-field-target.changed',
      'd-area-placeholder.changed',
      'd-area-rows.changed',
      'd-area-disabled.changed',
      'd-area-target.changed',
      'd-tag-content.changed',
      'd-tag-for.changed',
      'd-num-value.changed',
      'd-num-step.changed',
      'd-num-target.changed',
      'd-pin-value.changed',
      'd-pin-clear.clicked',
      'd-pin-target.changed',
      'd-pin-target.complete',
      'd-pick-value.changed',
      'd-pick-searchable.changed',
      'd-pick-clearable.changed',
      'd-switch-label.changed',
      'd-switch-checked.changed',
      'd-switch-size.changed',
      'd-switch-kind.changed',
      'd-form-layout.changed',
      'd-progress-value.changed',
      'd-progress-variant.changed',
      'd-progress-striped.changed',
      'd-progress-animated.changed',
      'd-progress-label.changed',
      'd-form-read.clicked',
      'd-slide-value.changed',
      'd-slide-step.changed',
      'd-slide-size.changed',
      'd-slide-target.changed',
      'd-button-target.clicked',
      'd-field-target.changed',
      'd-pick-target.changed',
      'd-switch-target.changed',
      'd-form-target.submitted',
    ],
  },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-input-content')) return { ok: false, reason: 'not-input-page' }
    const id = firedId(ctx)

    if (id === 'd-form-read') {
      const values = ((ctx.ui.get('d-form-target') as any)?.getValues?.() ?? {}) as Record<string, unknown>
      ;(ctx.ui.get('d-form-out') as any)?.set?.('content', JSON.stringify(values))
      log(ctx, 'd-form-log', `read values @ ${new Date().toLocaleTimeString()}`)
      return { ok: true, read: values }
    }
    if (id === 'd-pin-clear') {
      ;(ctx.ui.get('d-pin-target') as any)?.clear?.()
      log(ctx, 'd-pin-log', `cleared @ ${new Date().toLocaleTimeString()}`)
      return { ok: true, cleared: true }
    }

    const knob = KNOBS[id]
    if (knob) {
      const raw = readControl(ctx, id)
      const target = (ctx.ui.get(knob.target) as any)
      // Props with handle semantics bypass generic set(), which cannot
      // reproduce them: `checked` needs data-checked + aria (check/uncheck),
      // progress `value` needs fill width + aria + label (setValue).
      if (knob.prop === 'checked' && typeof target?.check === 'function') {
        if (knob.parse(raw) === true) target.check()
        else target.uncheck()
      } else if (knob.method && typeof target?.[knob.method] === 'function') {
        target[knob.method](knob.parse(raw))
      } else if (knob.prop === 'value' && typeof target?.setValue === 'function') {
        target.setValue(knob.parse(raw))
      } else {
        target?.set?.(knob.prop, knob.parse(raw))
      }
      return { ok: true, knob: id, value: raw }
    }

    const logId = LOGS[id]
    if (logId) {
      log(ctx, logId, `${id} fired @ ${new Date().toLocaleTimeString()}`)
      return { ok: true, logged: id }
    }
    return { ok: false, reason: 'unknown-control' }
  },
})
