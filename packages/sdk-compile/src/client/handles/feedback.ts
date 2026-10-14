/**
 * Feedback handle methods: badge, alert, progress, avatar, separator, skeleton, toast.
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
    /** What the × does: hide, and say so. */
    dismiss: () => {
      setShown(false)
      ctx.emit('dismissed', {})
    },
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

/**
 * Paint a progress value onto its element — fill width, aria, label. Shared
 * by setValue and the generic set() path, so the two can never disagree.
 * Percent-based like the compile template (aria-valuenow 0-100).
 */
export function paintProgressValue(el: HTMLElement, value: number, max: number): void {
  const safe = max > 0 ? max : 100
  const clamped = Math.max(0, Math.min(safe, Number(value) || 0))
  const pct = Math.round((clamped / safe) * 100)
  const fill = el.querySelector<HTMLElement>('[data-part="fill"]')
  if (fill) fill.style.width = `${pct}%`
  el.setAttribute('aria-valuenow', String(pct))
  el.setAttribute('aria-valuemax', '100')
  const label = el.querySelector('[data-part="label"]')
  if (label) label.textContent = `${pct}%`
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
    paintProgressValue(ctx.el, clamped, max())
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

function toastMethods(ctx: HandleCtx): Record<string, unknown> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let seq = 0
  const maxToasts = (): number => {
    const m = Number(ctx.getProp('max') ?? 5)
    return Number.isFinite(m) && m > 0 ? Math.floor(m) : 5
  }
  const defaultDuration = (): number => {
    const d = Number(ctx.getProp('duration') ?? 4000)
    return Number.isFinite(d) && d >= 0 ? d : 4000
  }
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const remove = (id: string): void => {
    const t = timers.get(id)
    if (t) clearTimeout(t)
    timers.delete(id)
    // Ids are `t<base36><seq>` — always selector-safe, no escaping needed.
    ctx.el?.querySelector(`[data-toast-id="${id}"]`)?.remove()
  }
  return {
    notify: (opts: { title?: string; description?: string; variant?: string; duration?: number }): string => {
      if (!ctx.el) return ''
      const id = `t${Date.now().toString(36)}${(seq += 1)}`
      const variant = typeof opts?.variant === 'string' ? opts.variant : 'info'
      const node = document.createElement('div')
      node.setAttribute('data-part', 'toast')
      node.setAttribute('data-toast-id', id)
      node.setAttribute('data-variant', variant)
      node.setAttribute('role', 'status')
      node.innerHTML =
        `<div data-part="toast-title">${esc(String(opts?.title ?? ''))}</div>` +
        (opts?.description ? `<div data-part="toast-description">${esc(String(opts.description))}</div>` : '') +
        '<button type="button" data-part="toast-dismiss" aria-label="Dismiss">×</button>'
      ctx.el.appendChild(node)
      // Cap: oldest dismissed first (list-append precedent — the store is the DOM).
      const kids = ctx.el.querySelectorAll('[data-part="toast"]')
      while (kids.length > maxToasts()) {
        const first = kids[0] as Element
        const fid = first.getAttribute('data-toast-id') ?? ''
        if (fid) remove(fid)
        else first.remove()
        break
      }
      const lifetime = typeof opts?.duration === 'number' ? opts.duration : defaultDuration()
      if (lifetime > 0) {
        timers.set(
          id,
          setTimeout(() => remove(id), lifetime),
        )
      }
      ctx.emit('notified', { id, variant })
      return id
    },
    dismiss: (id?: string) => {
      if (id === undefined) {
        for (const key of [...timers.keys()]) remove(key)
        ctx.el?.querySelectorAll('[data-part="toast"]')?.forEach((n) => n.remove())
        return
      }
      remove(String(id))
      ctx.emit('dismissed', { id: String(id) })
    },
    clear: () => {
      for (const key of [...timers.keys()]) {
        const t = timers.get(key)
        if (t) clearTimeout(t)
      }
      timers.clear()
      if (ctx.el) ctx.el.innerHTML = ''
    },
    count: () => ctx.el?.querySelectorAll('[data-part="toast"]').length ?? 0,
  }
}

function separatorMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    setOrientation: (orientation: string) => {
      ctx.setProp('orientation', orientation)
      ctx.el?.setAttribute('data-prop-orientation', String(orientation))
    },
    setVariant: (variant: string) => {
      ctx.setProp('variant', variant)
      ctx.el?.setAttribute('data-variant', String(variant))
    },
  }
}

function skeletonMethods(ctx: HandleCtx): Record<string, unknown> {
  const dim = (v: unknown): string | null => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v === 'number') return `${v * 4}px`
    return String(v)
  }
  return {
    setSize: (width: string | number, height?: string | number) => {
      ctx.setProp('width', width)
      if (height !== undefined) ctx.setProp('height', height)
      if (!ctx.el) return
      const w = dim(width)
      const h = dim(height)
      if (w) ctx.el.style.width = w
      if (h) ctx.el.style.height = h
    },
    setAnimate: (on: boolean) => {
      ctx.setProp('animate', on)
      if (!ctx.el) return
      if (on) ctx.el.removeAttribute('data-animate')
      else ctx.el.setAttribute('data-animate', 'false')
    },
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
      if (!ctx.el) return
      const off = status === null || status === undefined || status === '' || status === 'none'
      let dot = ctx.el.querySelector('[data-part="status"]')
      if (off) {
        dot?.remove()
        return
      }
      if (!dot) {
        dot = document.createElement('span')
        dot.setAttribute('data-part', 'status')
        ctx.el.appendChild(dot)
      }
      dot.setAttribute('data-status', String(status))
      dot.setAttribute('title', String(status))
    },
  }
}

const BY_KIND: Record<string, (ctx: HandleCtx) => Record<string, unknown>> = {
  badge: badgeMethods,
  alert: alertMethods,
  progress: progressMethods,
  avatar: avatarMethods,
  separator: separatorMethods,
  skeleton: skeletonMethods,
  toast: toastMethods,
}

export function extendFeedback(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
