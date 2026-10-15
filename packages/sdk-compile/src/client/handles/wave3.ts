/**
 * Handle methods for datePicker, radioGroup, pagination, collapsible,
 * carousel, colorPicker, contextMenu and commandPalette.
 *
 * Value-like methods write the prop; `setProp` routes it through the same
 * painter a user interaction uses (`window.__mg3`, behaviors/wave3.ts — see
 * WAVE3_PROPS in runtime.ts), so a method and a click paint the same DOM and
 * emit the same event, once. Open/close-style methods call the painter.
 */
import { extend, type HandleCtx } from './shared'

type Painters = Record<string, (...a: unknown[]) => unknown>
const mg3 = (): Painters => ((typeof window !== 'undefined' && (window as unknown as { __mg3?: Painters }).__mg3) || {}) as Painters

function call<T>(ctx: HandleCtx, fn: string, ...args: unknown[]): T | undefined {
  const p = mg3()[fn]
  if (!ctx.el || !p) return undefined
  return p(ctx.el, ...args) as T
}

export const datePicker = (ctx: HandleCtx) => ({
  getValue: () => ctx.el?.getAttribute('data-value') ?? String(ctx.getProp('value') ?? ''),
  setValue: (v: string) => {
    ctx.setProp('value', v)
    return ctx.el?.getAttribute('data-value') ?? ''
  },
  clear: () => ctx.setProp('value', ''),
  open: () => call(ctx, 'dpOpen'),
  close: () => call(ctx, 'dpClose'),
  isOpen: () => ctx.el?.getAttribute('data-open') === 'true',
})

export const dateRange = (ctx: HandleCtx) => ({
  getValue: () => ({ start: ctx.el?.getAttribute('data-start') ?? '', end: ctx.el?.getAttribute('data-end') ?? '' }),
  /** Set both ends (`YYYY-MM-DD`); swapped if reversed. Emits `changed` once. */
  setValue: (start: string, end: string) => {
    const out = call<{ start: string; end: string }>(ctx, 'drSet', start, end) ?? { start: '', end: '' }
    ctx.meta.props['start'] = out.start
    ctx.meta.props['end'] = out.end
    return out
  },
  clear: () => {
    call(ctx, 'drSet', '', '', false)
    ctx.meta.props['start'] = ''
    ctx.meta.props['end'] = ''
  },
  open: () => call(ctx, 'dpOpen'),
  close: () => call(ctx, 'dpClose'),
  isOpen: () => ctx.el?.getAttribute('data-open') === 'true',
})

export const radioGroup = (ctx: HandleCtx) => ({
  getValue: () => ctx.el?.getAttribute('data-value') ?? String(ctx.getProp('value') ?? ''),
  setValue: (v: string) => {
    ctx.setProp('value', v)
    return ctx.el?.getAttribute('data-value') ?? ''
  },
  setOptions: (options: unknown[]) => {
    ctx.setProp('options', options)
    call(ctx, 'rgOptions', options)
  },
})

export const pagination = (ctx: HandleCtx) => {
  const page = () => Number(ctx.el?.getAttribute('data-page') ?? ctx.getProp('page') ?? 1)
  const pages = () => Number(ctx.el?.getAttribute('data-pages') ?? 1)
  const go = (n: number) => {
    ctx.setProp('page', n)
    return page()
  }
  return {
    getPage: page,
    getPages: pages,
    setPage: go,
    next: () => go(page() + 1),
    prev: () => go(page() - 1),
    /** Change the item count (or page count); the current page is clamped. */
    setTotal: (total: number, pageSize?: number) => {
      const size = Math.max(1, Math.floor(Number(pageSize ?? ctx.getProp('pageSize') ?? 10)))
      const count = Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / size))
      ctx.setProp('total', total)
      if (pageSize !== undefined) ctx.setProp('pageSize', pageSize)
      call(ctx, 'pgPaint', Math.min(page(), count), count)
      ctx.setProp('page', page())
    },
  }
}

export const collapsible = (ctx: HandleCtx) => {
  const set = (open: boolean) => ctx.setProp('open', open)
  return {
    open: () => set(true),
    close: () => set(false),
    toggle: () => set(ctx.el?.getAttribute('data-open') !== 'true'),
    isOpen: () => ctx.el?.getAttribute('data-open') === 'true',
  }
}

export const carousel = (ctx: HandleCtx) => {
  const index = () => Number(ctx.el?.getAttribute('data-index') ?? ctx.getProp('index') ?? 0)
  const go = (i: number) => {
    ctx.setProp('index', i)
    return index()
  }
  return {
    getIndex: index,
    count: () => Number(ctx.el?.getAttribute('data-count') ?? 0),
    goTo: go,
    next: () => go(index() + 1),
    prev: () => go(index() - 1),
  }
}

export const colorPicker = (ctx: HandleCtx) => ({
  getValue: () => ctx.el?.getAttribute('data-value') ?? String(ctx.getProp('value') ?? ''),
  setValue: (v: string) => {
    ctx.setProp('value', v)
    return ctx.el?.getAttribute('data-value') ?? ''
  },
})

export const contextMenu = (ctx: HandleCtx) => ({
  /** Open at viewport coordinates (defaults to the object's top-left). */
  open: (x?: number, y?: number) => {
    const r = ctx.el?.getBoundingClientRect()
    call(ctx, 'cmOpen', x ?? r?.left ?? 0, y ?? r?.top ?? 0)
  },
  close: () => call(ctx, 'cmClose'),
  isOpen: () => ctx.el?.getAttribute('data-open') === 'true',
  setItems: (items: unknown[]) => {
    ctx.setProp('items', items)
    call(ctx, 'cmItems', items)
  },
})

export const commandPalette = (ctx: HandleCtx) => ({
  open: () => call(ctx, 'cpaOpen'),
  close: () => call(ctx, 'cpaClose'),
  toggle: () => call(ctx, ctx.el?.getAttribute('data-open') === 'true' ? 'cpaClose' : 'cpaOpen'),
  isOpen: () => ctx.el?.getAttribute('data-open') === 'true',
  setItems: (items: unknown[]) => {
    ctx.setProp('items', items)
    call(ctx, 'cpaItems', items)
  },
})

export const qrCode = (ctx: HandleCtx) => ({
  getValue: () => String(ctx.getProp('value') ?? ''),
  /** Re-encodes and repaints. */
  setValue: (text: string) => ctx.setProp('value', String(text ?? '')),
})

const BY_KIND: Record<string, (ctx: HandleCtx) => Record<string, unknown>> = {
  datePicker,
  dateRange,
  radioGroup,
  pagination,
  collapsible,
  carousel,
  colorPicker,
  qrCode,
  contextMenu,
  commandPalette,
}

export function extendWave3(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
