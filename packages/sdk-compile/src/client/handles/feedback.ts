/**
 * Feedback handle methods: badge, alert, progress, avatar, separator, skeleton.
 */
import { extend, type HandleCtx } from './shared'

function badgeMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    setLabel: (label: string) => {
      ctx.setProp('label', label)
      ctx.setProp('content', label)
      if (ctx.el) ctx.el.textContent = String(label ?? '')
    },
    setVariant: (variant: string) => {
      ctx.setProp('variant', variant)
      if (ctx.el) ctx.el.setAttribute('data-variant', String(variant))
    },
    setDot: (on: boolean) => {
      ctx.setProp('dot', on)
      if (!ctx.el) return
      if (on) {
        if (!ctx.el.querySelector('[data-part="dot"]')) {
          const span = document.createElement('span')
          span.setAttribute('data-part', 'dot')
          ctx.el.prepend(span)
        }
      } else {
        ctx.el.querySelector('[data-part="dot"]')?.remove()
      }
    },
  }
}

function alertMethods(ctx: HandleCtx): Record<string, unknown> {
  const setShown = (shown: boolean): void => {
    ctx.setProp('visible', shown)
    if (ctx.el) ctx.el.style.display = shown ? '' : 'none'
  }
  return {
    show: (message?: string) => {
      if (message !== undefined) {
        ctx.setProp('message', message)
        const body = ctx.el?.querySelector('[data-part="message"]')
        if (body) body.textContent = String(message)
      }
      setShown(true)
    },
    hide: () => setShown(false),
    isVisible: () => ctx.el?.style.display !== 'none',
    setVariant: (variant: string) => {
      ctx.setProp('variant', variant)
      if (ctx.el) ctx.el.setAttribute('data-variant', String(variant))
    },
    setMessage: (message: string) => {
      ctx.setProp('message', message)
      const body = ctx.el?.querySelector('[data-part="message"]')
      if (body) body.textContent = String(message)
    },
  }
}

function progressMethods(ctx: HandleCtx): Record<string, unknown> {
  const max = (): number => {
    const v = ctx.getProp('max')
    return typeof v === 'number' && v > 0 ? v : 100
  }
  const setValue = (value: number): void => {
    const clamped = Math.max(0, Math.min(max(), Number(value) || 0))
    ctx.setProp('value', clamped)
    ctx.setProp('percent', Math.round((clamped / max()) * 100))
    if (!ctx.el) return
    const fill = ctx.el.querySelector<HTMLElement>('[data-part="fill"]')
    if (fill) fill.style.width = `${(clamped / max()) * 100}%`
    ctx.el.setAttribute('aria-valuenow', String(clamped))
    const label = ctx.el.querySelector('[data-part="label"]')
    if (label) label.textContent = String(clamped)
  }
  return {
    setValue,
    setProgress: setValue,
    getValue: () => Number(ctx.getProp('value') ?? 0),
    increment: (delta = 1) => setValue(Number(ctx.getProp('value') ?? 0) + delta),
    decrement: (delta = 1) => setValue(Number(ctx.getProp('value') ?? 0) - delta),
    reset: () => setValue(0),
  }
}

function avatarMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    setSrc: (src: string) => {
      ctx.setProp('src', src)
      const img = ctx.el?.querySelector<HTMLImageElement>('[data-part="image"]')
      if (img) {
        img.src = String(src)
        img.setAttribute('data-loaded', 'true')
      }
    },
    setName: (name: string) => {
      ctx.setProp('name', name)
      const initials = ctx.el?.querySelector('[data-part="initials"]')
      if (initials) {
        const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
        initials.textContent = parts.length > 1 ? (parts[0]![0]! + parts[parts.length - 1]![0]!) : (parts[0]?.slice(0, 2) ?? '')
      }
    },
    setStatus: (status: string) => {
      ctx.setProp('status', status)
      const dot = ctx.el?.querySelector('[data-part="status"]')
      if (dot) dot.setAttribute('data-status', String(status))
    },
  }
}

const BY_KIND: Record<string, (ctx: HandleCtx) => Record<string, unknown>> = {
  badge: badgeMethods,
  alert: alertMethods,
  progress: progressMethods,
  avatar: avatarMethods,
}

export function extendFeedback(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
