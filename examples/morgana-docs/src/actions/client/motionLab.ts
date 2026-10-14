import { defineClientAction } from '@studiomorgana/sdk'

/** Motion lab runner — reads the knobs, runs the preset, logs the settle. */

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
  return ''
}

function log(ctx: any, line: string): void {
  const target = ctx.ui.get('d-motion-log') as any
  const kids = (target?.getElement?.() as Element | null)?.querySelectorAll(':scope > li')?.length ?? 0
  if (kids >= 8) target?.clear?.()
  target?.append?.({ label: line })
}

export const motionLab = defineClientAction({
  config: { on: ['d-motion-run.clicked'] },
  handler: async (ctx) => {
    if (!ctx.ui.get('d-motion-content')) return { ok: false, reason: 'not-motion-page' }
    if (firedId(ctx) !== 'd-motion-run') return { ok: false, reason: 'unknown-control' }
    const stamp = new Date().toLocaleTimeString()

    try {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        log(ctx, `paused — system prefers reduced motion @ ${stamp}`)
        return { ok: true, reduced: true }
      }
    } catch {
      // matchMedia unavailable: attempt the run.
    }

    const preset = readControl(ctx, 'd-motion-preset') || 'spin'
    const duration = Number(readControl(ctx, 'd-motion-duration')) || 600
    const distance = Number(readControl(ctx, 'd-motion-distance')) || 4
    const dir = readControl(ctx, 'd-motion-dir') || 'up'
    const loop = readControl(ctx, 'd-motion-loop') === 'true'
    const alternate = readControl(ctx, 'd-motion-alternate') === 'true'
    const target = (ctx.ui.get('d-motion-target') as any)?.animate as any
    if (!target || typeof target[preset] !== 'function') {
      log(ctx, `unknown preset "${preset}" @ ${stamp}`)
      return { ok: false, reason: 'unknown-preset' }
    }

    const opts: Record<string, unknown> = { duration, distance, loop, alternate }
    if (preset === 'slideIn') opts['from'] = dir
    if (preset === 'slideOut') opts['to'] = dir
    if (loop) {
      void target[preset](opts)
      log(ctx, `${preset} looping (next Run replaces it) @ ${stamp}`)
      return { ok: true, preset, loop: true }
    }
    await target[preset](opts)
    log(ctx, `${preset} settled in ~${duration}ms @ ${stamp}`)
    return { ok: true, preset }
  },
})
