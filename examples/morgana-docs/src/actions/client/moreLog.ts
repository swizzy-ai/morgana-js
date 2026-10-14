import { defineClientAction } from '@morgana/sdk'

/**
 * Event logs for the More components page. `config.on` must be a string
 * literal (the compiler reads it statically), so each binding is spelled out.
 */
function show(ctx: any, view: string, event: string): void {
  const p = (ctx.event?.payload ?? {}) as Record<string, unknown>
  const detail = ['value', 'page', 'index']
    .filter((k) => k in p)
    .map((k) => `${k}: ${String(p[k])}`)
    .join(', ')
  ;(ctx.ui.get(`d-${view}-log`) as any)?.append({ label: `${event}${detail ? ` — ${detail}` : ''}` })
}

export const mDateChanged = defineClientAction({ config: { on: 'm-date-target.changed' }, handler: (ctx) => show(ctx, 'm-date', 'changed') })
export const mRadioChanged = defineClientAction({ config: { on: 'm-radio-target.changed' }, handler: (ctx) => show(ctx, 'm-radio', 'changed') })
export const mPagesChanged = defineClientAction({ config: { on: 'm-pages-target.changed' }, handler: (ctx) => show(ctx, 'm-pages', 'changed') })
export const mCollOpened = defineClientAction({ config: { on: 'm-coll-target.opened' }, handler: (ctx) => show(ctx, 'm-coll', 'opened') })
export const mCollClosed = defineClientAction({ config: { on: 'm-coll-target.closed' }, handler: (ctx) => show(ctx, 'm-coll', 'closed') })
export const mCarChanged = defineClientAction({ config: { on: 'm-car-target.changed' }, handler: (ctx) => show(ctx, 'm-car', 'changed') })
export const mColorChanged = defineClientAction({ config: { on: 'm-color-target.changed' }, handler: (ctx) => show(ctx, 'm-color', 'changed') })
export const mCtxSelected = defineClientAction({ config: { on: 'm-ctx-target.selected' }, handler: (ctx) => show(ctx, 'm-ctx', 'selected') })

export const mCmdOpen = defineClientAction({
  config: { on: 'm-cmd-open.clicked' },
  handler: (ctx) => {
    ;(ctx.ui.get('m-cmd-target') as any)?.open()
  },
})

/** The palette's commands: navigate, or switch the page's colour mode. */
export const mCmdSelected = defineClientAction({
  config: { on: 'm-cmd-target.selected' },
  handler: (ctx) => {
    show(ctx, 'm-cmd', 'selected')
    const v = String((ctx.event?.payload as { value?: string } | undefined)?.value ?? '')
    if (v === 'theme:dark') ctx.ui.setTheme('dark')
    if (v === 'theme:light') ctx.ui.setTheme('light')
    if (v === 'nav:home') location.assign('/')
    if (v === 'nav:style') location.assign('/style/')
  },
})
